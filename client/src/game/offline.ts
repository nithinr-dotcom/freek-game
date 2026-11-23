/**
 * Offline sandbox (?offline=1): a tiny fake server so the world, boat, fishing loop, reveal and
 * monsters can be tested without the real server. Implements the same GameNet interface.
 * Debug keys (offline only): K storm on/off, M spawn monster, G gust.
 */
import {
  DOCK_POS, DOCK_RADIUS, RESPAWN_MS, BOAT_MAX_HP, CAST_MAX_DIST, BITE_WINDOW_MS, HARPOON_RANGE, MONSTERS, HARPOON_DAMAGE,
  SQUAD_IDS, MISSION_POOL, missionTarget, rollFish, zoneAt, levelFromXp, TIER_INFO, tierRank,
  type C2S, type S2C, type StateShape, type PlayerS, type MonsterS, type SquadS, type SquadId, type FishCardS, type MonsterKind, type MissionS, type Tier,
} from "@freek/shared";
import type { GameNet } from "./types";

type Handler = (p: any) => void;

export class OfflineNet implements GameNet {
  readonly offline = true;
  readonly sessionId = "me";
  readonly code = "OFFLN";
  readonly isPrivate = true;
  readonly state: StateShape;
  private handlers = new Map<string, Handler[]>();
  private addP: ((p: PlayerS, id: string) => void)[] = [];
  private remP: ((p: PlayerS, id: string) => void)[] = [];
  private addM: ((m: MonsterS, id: string) => void)[] = [];
  private remM: ((m: MonsterS, id: string) => void)[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private now = 0;
  private pending: { tier: Tier; card: FishCardS; hookAt: number } | null = null;
  private biteOpenUntil = 0;
  private gustUntil = 0;
  private monsterSeq = 0;
  private attackTimers = new Map<string, number>();
  private hits = new Set<string>();
  private hof: FishCardS[] = [];

  constructor(name: string) {
    const me: PlayerS = {
      id: "me", name, squad: "tide", x: DOCK_POS.x, z: DOCK_POS.z - 6, rot: 0, speed: 0, hp: BOAT_MAX_HP, sunk: false, state: "sailing",
      bobX: 0, bobZ: 0, level: 1, xp: 0, coins: 0, unbankedPoints: 0, bankedPoints: 0, unbanked: [], trophies: [], missions: [], catches: 0,
    };
    me.missions = MISSION_POOL.filter((m) => !m.squad).slice(0, 3).map((m) => ({ id: m.id, title: m.title, progress: 0, target: missionTarget(m.kind), squad: false }));
    const squads = new Map<SquadId, SquadS>();
    for (const id of SQUAD_IDS) {
      const sm = MISSION_POOL.find((m) => m.squad)!;
      squads.set(id, { id, points: id === "tide" ? 0 : Math.floor(Math.random() * 400), missions: [{ id: sm.id, title: sm.title, progress: 0, target: missionTarget(sm.kind), squad: true }], kills: 0 });
    }
    this.state = {
      code: this.code, players: new Map([["me", me]]), squads, monsters: new Map(),
      wind: { dirRad: 0.6, speed: 0.35, gust: false }, storm: false, stormEndsAt: 0, nextStormAt: Date.now() + 6 * 60_000, serverTime: Date.now(),
    };
    setTimeout(() => this.emit("hallOfFame", { entries: this.hof }), 50);
  }

  private get me(): PlayerS { return this.state.players.get("me")!; }
  private emit<K extends keyof S2C>(type: K, p: S2C[K]) { for (const h of this.handlers.get(type) ?? []) h(p); }
  private later(ms: number, fn: () => void) { this.timers.push({ at: this.now + ms, fn }); }

  on<K extends keyof S2C>(type: K, cb: (p: S2C[K]) => void) {
    const l = this.handlers.get(type) ?? [];
    l.push(cb as Handler);
    this.handlers.set(type, l);
  }
  onPlayerAdd(cb: (p: PlayerS, id: string) => void) { this.addP.push(cb); this.state.players.forEach((p, id) => cb(p, id)); }
  onPlayerRemove(cb: (p: PlayerS, id: string) => void) { this.remP.push(cb); }
  onMonsterAdd(cb: (m: MonsterS, id: string) => void) { this.addM.push(cb); this.state.monsters.forEach((m, id) => cb(m, id)); }
  onMonsterRemove(cb: (m: MonsterS, id: string) => void) { this.remM.push(cb); }
  onDisconnect() {}
  leave() {}

  // ---------------------------------------------------------------- debug
  toggleStorm() {
    const s = this.state;
    s.storm = !s.storm;
    s.stormEndsAt = Date.now() + 60_000;
    this.emit("announce", { kind: s.storm ? "storm_start" : "storm_end", text: s.storm ? "A storm rolls in! Rare fish are stirring." : "The storm passes." });
  }
  gust() { this.gustUntil = this.now + 4000; }
  spawnMonster(kind?: MonsterKind) {
    const k: MonsterKind = kind ?? (this.monsterSeq % 2 ? "kraken" : "serpent");
    const id = `m${++this.monsterSeq}`;
    const a = Math.random() * Math.PI * 2;
    const m: MonsterS = { id, kind: k, x: this.me.x + Math.cos(a) * 45, z: this.me.z + Math.sin(a) * 45, rot: 0, hp: MONSTERS[k].hp, maxHp: MONSTERS[k].hp, state: "submerged", targetId: "me" };
    this.state.monsters.set(id, m);
    for (const cb of this.addM) cb(m, id);
    this.emit("announce", { kind: "monster_spawn", text: `${MONSTERS[k].name} has appeared!`, color: "#ff4d4d", x: m.x, z: m.z });
    this.later(1500, () => { m.state = "chasing"; });
    this.attackTimers.set(id, this.now + 4000);
  }

  // ---------------------------------------------------------------- C2S
  send<K extends keyof C2S>(type: K, payload: C2S[K]) {
    const me = this.me;
    const p = payload as any;
    switch (type) {
      case "move":
        if (me.sunk) return;
        me.x = p.x; me.z = p.z; me.rot = p.rot; me.speed = p.speed;
        if (Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z) < DOCK_RADIUS && me.unbanked.length) this.bank();
        break;
      case "setSquad": me.squad = p.squad; break;
      case "cast": {
        if (me.state !== "sailing") return;
        me.state = "casting";
        const dist = 6 + p.power * (CAST_MAX_DIST - 6);
        const w = this.state.wind;
        this.later(350, () => {
          me.bobX = me.x + Math.sin(p.aimRad) * dist + Math.sin(w.dirRad) * w.speed * 4;
          me.bobZ = me.z + Math.cos(p.aimRad) * dist + Math.cos(w.dirRad) * w.speed * 4;
          me.state = "waiting";
          this.later(1500 + Math.random() * 3000, () => {
            if (me.state !== "waiting") return;
            me.state = "hooked";
            this.biteOpenUntil = this.now + BITE_WINDOW_MS + 200;
            this.emit("bite", { windowMs: BITE_WINDOW_MS });
            this.later(BITE_WINDOW_MS + 250, () => {
              if (me.state === "hooked") { me.state = "sailing"; this.emit("hookResult", { ok: false }); }
            });
          });
        });
        break;
      }
      case "hook": {
        if (me.state !== "hooked" || this.now > this.biteOpenUntil) return;
        const zone = zoneAt(me.x, me.z);
        const f = rollFish({ zone, rodLevel: me.level, storm: this.state.storm });
        const card: FishCardS = { speciesId: f.species.id, tier: f.species.tier, weightKg: f.weightKg, points: f.points, at: Date.now(), catcher: me.name };
        const diff = TIER_INFO[card.tier].difficulty;
        const durationMs = Math.round(5000 + diff * 6000);
        this.pending = { tier: card.tier, card, hookAt: this.now };
        me.state = "reeling";
        this.emit("hookResult", { ok: true, tier: card.tier, difficulty: diff, durationMs });
        break;
      }
      case "reelResult": {
        const pend = this.pending;
        this.pending = null;
        me.state = "sailing";
        if (!pend) return;
        if (!p.success) { this.emit("lineSnap", {}); return; }
        const card = pend.card;
        const prevBest = me.trophies[0];
        me.unbanked.push(card);
        me.unbankedPoints += card.points;
        me.catches++;
        const newBest = !prevBest || tierRank(card.tier) > tierRank(prevBest.tier) || (card.tier === prevBest.tier && card.points > prevBest.points);
        me.trophies = [...me.trophies, card].sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || b.points - a.points).slice(0, 5);
        const xp = card.points * 2;
        this.addXp(xp);
        this.emit("catch", { card, zone: zoneAt(me.x, me.z), perfect: p.maxTension < 0.5, xp, newBest });
        this.progressMissions(card, p.maxTension < 0.5);
        if (card.tier === "legendary" || card.tier === "epic") {
          this.emit("announce", { kind: card.tier, text: `${me.name} landed a ${TIER_INFO[card.tier].label.toUpperCase()} catch!`, color: TIER_INFO[card.tier].color, playerId: "me", x: me.x, z: me.z });
        }
        this.hof = [...this.hof, card].sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || b.weightKg - a.weightKg).slice(0, 20);
        this.emit("hallOfFame", { entries: this.hof });
        break;
      }
      case "cancelFishing": me.state = "sailing"; this.pending = null; break;
      case "harpoon": {
        let tx = p.tx, tz = p.tz;
        const d = Math.hypot(tx - me.x, tz - me.z);
        if (d > HARPOON_RANGE) { tx = me.x + ((tx - me.x) / d) * HARPOON_RANGE; tz = me.z + ((tz - me.z) / d) * HARPOON_RANGE; }
        let hit: MonsterS | undefined;
        this.state.monsters.forEach((m) => { if (m.state !== "submerged" && Math.hypot(m.x - tx, m.z - tz) < (m.kind === "kraken" ? 9 : 6)) hit = m; });
        const dmg = HARPOON_DAMAGE(me.level);
        this.emit("harpoonFx", { from: "me", sx: me.x, sz: me.z, tx, tz, hitMonster: hit?.id, dmg: hit ? dmg : undefined });
        if (hit) {
          const m = hit;
          this.hits.add(m.id);
          this.later(250, () => {
            m.hp = Math.max(0, m.hp - dmg);
            if (m.hp <= 0) this.killMonster(m);
          });
        }
        break;
      }
      case "chat": this.emit("chat", { from: me.name, text: String(p.text).slice(0, 140), squad: me.squad }); break;
    }
  }

  private addXp(xp: number) {
    const me = this.me;
    const before = levelFromXp(me.xp).level;
    me.xp += xp;
    const after = levelFromXp(me.xp).level;
    me.level = after;
    if (after > before) this.emit("levelUp", { level: after });
  }

  private progressMissions(card: FishCardS, perfect: boolean) {
    const me = this.me;
    const tpl = (id: string) => MISSION_POOL.find((m) => m.id === id)!;
    const advance = (ms: MissionS) => {
      const k = tpl(ms.id).kind;
      const zone = zoneAt(me.x, me.z);
      switch (k.type) {
        case "catch_count": ms.progress++; break;
        case "catch_tier": if (tierRank(card.tier) >= tierRank(k.tier)) ms.progress++; break;
        case "catch_zone": if (zone === k.zone) ms.progress++; break;
        case "catch_weight": if (card.weightKg >= k.kg) ms.progress = 1; break;
        case "perfect_reel": if (perfect) ms.progress++; break;
        case "storm_catch": if (this.state.storm) ms.progress++; break;
      }
    };
    me.missions.forEach((ms, i) => {
      advance(ms);
      if (ms.progress >= ms.target) {
        const t = tpl(ms.id);
        this.emit("missionComplete", { title: t.title, xp: t.xp, coins: t.coins, squad: false });
        me.coins += t.coins;
        this.addXp(t.xp);
        const pool = MISSION_POOL.filter((m) => !m.squad && !me.missions.some((x) => x.id === m.id));
        const n = pool[Math.floor(Math.random() * pool.length)];
        me.missions[i] = { id: n.id, title: n.title, progress: 0, target: missionTarget(n.kind), squad: false };
      }
    });
    const sq = this.state.squads.get(me.squad);
    if (sq) for (const ms of sq.missions) {
      advance(ms);
      if (ms.progress >= ms.target) {
        const t = tpl(ms.id);
        this.emit("missionComplete", { title: t.title, xp: t.xp, coins: t.coins, squad: true });
        ms.progress = 0;
      }
    }
  }

  private bank() {
    const me = this.me;
    const pts = me.unbankedPoints, fish = me.unbanked.length;
    me.bankedPoints += pts;
    const sq = this.state.squads.get(me.squad);
    if (sq) sq.points += pts;
    me.unbanked = []; me.unbankedPoints = 0;
    this.emit("banked", { points: pts, fish });
  }

  private killMonster(m: MonsterS) {
    this.state.monsters.delete(m.id);
    for (const cb of this.remM) cb(m, m.id);
    this.emit("announce", { kind: "monster_kill", text: `${MONSTERS[m.kind].name} was slain!`, color: "#ffd24a", x: m.x, z: m.z });
    if (this.hits.has(m.id)) {
      const f = rollFish({ zone: "abyss", rodLevel: this.me.level, storm: false, forceMinTier: MONSTERS[m.kind].lootMinTier });
      const card: FishCardS = { speciesId: f.species.id, tier: f.species.tier, weightKg: f.weightKg, points: f.points, at: Date.now(), catcher: this.me.name };
      this.me.unbanked.push(card);
      this.me.unbankedPoints += card.points;
      this.addXp(MONSTERS[m.kind].xp);
      this.emit("monsterLoot", { monsterId: m.id, cards: [card] });
    }
  }

  private damage(amount: number, by: string) {
    const me = this.me;
    if (me.sunk) return;
    me.hp = Math.max(0, me.hp - amount);
    this.emit("damaged", { amount, hp: me.hp, byMonster: by });
    if (me.hp <= 0) {
      me.sunk = true;
      me.state = "sailing";
      this.emit("announce", { kind: "sunk", text: `${me.name} was sunk!`, playerId: "me", color: "#ff6b6b" });
      this.later(RESPAWN_MS, () => {
        me.sunk = false; me.hp = BOAT_MAX_HP; me.unbanked = []; me.unbankedPoints = 0;
        me.x = DOCK_POS.x; me.z = DOCK_POS.z - 6; me.rot = 0;
      });
    }
  }

  // ---------------------------------------------------------------- sim
  tick(dt: number) {
    this.now += dt * 1000;
    this.state.serverTime = Date.now();
    const due = this.timers.filter((t) => t.at <= this.now);
    this.timers = this.timers.filter((t) => t.at > this.now);
    for (const t of due) t.fn();
    const w = this.state.wind;
    w.dirRad += Math.sin(this.now / 23000) * 0.02 * dt;
    w.speed = Math.min(1, Math.max(0.1, (this.state.storm ? 0.85 : 0.35) + Math.sin(this.now / 9000) * 0.15));
    w.gust = this.now < this.gustUntil;
    if (this.state.storm && Date.now() > this.state.stormEndsAt) this.toggleStorm();
    if (!this.state.storm) this.state.nextStormAt = Math.max(this.state.nextStormAt, Date.now());

    const me = this.me;
    this.state.monsters.forEach((m) => {
      if (m.state === "submerged") return;
      const dx = me.x - m.x, dz = me.z - m.z;
      const d = Math.hypot(dx, dz);
      const safe = Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z) < 30;
      const spec = MONSTERS[m.kind];
      if (!safe && d > spec.attackRadius * 0.6 && !me.sunk) {
        m.x += (dx / d) * spec.speed * dt; m.z += (dz / d) * spec.speed * dt;
        m.rot = Math.atan2(dx, dz);
      }
      const at = this.attackTimers.get(m.id) ?? 0;
      if (this.now > at && !safe && !me.sunk && d < spec.attackRadius + 6) {
        this.attackTimers.set(m.id, this.now + spec.attackEveryMs);
        m.state = "attacking";
        const ax = m.kind === "kraken" ? m.x : me.x, az = m.kind === "kraken" ? m.z : me.z;
        this.emit("monsterAttack", { monsterId: m.id, x: ax, z: az, radius: spec.attackRadius });
        this.later(900, () => {
          if (Math.hypot(me.x - ax, me.z - az) < spec.attackRadius) this.damage(spec.damage, m.id);
          m.state = "chasing";
        });
      }
    });
  }
}
