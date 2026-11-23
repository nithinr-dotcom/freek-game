import {
  MONSTERS, MAX_MONSTERS, HARPOON_DAMAGE, HARPOON_COOLDOWN_MS, HARPOON_RANGE, WORLD_RADIUS, DOCK_POS, DOCK_RADIUS,
  rollFish, zoneAt, type C2S, type MonsterKind, type FishCardS, type SquadId, type Tier,
} from "@freek/shared";
import { Monster, type Player } from "../schema/State.js";
import type { OceanRoom } from "../rooms/OceanRoom.js";
import type { PlayerRuntime } from "../rooms/types.js";
import { FIRST_MONSTER_MS, MONSTER_EVERY, DEV_FAST, STUN_MS, dirX, dirZ, rand, num } from "../config.js";

/** Hit circle radius per monster kind (harpoon hit test). */
export const MONSTER_HIT_RADIUS: Record<MonsterKind, number> = { serpent: 5, kraken: 9 };
/** Players this close to the dock are in the safe harbor: never targeted or damaged. */
export const SAFE_HARBOR_R = DOCK_RADIUS + 12;
const AGGRO_R = 220;
const LEASH_R = 320;
const MAX_LIFETIME_MS = 6 * 60_000;
const SERPENT_ORBIT_R = 12;
const LUNGE_MS = 600;
const KRAKEN_SURFACE_SLAMS = 2;
const KRAKEN_SUBMERGED_MS = 5000;

interface MonsterRt {
  kind: MonsterKind;
  spawnedAt: number;
  lastNearAt: number;
  nextAttackAt: number;
  lungeEndsAt: number;
  orbit: number;
  wander: number;
  phaseEndsAt: number;
  slamsLeft: number;
  contributors: Map<string, number>;
}

let monsterSeq = 0;
const inHarbor = (x: number, z: number) => Math.hypot(x - DOCK_POS.x, z - DOCK_POS.z) <= SAFE_HARBOR_R;

/** Segment (sx,sz)->(tx,tz) vs circle; returns param t in [0,1] of first contact or null. */
export function segmentCircle(sx: number, sz: number, tx: number, tz: number, cx: number, cz: number, r: number): number | null {
  const dx = tx - sx, dz = tz - sz;
  const fx = sx - cx, fz = sz - cz;
  const a = dx * dx + dz * dz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0; // starts inside
  if (a === 0) return null;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export class MonsterSystem {
  private rt = new Map<string, MonsterRt>();
  private nextCheckAt: number;
  private firstSpawn = true;

  constructor(private room: OceanRoom) {
    this.nextCheckAt = Date.now() + FIRST_MONSTER_MS;
  }

  private alivePlayers() {
    return [...this.room.state.players.values()].filter((p) => !p.sunk);
  }

  // ---------- spawning ----------
  private trySpawn(now: number) {
    const players = this.alivePlayers();
    const abyss = players.filter((p) => zoneAt(p.x, p.z) === "abyss");
    this.nextCheckAt = now + MONSTER_EVERY * (abyss.length ? 0.6 : 1);
    if (!players.length || this.room.state.monsters.size >= MAX_MONSTERS) return;
    const chance = this.firstSpawn && DEV_FAST ? 1 : abyss.length ? 0.9 : 0.5;
    if (Math.random() > chance) return;
    const target = abyss.length ? abyss[Math.floor(Math.random() * abyss.length)] : players[Math.floor(Math.random() * players.length)];
    const krakenChance = this.firstSpawn && DEV_FAST ? 0 : zoneAt(target.x, target.z) === "abyss" ? 0.45 : 0.1;
    this.firstSpawn = false;
    this.spawn(Math.random() < krakenChance ? "kraken" : "serpent", target, now);
  }

  spawn(kind: MonsterKind, near: Player, now = Date.now()) {
    const def = MONSTERS[kind];
    const a = Math.random() * Math.PI * 2;
    const d = rand(35, 50);
    let x = near.x + Math.sin(a) * d, z = near.z + Math.cos(a) * d;
    // keep out of the safe harbor and inside the world
    const r = Math.hypot(x - DOCK_POS.x, z - DOCK_POS.z);
    const minR = SAFE_HARBOR_R + 20;
    if (r < minR) {
      const ang = r > 0.01 ? Math.atan2(x - DOCK_POS.x, z - DOCK_POS.z) : a;
      x = DOCK_POS.x + Math.sin(ang) * minR; z = DOCK_POS.z + Math.cos(ang) * minR;
    }
    const r2 = Math.hypot(x, z);
    if (r2 > WORLD_RADIUS - 10) { x *= (WORLD_RADIUS - 10) / r2; z *= (WORLD_RADIUS - 10) / r2; }
    const id = `m${++monsterSeq}`;
    const m = new Monster({ id, kind, x, z, rot: Math.atan2(near.x - x, near.z - z), hp: def.hp, maxHp: def.hp, state: "chasing", targetId: near.id });
    this.room.state.monsters.set(id, m);
    this.rt.set(id, {
      kind, spawnedAt: now, lastNearAt: now, nextAttackAt: now + def.attackEveryMs, lungeEndsAt: 0,
      orbit: Math.random() * Math.PI * 2, wander: Math.random() * Math.PI * 2,
      phaseEndsAt: 0, slamsLeft: KRAKEN_SURFACE_SLAMS, contributors: new Map(),
    });
    this.room.announce({
      kind: "monster_spawn",
      text: def.boss ? `BOSS: The ${def.name} rises from the deep!` : `A ${def.name} has appeared!`,
      color: def.boss ? "#ff3d6e" : "#ff9a3d", x, z,
    });
    return m;
  }

  private despawn(id: string) {
    this.room.state.monsters.delete(id);
    this.rt.delete(id);
  }

  // ---------- AI ----------
  private pickTarget(m: Monster): Player | undefined {
    const cur = m.targetId ? this.room.state.players.get(m.targetId) : undefined;
    if (cur && !cur.sunk && !inHarbor(cur.x, cur.z) && Math.hypot(cur.x - m.x, cur.z - m.z) < AGGRO_R) return cur;
    let best: Player | undefined, bd = AGGRO_R;
    for (const p of this.room.state.players.values()) {
      if (p.sunk || inHarbor(p.x, p.z)) continue;
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private moveToward(m: Monster, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return d;
    const step = Math.min(d, speed * dt);
    let x = m.x + (dx / d) * step, z = m.z + (dz / d) * step;
    // monsters never enter the safe harbor
    const r = Math.hypot(x - DOCK_POS.x, z - DOCK_POS.z);
    if (r < SAFE_HARBOR_R) { x = DOCK_POS.x + ((x - DOCK_POS.x) / r) * SAFE_HARBOR_R; z = DOCK_POS.z + ((z - DOCK_POS.z) / r) * SAFE_HARBOR_R; }
    const rw = Math.hypot(x, z);
    if (rw > WORLD_RADIUS) { x *= WORLD_RADIUS / rw; z *= WORLD_RADIUS / rw; }
    m.x = Math.round(x * 100) / 100;
    m.z = Math.round(z * 100) / 100;
    m.rot = Math.round(Math.atan2(dx, dz) * 1000) / 1000;
    return d;
  }

  private strike(m: Monster, x: number, z: number) {
    const def = MONSTERS[m.kind as MonsterKind];
    this.room.broadcast("monsterAttack", { monsterId: m.id, x, z, radius: def.attackRadius });
    for (const p of this.room.state.players.values()) {
      if (p.sunk || inHarbor(p.x, p.z)) continue;
      if (Math.hypot(p.x - x, p.z - z) > def.attackRadius) continue;
      this.room.boats.damage(p, def.damage, m.id);
      const prt = this.room.runtime.get(p.id);
      if (prt && !p.sunk) {
        this.room.fishing.interrupt(p, prt);
        p.state = "stunned";
        prt.stunnedUntil = Date.now() + STUN_MS;
      }
    }
  }

  private updateSerpent(m: Monster, r: MonsterRt, target: Player | undefined, dt: number, now: number) {
    const def = MONSTERS.serpent;
    if (m.state === "attacking") {
      const t = target ?? (m.targetId ? this.room.state.players.get(m.targetId) : undefined);
      if (t) this.moveToward(m, t.x, t.z, def.speed * 3, dt);
      if (now >= r.lungeEndsAt) {
        this.strike(m, m.x, m.z);
        m.state = "chasing";
        r.nextAttackAt = now + def.attackEveryMs;
      }
      return;
    }
    if (!target) { this.roam(m, r, def.speed, dt); return; }
    m.state = "chasing";
    m.targetId = target.id;
    r.orbit += 0.7 * dt;
    const ox = target.x + Math.sin(r.orbit) * SERPENT_ORBIT_R, oz = target.z + Math.cos(r.orbit) * SERPENT_ORBIT_R;
    this.moveToward(m, ox, oz, def.speed * 1.6, dt);
    const dist = Math.hypot(target.x - m.x, target.z - m.z);
    if (now >= r.nextAttackAt && dist < 25) {
      m.state = "attacking";
      r.lungeEndsAt = now + LUNGE_MS;
    }
  }

  private updateKraken(m: Monster, r: MonsterRt, target: Player | undefined, dt: number, now: number) {
    const def = MONSTERS.kraken;
    if (m.state === "submerged") {
      if (target) {
        m.targetId = target.id;
        const d = this.moveToward(m, target.x + Math.sin(r.orbit) * 6, target.z + Math.cos(r.orbit) * 6, def.speed * 1.5, dt);
        if (d > 3 && now < r.phaseEndsAt) return;
      } else {
        this.roam(m, r, def.speed, dt);
        if (now < r.phaseEndsAt) return;
      }
      // surface
      m.state = target ? "attacking" : "roaming";
      r.slamsLeft = KRAKEN_SURFACE_SLAMS;
      r.nextAttackAt = now + 1500;
      return;
    }
    if (!target) {
      m.state = "roaming";
      this.roam(m, r, def.speed * 0.5, dt);
      return;
    }
    m.state = "attacking";
    m.targetId = target.id;
    m.rot = Math.round(Math.atan2(target.x - m.x, target.z - m.z) * 1000) / 1000;
    if (now >= r.nextAttackAt) {
      // slam centred on the target if in reach, else as far toward it as tentacles go
      const dx = target.x - m.x, dz = target.z - m.z, d = Math.hypot(dx, dz);
      const reach = Math.min(d, 22);
      const sx = d > 0 ? m.x + (dx / d) * reach : m.x, sz = d > 0 ? m.z + (dz / d) * reach : m.z;
      this.strike(m, sx, sz);
      r.slamsLeft--;
      r.nextAttackAt = now + def.attackEveryMs;
      if (r.slamsLeft <= 0) {
        m.state = "submerged";
        r.orbit = Math.random() * Math.PI * 2;
        r.phaseEndsAt = now + KRAKEN_SUBMERGED_MS;
      }
    }
  }

  private roam(m: Monster, r: MonsterRt, speed: number, dt: number) {
    if (m.state !== "submerged") m.state = "roaming";
    m.targetId = "";
    r.wander += rand(-0.6, 0.6) * dt;
    this.moveToward(m, m.x + Math.sin(r.wander) * 10, m.z + Math.cos(r.wander) * 10, speed * 0.5, dt);
  }

  update(dtMs: number, now: number) {
    if (now >= this.nextCheckAt) this.trySpawn(now);
    const dt = dtMs / 1000;
    for (const [id, m] of this.room.state.monsters) {
      const r = this.rt.get(id);
      if (!r) continue;
      let near = false;
      for (const p of this.room.state.players.values()) if (Math.hypot(p.x - m.x, p.z - m.z) < LEASH_R) { near = true; break; }
      if (near) r.lastNearAt = now;
      if (now - r.lastNearAt > 30_000 || now - r.spawnedAt > MAX_LIFETIME_MS) { this.despawn(id); continue; }
      const target = this.pickTarget(m);
      if (r.kind === "serpent") this.updateSerpent(m, r, target, dt, now);
      else this.updateKraken(m, r, target, dt, now);
    }
  }

  // ---------- harpoons ----------
  harpoon(p: Player, rt: PlayerRuntime, msg: C2S["harpoon"]) {
    if (p.sunk) return;
    const now = Date.now();
    if (now - rt.lastHarpoonAt < HARPOON_COOLDOWN_MS - 60) return;
    rt.lastHarpoonAt = now;
    let tx = num(msg?.tx, p.x + dirX(p.rot)), tz = num(msg?.tz, p.z + dirZ(p.rot));
    let dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.01) { dx = dirX(p.rot); dz = dirZ(p.rot); d = 1; }
    const len = Math.min(d, HARPOON_RANGE);
    tx = p.x + (dx / d) * len; tz = p.z + (dz / d) * len;

    let hit: Monster | undefined, bestT = Infinity;
    for (const m of this.room.state.monsters.values()) {
      if (m.state === "submerged" || m.hp <= 0) continue;
      const t = segmentCircle(p.x, p.z, tx, tz, m.x, m.z, MONSTER_HIT_RADIUS[m.kind as MonsterKind] + 1);
      if (t !== null && t < bestT) { bestT = t; hit = m; }
    }
    if (!hit) {
      this.room.broadcast("harpoonFx", { from: p.id, sx: p.x, sz: p.z, tx, tz });
      return;
    }
    const dmg = HARPOON_DAMAGE(p.level);
    const ix = p.x + (tx - p.x) * bestT, iz = p.z + (tz - p.z) * bestT;
    hit.hp = Math.max(0, hit.hp - dmg);
    const r = this.rt.get(hit.id);
    if (r) r.contributors.set(p.id, (r.contributors.get(p.id) ?? 0) + dmg);
    this.room.broadcast("harpoonFx", { from: p.id, sx: p.x, sz: p.z, tx: ix, tz: iz, hitMonster: hit.id, dmg });
    this.room.missions.event(p, { type: "harpoon_hit" });
    if (hit.hp <= 0) this.kill(hit, p);
  }

  private kill(m: Monster, killer: Player) {
    const kind = m.kind as MonsterKind;
    const def = MONSTERS[kind];
    const r = this.rt.get(m.id);
    const contributors = r ? [...r.contributors.keys()] : [killer.id];
    this.despawn(m.id);
    this.room.announce({
      kind: "monster_kill", text: `${killer.name} and ${contributors.length - 1 > 0 ? `${contributors.length - 1} others` : "no one else"} slew the ${def.name}!`,
      color: "#ffd23f", playerId: killer.id, x: m.x, z: m.z,
    });
    const zone = zoneAt(m.x, m.z);
    const squads = new Set<SquadId>();
    for (const sid of contributors) {
      const p = this.room.state.players.get(sid);
      if (!p) continue;
      squads.add(p.squad as SquadId);
      this.room.addXp(p, def.xp);
      const fish = rollFish({ zone, rodLevel: Math.min(10, p.level), storm: this.room.state.storm, forceMinTier: def.lootMinTier as Tier });
      const card: FishCardS = { speciesId: fish.species.id, tier: fish.species.tier, weightKg: fish.weightKg, points: fish.points, at: Date.now(), catcher: p.name };
      this.room.addCard(p, card);
      this.room.sendTo(p.id, "monsterLoot", { monsterId: m.id, cards: [card] });
      this.room.missions.playerEvent(p, { type: "monster_kill" });
    }
    for (const sq of squads) {
      const s = this.room.state.squads.get(sq);
      if (!s) continue;
      s.points += def.squadPoints;
      s.kills += 1;
      this.room.missions.squadEvent(s, { type: "monster_kill" });
    }
  }

  removePlayer(id: string) {
    for (const r of this.rt.values()) r.contributors.delete(id);
  }
}

