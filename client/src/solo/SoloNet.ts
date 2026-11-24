/**
 * Single-player "server" running in the browser. Implements GameNet so the game code is the same
 * for solo and multiplayer. Owns wind, storms, monsters (timers + AI), fishing outcomes, damage,
 * sinking, banking, missions, xp/levels, trophies and the solo Hall of Fame. Persists to SoloSave.
 */
import {
  DOCK_POS, DOCK_RADIUS, RESPAWN_MS, BOAT_MAX_HP, CAST_MAX_DIST, BITE_WINDOW_MS, HARPOON_RANGE, MONSTERS, HARPOON_DAMAGE,
  MISSION_POOL, MAX_MONSTERS, STORM_EVERY_MS, STORM_DURATION_MS, missionTarget, zoneAt, levelFromXp, TIER_INFO, tierRank,
  type C2S, type S2C, type StateShape, type PlayerS, type MonsterS, type SquadS, type SquadId, type FishCardS, type MonsterKind,
  type MissionS, type Tier, type ZoneId,
} from "@freek/shared";
import type { GameNet } from "../game/types";
import { applyEvent, soloRollFish, type ProgressEvent } from "./progress";
import { writeSave, sortCards, type SoloSave } from "./save";

type Handler = (p: any) => void;

export interface SoloHooks {
  onProgress?: (ev: ProgressEvent) => void;
  onSunk?: () => void;
  onMonsterSurface?: (m: MonsterS, boss: boolean) => void;
}

interface MonsterAI {
  scripted: boolean; boss: boolean;
  nextAttack: number; attacks: number;
  roamX: number; roamZ: number;
  farFor: number; resurfaceAt: number;
  hitters: boolean;
}

const SPAWN_CHECK_MS = 12_000;

export class SoloNet implements GameNet {
  readonly offline = true;
  readonly solo = true;
  readonly sessionId = "me";
  readonly code = "SOLO";
  readonly isPrivate = true;
  readonly state: StateShape;
  hooks: SoloHooks = {};
  paused = false;
  /** zones the player may enter (campaign); monsters only spawn in open zones */
  zonesOpen: Record<ZoneId, boolean> = { shallows: true, reef: true, abyss: true };
  /** extra legendary weight from the campaign (chapter 6) */
  legendaryBoost = 1;
  /** campaign can disable random kraken spawns (boss chapter spawns its own) */
  randomKraken = true;
  randomMonsters = true;
  tutorial = false;

  private handlers = new Map<string, Handler[]>();
  private addM: ((m: MonsterS, id: string) => void)[] = [];
  private remM: ((m: MonsterS, id: string) => void)[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private now = Date.now();
  private pending: { card: FishCardS } | null = null;
  private biteOpenUntil = 0;
  private gustUntil = 0;
  private nextGustAt = 0;
  private monsterSeq = 0;
  private ai = new Map<string, MonsterAI>();
  private nextSpawnCheck = 0;
  private lastSpawnAt = -1e12;
  private saveTimer = 0;
  private wasInRing = true;

  constructor(public readonly save: SoloSave) {
    const lv = levelFromXp(save.xp).level;
    const me: PlayerS = {
      id: "me", name: save.name, squad: "tide", x: DOCK_POS.x, z: DOCK_POS.z - 6, rot: 0, speed: 0, hp: BOAT_MAX_HP, sunk: false,
      state: "sailing", bobX: 0, bobZ: 0, level: lv, xp: save.xp, coins: save.coins, unbankedPoints: 0, bankedPoints: save.bankedPoints,
      unbanked: [], trophies: save.trophies.slice(), missions: [], catches: save.catches,
    };
    me.missions = save.missions.length === 3 ? save.missions.map((m) => ({ ...m })) : [];
    while (me.missions.length < 3) me.missions.push(this.randomMission(me.missions));
    const squads = new Map<SquadId, SquadS>();
    squads.set("tide", { id: "tide", points: save.bankedPoints, missions: [], kills: 0 });
    this.state = {
      code: this.code, players: new Map([["me", me]]), squads, monsters: new Map(),
      wind: { dirRad: 0.6, speed: 0.35, gust: false }, storm: false, stormEndsAt: 0, nextStormAt: this.now + STORM_EVERY_MS, serverTime: this.now,
    };
    this.nextGustAt = this.now + 20_000 + Math.random() * 20_000;
    this.nextSpawnCheck = this.now + 20_000;
    setTimeout(() => this.emit("hallOfFame", { entries: this.save.hof }), 50);
  }

  get me(): PlayerS { return this.state.players.get("me")!; }
  /** delivered asynchronously (like a real server), preserving order */
  emit<K extends keyof S2C>(type: K, p: S2C[K]) { queueMicrotask(() => { for (const h of this.handlers.get(type) ?? []) h(p); }); }
  private later(ms: number, fn: () => void) { this.timers.push({ at: this.now + ms, fn }); }

  on<K extends keyof S2C>(type: K, cb: (p: S2C[K]) => void) {
    const l = this.handlers.get(type) ?? [];
    l.push(cb as Handler);
    this.handlers.set(type, l);
  }
  onPlayerAdd(cb: (p: PlayerS, id: string) => void) { this.state.players.forEach((p, id) => cb(p, id)); }
  onPlayerRemove() {}
  onMonsterAdd(cb: (m: MonsterS, id: string) => void) { this.addM.push(cb); this.state.monsters.forEach((m, id) => cb(m, id)); }
  onMonsterRemove(cb: (m: MonsterS, id: string) => void) { this.remM.push(cb); }
  onDisconnect() {}
  leave() { this.persist(); }

  // ---------------------------------------------------------------- persistence
  persist() {
    const me = this.me, s = this.save;
    s.name = me.name; s.xp = me.xp; s.level = me.level; s.coins = me.coins; s.catches = me.catches;
    s.bankedPoints = me.bankedPoints; s.trophies = me.trophies.slice(); s.missions = me.missions.map((m) => ({ ...m }));
    writeSave(s);
  }

  // ---------------------------------------------------------------- world control (campaign + dev)
  get storming() { return this.state.storm; }
  forceStorm(inMs = 0) {
    if (this.state.storm) return;
    this.state.nextStormAt = this.now + inMs;
  }
  toggleStorm() {
    if (this.state.storm) this.endStorm();
    else this.state.nextStormAt = this.now;
  }
  gust() { this.gustUntil = this.now + 4000; }
  hasMonster(kind?: MonsterKind) {
    let found = false;
    this.state.monsters.forEach((m) => { if (!kind || m.kind === kind) found = true; });
    return found;
  }

  spawnMonster(kind: MonsterKind, opts: { scripted?: boolean; boss?: boolean; dist?: number } = {}): MonsterS {
    const me = this.me;
    const id = `m${++this.monsterSeq}`;
    // spawn ahead-ish of the player, away from the dock
    let x = 0, z = 0;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = opts.dist ?? 45;
      x = me.x + Math.cos(a) * d; z = me.z + Math.sin(a) * d;
      const r = Math.hypot(x - DOCK_POS.x, z - DOCK_POS.z);
      const zone = zoneAt(x, z);
      if (r > 45 && r < 440 && this.zonesOpen[zone] && (kind !== "kraken" || zone === "abyss" || opts.scripted)) break;
    }
    const spec = MONSTERS[kind];
    const m: MonsterS = { id, kind, x, z, rot: Math.atan2(me.x - x, me.z - z), hp: spec.hp, maxHp: spec.hp, state: "submerged", targetId: "me" };
    this.state.monsters.set(id, m);
    this.ai.set(id, { scripted: !!opts.scripted, boss: !!opts.boss || spec.boss, nextAttack: this.now + 5000, attacks: 0, roamX: x, roamZ: z, farFor: 0, resurfaceAt: this.now + 1800, hitters: false });
    for (const cb of this.addM) cb(m, id);
    this.emit("announce", { kind: "monster_spawn", text: `${spec.name} has appeared!`, color: "#ff4d4d", x, z });
    this.lastSpawnAt = this.now;
    return m;
  }

  private removeMonster(m: MonsterS) {
    if (!this.state.monsters.has(m.id)) return;
    this.state.monsters.delete(m.id);
    this.ai.delete(m.id);
    for (const cb of this.remM) cb(m, m.id);
  }

  // ---------------------------------------------------------------- C2S
  send<K extends keyof C2S>(type: K, payload: C2S[K]) {
    const me = this.me;
    const p = payload as any;
    switch (type) {
      case "move":
        if (me.sunk) return;
      {
        me.x = p.x; me.z = p.z; me.rot = p.rot; me.speed = p.speed;
        // banking: sail into the ring (or sail around inside it); fishing while parked in the ring keeps the catch
        const inRing = Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z) < DOCK_RADIUS;
        if (inRing && me.unbanked.length && (!this.wasInRing || Math.abs(me.speed) > 4)) this.bank();
        this.wasInRing = inRing;
        break;
      }
      case "setSquad": break;
      case "cast": {
        if (me.state !== "sailing" || me.sunk) return;
        me.state = "casting";
        const dist = 6 + Math.max(0, Math.min(1, p.power)) * (CAST_MAX_DIST - 6);
        const w = this.state.wind;
        this.later(350, () => {
          if (me.state !== "casting") return;
          me.bobX = me.x + Math.sin(p.aimRad) * dist + Math.sin(w.dirRad) * w.speed * 4;
          me.bobZ = me.z + Math.cos(p.aimRad) * dist + Math.cos(w.dirRad) * w.speed * 4;
          me.state = "waiting";
          const delay = this.tutorial ? 1500 + Math.random() * 2000 : 2000 + Math.random() * 4500;
          this.later(delay, () => {
            if (me.state !== "waiting") return;
            me.state = "hooked";
            const win = this.tutorial ? BITE_WINDOW_MS + 600 : BITE_WINDOW_MS;
            this.biteOpenUntil = this.now + win + 200;
            this.emit("bite", { windowMs: win });
            this.later(win + 250, () => {
              if (me.state === "hooked") { me.state = "sailing"; this.emit("hookResult", { ok: false }); }
            });
          });
        });
        break;
      }
      case "hook": {
        if (me.state !== "hooked" || this.now > this.biteOpenUntil) return;
        const zone = zoneAt(me.x, me.z);
        const f = soloRollFish({ zone, rodLevel: me.level, storm: this.state.storm, legendaryMult: this.legendaryMult });
        const card: FishCardS = { speciesId: f.species.id, tier: f.species.tier, weightKg: f.weightKg, points: f.points, at: Date.now(), catcher: me.name };
        const diff = TIER_INFO[card.tier].difficulty;
        const durationMs = Math.round(5000 + diff * 6000);
        this.pending = { card };
        me.state = "reeling";
        this.emit("hookResult", { ok: true, tier: card.tier, difficulty: diff, durationMs });
        break;
      }
      case "reelResult": {
        const pend = this.pending;
        this.pending = null;
        if (me.state === "reeling") me.state = "sailing";
        if (!pend) return;
        if (!p.success) { this.emit("lineSnap", {}); return; }
        this.landFish(pend.card, p.maxTension < 0.5);
        break;
      }
      case "cancelFishing":
        if (!me.sunk) me.state = "sailing";
        this.pending = null;
        break;
      case "harpoon": this.harpoon(p.tx, p.tz); break;
      case "chat": break;
      case "reel": break;
    }
  }

  get legendaryMult() { return (this.save.unlocks.legendaryRod ? 1.8 : 1) * this.legendaryBoost; }
  get harpoonDamage() { return HARPOON_DAMAGE(this.me.level) + (this.save.unlocks.harpoonUpgrade ? 10 : 0); }

  private landFish(card: FishCardS, perfect: boolean) {
    const me = this.me;
    const zone = zoneAt(me.x, me.z);
    const best = me.trophies[0];
    me.unbanked.push(card);
    me.unbankedPoints += card.points;
    me.catches++;
    const newBest = !best || tierRank(card.tier) > tierRank(best.tier) || (card.tier === best.tier && card.points > best.points);
    me.trophies = sortCards([...me.trophies, card]).slice(0, 10);
    const xp = card.points * 2;
    this.emit("catch", { card, zone, perfect, xp, newBest });
    this.addXp(xp);
    if (card.tier === "legendary" || card.tier === "epic") {
      this.emit("announce", { kind: card.tier, text: `${me.name} landed a ${TIER_INFO[card.tier].label.toUpperCase()} catch!`, color: TIER_INFO[card.tier].color, playerId: "me", x: me.x, z: me.z });
    }
    this.save.hof = sortCards([...this.save.hof, card]).slice(0, 20);
    this.emit("hallOfFame", { entries: this.save.hof });
    this.progress({ t: "catch", card, zone, perfect, storm: this.state.storm });
    this.persist();
  }

  addXp(xp: number) {
    const me = this.me;
    const before = levelFromXp(me.xp).level;
    me.xp += xp;
    const after = levelFromXp(me.xp).level;
    me.level = after;
    if (after > before) this.emit("levelUp", { level: after });
  }
  addCoins(n: number) { this.me.coins += n; }

  private randomMission(active: MissionS[]): MissionS {
    const pool = MISSION_POOL.filter((m) => !m.squad && !active.some((a) => a.id === m.id) && this.missionPossible(m.kind.type, (m.kind as any).zone));
    const t = pool[Math.floor(Math.random() * pool.length)] ?? MISSION_POOL[0];
    return { id: t.id, title: t.title, progress: 0, target: missionTarget(t.kind), squad: false };
  }
  /** replace missions that can't be done with the zones currently open */
  rerollImpossibleMissions() {
    const me = this.me;
    me.missions = me.missions.map((ms) => {
      const tpl = MISSION_POOL.find((m) => m.id === ms.id);
      return tpl && this.missionPossible(tpl.kind.type, (tpl.kind as any).zone) ? ms : this.randomMission(me.missions);
    });
  }
  private missionPossible(type: string, zone?: ZoneId) {
    if (zone && !this.zonesOpen[zone]) return false;
    if ((type === "monster_kill" || type === "harpoon_hits") && !this.zonesOpen.reef) return false;
    return true;
  }

  /** feed an event to missions and the campaign */
  private progress(ev: ProgressEvent) {
    const me = this.me;
    me.missions.forEach((ms, i) => {
      const tpl = MISSION_POOL.find((m) => m.id === ms.id);
      if (!tpl) return;
      ms.progress = Math.min(ms.target, applyEvent(tpl.kind, ms.progress, ev));
      if (ms.progress >= ms.target) {
        this.emit("missionComplete", { title: tpl.title, xp: tpl.xp, coins: tpl.coins, squad: false });
        me.coins += tpl.coins;
        this.addXp(tpl.xp);
        me.missions[i] = this.randomMission(me.missions);
      }
    });
    this.hooks.onProgress?.(ev);
  }

  private bank() {
    const me = this.me;
    const pts = me.unbankedPoints, fish = me.unbanked.length;
    me.bankedPoints += pts;
    const sq = this.state.squads.get("tide");
    if (sq) sq.points = me.bankedPoints;
    me.unbanked = []; me.unbankedPoints = 0;
    this.emit("banked", { points: pts, fish });
    this.progress({ t: "bank", points: pts, fish });
    this.persist();
  }

  private harpoon(tx: number, tz: number) {
    const me = this.me;
    if (me.sunk) return;
    const d = Math.hypot(tx - me.x, tz - me.z);
    if (d > HARPOON_RANGE) { tx = me.x + ((tx - me.x) / d) * HARPOON_RANGE; tz = me.z + ((tz - me.z) / d) * HARPOON_RANGE; }
    let hit: MonsterS | undefined;
    this.state.monsters.forEach((m) => { if (m.state !== "submerged" && Math.hypot(m.x - tx, m.z - tz) < (m.kind === "kraken" ? 10 : 7)) hit = m; });
    const dmg = this.harpoonDamage;
    this.emit("harpoonFx", { from: "me", sx: me.x, sz: me.z, tx, tz, hitMonster: hit?.id, dmg: hit ? dmg : undefined });
    if (!hit) return;
    const m = hit;
    const ai = this.ai.get(m.id);
    if (ai) ai.hitters = true;
    this.later(250, () => {
      if (!this.state.monsters.has(m.id)) return;
      m.hp = Math.max(0, m.hp - dmg);
      this.progress({ t: "hit" });
      if (m.hp <= 0) this.killMonster(m);
    });
  }

  private killMonster(m: MonsterS) {
    const ai = this.ai.get(m.id);
    const spec = MONSTERS[m.kind];
    this.removeMonster(m);
    this.emit("announce", { kind: "monster_kill", text: `${spec.name} was slain!`, color: "#ffd24a", x: m.x, z: m.z });
    const sq = this.state.squads.get("tide");
    if (sq) sq.kills++;
    this.addXp(spec.xp);
    if (ai?.hitters) {
      const f = soloRollFish({ zone: "abyss", rodLevel: this.me.level, storm: false, legendaryMult: this.legendaryMult, forceMinTier: spec.lootMinTier as Tier });
      const card: FishCardS = { speciesId: f.species.id, tier: f.species.tier, weightKg: f.weightKg, points: f.points, at: Date.now(), catcher: this.me.name };
      this.me.unbanked.push(card);
      this.me.unbankedPoints += card.points;
      this.me.trophies = sortCards([...this.me.trophies, card]).slice(0, 10);
      this.save.hof = sortCards([...this.save.hof, card]).slice(0, 20);
      this.emit("monsterLoot", { monsterId: m.id, cards: [card] });
      this.emit("hallOfFame", { entries: this.save.hof });
    }
    this.progress({ t: "kill", kind: m.kind });
    this.persist();
  }

  private damage(amount: number, by: string) {
    const me = this.me;
    if (me.sunk) return;
    me.hp = Math.max(0, me.hp - amount);
    this.emit("damaged", { amount, hp: me.hp, byMonster: by });
    if (me.state === "waiting" || me.state === "hooked") { me.state = "sailing"; this.pending = null; }
    if (me.hp <= 0) {
      me.sunk = true;
      me.state = "sailing";
      this.pending = null;
      const lost = me.unbanked.length;
      this.emit("announce", { kind: "sunk", text: lost ? `You were sunk! ${lost} unbanked fish lost.` : "You were sunk!", playerId: "me", color: "#ff6b6b" });
      this.hooks.onSunk?.();
      // monsters lose interest and dive
      this.state.monsters.forEach((m) => { m.state = "submerged"; const ai = this.ai.get(m.id); if (ai) ai.resurfaceAt = this.now + 12_000; });
      this.later(RESPAWN_MS, () => {
        me.sunk = false; me.hp = BOAT_MAX_HP; me.unbanked = []; me.unbankedPoints = 0;
        me.x = DOCK_POS.x; me.z = DOCK_POS.z - 6; me.rot = 0; me.speed = 0; this.wasInRing = true;
        this.persist();
      });
    }
  }

  private endStorm() {
    const s = this.state;
    s.storm = false;
    s.nextStormAt = this.now + STORM_EVERY_MS;
    this.emit("announce", { kind: "storm_end", text: "The storm passes." });
  }

  // ---------------------------------------------------------------- simulation
  tick(dt: number) {
    if (this.paused) return;
    this.now += dt * 1000;
    const now = this.now;
    this.state.serverTime = now;
    const due = this.timers.filter((t) => t.at <= now);
    this.timers = this.timers.filter((t) => t.at > now);
    for (const t of due) t.fn();

    // wind + gusts
    const w = this.state.wind;
    w.dirRad += Math.sin(now / 23000) * 0.02 * dt;
    w.speed = Math.min(1, Math.max(0.1, (this.state.storm ? 0.85 : 0.35) + Math.sin(now / 9000) * 0.15));
    if (now >= this.nextGustAt) { this.gustUntil = now + 4000; this.nextGustAt = now + 20_000 + Math.random() * 20_000; }
    w.gust = now < this.gustUntil;

    // storms
    const s = this.state;
    if (!s.storm && now >= s.nextStormAt) {
      s.storm = true;
      s.stormEndsAt = now + STORM_DURATION_MS;
      this.emit("announce", { kind: "storm_start", text: "A storm rolls in! Rare fish are stirring." });
    } else if (s.storm && now >= s.stormEndsAt) this.endStorm();

    this.spawnTick();
    this.monsterTick(dt);

    this.saveTimer += dt;
    if (this.saveTimer > 30) { this.saveTimer = 0; this.persist(); }
  }

  private spawnTick() {
    const now = this.now, me = this.me;
    if (now < this.nextSpawnCheck || !this.randomMonsters) return;
    this.nextSpawnCheck = now + SPAWN_CHECK_MS;
    if (me.sunk || this.state.monsters.size >= MAX_MONSTERS) return;
    const zone = zoneAt(me.x, me.z);
    if (zone === "shallows") return;
    const gap = zone === "abyss" ? 40_000 : 65_000;
    if (now - this.lastSpawnAt < gap) return;
    if (Math.random() > (zone === "abyss" ? 0.7 : 0.45)) return;
    const kraken = zone === "abyss" && this.randomKraken && !this.hasMonster("kraken") && Math.random() < 0.35;
    this.spawnMonster(kraken ? "kraken" : "serpent", { dist: 55 });
  }

  private monsterTick(dt: number) {
    const now = this.now, me = this.me;
    this.state.monsters.forEach((m) => {
      const ai = this.ai.get(m.id);
      if (!ai) return;
      const spec = MONSTERS[m.kind];
      const dx = me.x - m.x, dz = me.z - m.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const meR = Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z);
      const safe = meR < 30;
      // despawn random monsters left far behind
      if (!ai.scripted) {
        ai.farFor = d > 240 || zoneAt(me.x, me.z) === "shallows" ? ai.farFor + dt : 0;
        if (ai.farFor > 25) { this.removeMonster(m); return; }
      } else if (d > 220) {
        // scripted monsters stalk: dive and reappear near the player
        if (m.state !== "submerged") { m.state = "submerged"; ai.resurfaceAt = now + 4000; }
      }
      if (m.state === "submerged") {
        if (now >= ai.resurfaceAt && !me.sunk && !safe) {
          if (d > 120) {
            const a = Math.random() * Math.PI * 2;
            m.x = me.x + Math.cos(a) * 50; m.z = me.z + Math.sin(a) * 50;
          }
          this.keepOutOfHarbour(m);
          m.state = "chasing";
          this.hooks.onMonsterSurface?.(m, ai.boss);
        }
        return;
      }
      if (me.sunk || safe) {
        // roam away from the harbour
        this.moveToward(m, ai.roamX, ai.roamZ, spec.speed * 0.5, dt);
        if (Math.hypot(ai.roamX - m.x, ai.roamZ - m.z) < 5) { const a = Math.random() * 6.28; ai.roamX = m.x + Math.cos(a) * 40; ai.roamZ = m.z + Math.sin(a) * 40; }
        this.keepOutOfHarbour(m);
        return;
      }
      const zoneMult = zoneAt(m.x, m.z) === "abyss" ? 1.25 : 1;
      if (d > spec.attackRadius * 0.55) {
        this.moveToward(m, me.x, me.z, spec.speed * (d > 80 ? 1.6 : 1), dt);
      } else m.rot = Math.atan2(dx, dz);
      this.keepOutOfHarbour(m);
      if (now >= ai.nextAttack && d < spec.attackRadius + 5) {
        ai.nextAttack = now + spec.attackEveryMs;
        ai.attacks++;
        m.state = "attacking";
        const ax = m.kind === "kraken" ? m.x + dx * 0.5 : me.x, az = m.kind === "kraken" ? m.z + dz * 0.5 : me.z;
        this.emit("monsterAttack", { monsterId: m.id, x: ax, z: az, radius: spec.attackRadius });
        this.later(m.kind === "kraken" ? 950 : 700, () => {
          if (!this.state.monsters.has(m.id)) return;
          if (Math.hypot(me.x - ax, me.z - az) < spec.attackRadius) this.damage(Math.round(spec.damage * zoneMult), m.id);
          if (m.state === "attacking") m.state = "chasing";
          // the kraken dives and repositions after a few slams
          if (m.kind === "kraken" && ai.attacks % 3 === 0) { m.state = "submerged"; ai.resurfaceAt = now + 6000; }
        });
      }
    });
  }

  private moveToward(m: MonsterS, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const step = Math.min(d, speed * dt);
    m.x += (dx / d) * step; m.z += (dz / d) * step;
    m.rot = Math.atan2(dx, dz);
  }
  private keepOutOfHarbour(m: MonsterS) {
    const r = Math.hypot(m.x - DOCK_POS.x, m.z - DOCK_POS.z);
    const min = 34;
    if (r < min) { const k = min / (r || 1); m.x = DOCK_POS.x + (m.x - DOCK_POS.x) * k; m.z = DOCK_POS.z + (m.z - DOCK_POS.z) * k; }
  }
}
