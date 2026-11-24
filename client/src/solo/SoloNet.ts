/**
 * Single-player "server" running in the browser. Implements GameNet so the game code is the same
 * for solo and multiplayer. Owns wind, storms, monsters (timers + AI), fishing outcomes, damage,
 * sinking, banking, missions, xp/levels, trophies and the solo Hall of Fame. Persists to SoloSave.
 * Campaign v2 hooks: gear/skill loadout, campaign fish roll, boss controllers, NPC targets.
 */
import {
  DOCK_POS, DOCK_RADIUS, RESPAWN_MS, CAST_MAX_DIST, BITE_WINDOW_MS, HARPOON_RANGE, MONSTERS,
  MISSION_POOL, MAX_MONSTERS, STORM_EVERY_MS, STORM_DURATION_MS, missionTarget, zoneAt, levelFromXp, TIER_INFO, tierRank,
  type C2S, type S2C, type StateShape, type PlayerS, type MonsterS, type SquadS, type SquadId, type FishCardS, type MonsterKind,
  type MissionS, type Tier, type ZoneId, type Behaviour, type RegionWeather,
} from "@freek/shared";
import type { GameNet } from "../game/types";
import { applyEvent, soloRollFish, type ProgressEvent } from "./progress";
import { writeSave, sortCards, type SoloSave } from "./save";
import { computeLoadout, type Loadout } from "./loadout";

type Handler = (p: any) => void;

export interface FishRoll { speciesId: string; tier: Tier; weightKg: number; points: number; behaviour?: Behaviour; usedBait?: boolean }

export interface SoloHooks {
  onProgress?: (ev: ProgressEvent) => void;
  onSunk?: () => void;
  onMonsterSurface?: (m: MonsterS, boss: boolean) => void;
  /** campaign fish roll (zone at the boat); null = default roll */
  rollFish?: (zone: ZoneId, storm: boolean, forceMinTier?: Tier) => FishRoll | null;
  /** a fish was landed (codex, materials, achievements) */
  onLanded?: (card: FishCardS, perfect: boolean, roll: FishRoll) => void;
  onBanked?: (points: number, cards: FishCardS[]) => void;
  onMonsterKilled?: (m: MonsterS, boss: boolean) => void;
  onHarpoonHit?: (m: MonsterS, dmg: number, crit: boolean) => void;
  /** P4: monster/horror loot from the current region's campaign species (null = multiplayer table) */
  rollLoot?: (minTier: Tier, x: number, z: number) => FishRoll | null;
  /** Endless: bite delay multiplier at the bobber (schools bite fast) */
  biteDelayMult?: (bobX: number, bobZ: number) => number;
  /** Endless: reel minigame duration multiplier by tier (quick reel) */
  reelTimeMult?: (tier: Tier) => number;
  /** Endless: monster speed multiplier (ink, slows) */
  monsterSpeedMult?: (m: MonsterS) => number;
}

/** something monsters can attack besides the player (escort / defended NPC boats) */
export interface MonsterTarget { id: string; x: number; z: number; alive: boolean; priority: number; damage(n: number): void }

/** a boss behaviour takes over a monster's AI */
export interface MonsterController {
  update(dt: number, now: number): void; onHit?(dmg: number): void; hitRadius?: number;
  /** harpoon damage multiplier right now (0 = immune, e.g. a closed shell; 2 = exposed weak point) */
  damageScale?(): number;
  /** the monster left the world (killed, retry, chapter change): clean up parts, overlays, … */
  dispose?(): void;
}

interface MonsterAI {
  scripted: boolean; boss: boolean;
  nextAttack: number; attacks: number;
  roamX: number; roamZ: number;
  farFor: number; resurfaceAt: number;
  hitters: boolean;
  /** boss parts / minions: no spawn or kill announcements, no fish loot */
  quiet?: boolean;
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
  legendaryBoost = 1;
  randomKraken = true;
  randomMonsters = true;
  tutorial = false;
  /** no storms while set (chapter weather "clear") */
  calm = false;
  loadout: Loadout;
  /** assist: monster damage multiplier */
  damageMult = 1;
  /** P4 Hard/Legendary: monster HP, monster damage, added fish difficulty (1/1/0 = normal) */
  monsterHpMult = 1;
  monsterDmgMult = 1;
  fishDiffBonus = 0;
  /** region weather rules */
  weather: RegionWeather = { windBase: 0.35, stormEveryMs: STORM_EVERY_MS, stormDurationMs: STORM_DURATION_MS, gustEveryMs: [20_000, 40_000] };
  readonly controllers = new Map<string, MonsterController>();
  extraTargets: () => MonsterTarget[] = () => [];
  /** the fish on the line right now (reel mods read it) */
  pendingRoll: FishRoll | null = null;
  /** Endless runs never write the campaign save */
  persistEnabled = true;
  /** xp multiplier for fish and monster kills (Endless grants its own xp: 0) */
  xpMult = 1;

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
  private castSeq = 0;

  constructor(public readonly save: SoloSave) {
    this.loadout = computeLoadout(save);
    const lv = levelFromXp(save.xp).level;
    const me: PlayerS = {
      id: "me", name: save.name, squad: "tide", x: DOCK_POS.x, z: DOCK_POS.z - 6, rot: 0, speed: 0, hp: this.loadout.maxHp, sunk: false,
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
  get maxHp() { return this.loadout.maxHp; }
  get time() { return this.now; }
  /** delivered asynchronously (like a real server), preserving order */
  emit<K extends keyof S2C>(type: K, p: S2C[K]) { queueMicrotask(() => { for (const h of this.handlers.get(type) ?? []) h(p); }); }
  later(ms: number, fn: () => void) { this.timers.push({ at: this.now + ms, fn }); }

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
    if (!this.persistEnabled) return;
    const me = this.me, s = this.save;
    s.name = me.name; s.xp = me.xp; s.level = me.level; s.coins = me.coins; s.catches = me.catches;
    s.bankedPoints = me.bankedPoints; s.trophies = me.trophies.slice(); s.missions = me.missions.map((m) => ({ ...m }));
    writeSave(s);
  }
  /** gear/skills changed: recompute stats (hp grows with the hull) */
  setLoadout(l: Loadout) {
    const me = this.me;
    const wasFull = me.hp >= this.loadout.maxHp;
    this.loadout = l;
    if (wasFull || me.hp > l.maxHp) me.hp = l.maxHp;
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
  setCalm(calm: boolean) {
    this.calm = calm;
    if (calm && this.state.storm) this.endStorm();
    this.state.nextStormAt = calm ? Number.MAX_SAFE_INTEGER : this.now + this.weather.stormEveryMs;
  }
  gust() { this.gustUntil = this.now + 4000; }
  hasMonster(kind?: MonsterKind) {
    let found = false;
    this.state.monsters.forEach((m) => { if (!kind || m.kind === kind) found = true; });
    return found;
  }

  spawnMonster(kind: MonsterKind, opts: { scripted?: boolean; boss?: boolean; dist?: number; hp?: number; at?: { x: number; z: number }; quiet?: boolean } = {}): MonsterS {
    const me = this.me;
    const id = `m${++this.monsterSeq}`;
    let x = 0, z = 0;
    if (opts.at) { x = opts.at.x; z = opts.at.z; }
    else for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = opts.dist ?? 45;
      x = me.x + Math.cos(a) * d; z = me.z + Math.sin(a) * d;
      const r = Math.hypot(x - DOCK_POS.x, z - DOCK_POS.z);
      const zone = zoneAt(x, z);
      if (r > 45 && r < 440 && this.zonesOpen[zone] && (kind !== "kraken" || zone === "abyss" || opts.scripted)) break;
    }
    const spec = MONSTERS[kind];
    const hp = Math.max(1, Math.round((opts.hp ?? spec.hp) * this.monsterHpMult));
    const m: MonsterS = { id, kind, x, z, rot: Math.atan2(me.x - x, me.z - z), hp, maxHp: hp, state: "submerged", targetId: "me" };
    this.state.monsters.set(id, m);
    this.ai.set(id, { scripted: !!opts.scripted, boss: !!opts.boss || spec.boss, nextAttack: this.now + 5000, attacks: 0, roamX: x, roamZ: z, farFor: 0, resurfaceAt: this.now + 1800, hitters: false, quiet: opts.quiet });
    for (const cb of this.addM) cb(m, id);
    if (!opts.boss && !opts.quiet) this.emit("announce", { kind: "monster_spawn", text: `${spec.name} has appeared!`, color: "#ff4d4d", x, z });
    this.lastSpawnAt = this.now;
    return m;
  }

  removeMonster(m: MonsterS) {
    if (!this.state.monsters.has(m.id)) return;
    this.state.monsters.delete(m.id);
    this.ai.delete(m.id);
    const ctl = this.controllers.get(m.id);
    this.controllers.delete(m.id);
    ctl?.dispose?.();
    for (const cb of this.remM) cb(m, m.id);
  }
  /** P3: scripted kill (the Eye Duel finishes the Maelstrom Eye) */
  kill(m: MonsterS) { if (this.state.monsters.has(m.id)) { m.hp = 0; this.killMonster(m); } }
  clearMonsters() { [...this.state.monsters.values()].forEach((m) => this.removeMonster(m)); }
  isBoss(id: string) { return !!this.ai.get(id)?.boss; }

  /** chapter retry: back to the dock, full hp, no monsters, nothing pending (no item loss: the bag is kept) */
  resetForRetry() {
    const me = this.me;
    this.clearMonsters();
    this.timers = [];
    this.pending = null; this.pendingRoll = null;
    me.sunk = false; me.hp = this.loadout.maxHp; me.state = "sailing";
    me.x = DOCK_POS.x; me.z = DOCK_POS.z - 6; me.rot = 0; me.speed = 0; this.wasInRing = true;
    this.lastSpawnAt = this.now;
    this.nextSpawnCheck = this.now + 20_000;
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
        const inRing = Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z) < DOCK_RADIUS;
        if (inRing && me.unbanked.length && (!this.wasInRing || Math.abs(me.speed) > 4)) this.bank();
        this.wasInRing = inRing;
        break;
      }
      case "setSquad": break;
      case "cast": {
        if (me.state !== "sailing" || me.sunk) return;
        me.state = "casting";
        const L = this.loadout;
        const dist = (6 + Math.max(0, Math.min(1, p.power)) * (CAST_MAX_DIST - 6)) * L.castMult;
        const w = this.state.wind;
        const seq = ++this.castSeq;
        this.later(350, () => {
          if (me.state !== "casting" || seq !== this.castSeq) return;
          me.bobX = me.x + Math.sin(p.aimRad) * dist + Math.sin(w.dirRad) * w.speed * 4;
          me.bobZ = me.z + Math.cos(p.aimRad) * dist + Math.cos(w.dirRad) * w.speed * 4;
          me.state = "waiting";
          const delay = (this.tutorial ? 1500 + Math.random() * 2000 : 2000 + Math.random() * 4500) * L.biteSpeed * (this.hooks.biteDelayMult?.(me.bobX, me.bobZ) ?? 1);
          this.later(delay, () => {
            if (me.state !== "waiting" || seq !== this.castSeq) return;
            me.state = "hooked";
            const win = (this.tutorial ? BITE_WINDOW_MS + 600 : BITE_WINDOW_MS) + L.skills.biteWindowMs;
            this.biteOpenUntil = this.now + win + 200;
            this.emit("bite", { windowMs: win });
            this.later(win + 250, () => {
              if (me.state === "hooked" && seq === this.castSeq) { me.state = "sailing"; this.emit("hookResult", { ok: false }); }
            });
          });
        });
        break;
      }
      case "hook": {
        if (me.state !== "hooked" || this.now > this.biteOpenUntil) return;
        const zone = zoneAt(me.bobX || me.x, me.bobZ || me.z);
        const roll: FishRoll = this.hooks.rollFish?.(zone, this.state.storm) ?? this.defaultRoll(zone);
        const card: FishCardS = { speciesId: roll.speciesId, tier: roll.tier, weightKg: roll.weightKg, points: roll.points, at: Date.now(), catcher: me.name };
        const diff = Math.min(1, TIER_INFO[card.tier].difficulty + this.fishDiffBonus);
        const durationMs = Math.round((5000 + diff * 6000) * (this.hooks.reelTimeMult?.(card.tier) ?? 1));
        this.pending = { card };
        this.pendingRoll = roll;
        me.state = "reeling";
        this.emit("hookResult", { ok: true, tier: card.tier, difficulty: diff, durationMs });
        break;
      }
      case "reelResult": {
        const pend = this.pending, roll = this.pendingRoll;
        this.pending = null; this.pendingRoll = null;
        if (me.state === "reeling") me.state = "sailing";
        if (!pend) return;
        if (!p.success) { this.emit("lineSnap", {}); this.progress({ t: "snap" }); return; }
        this.landFish(pend.card, p.maxTension < 0.5, roll ?? { speciesId: pend.card.speciesId, tier: pend.card.tier, weightKg: pend.card.weightKg, points: pend.card.points });
        break;
      }
      case "cancelFishing":
        if (!me.sunk) me.state = "sailing";
        this.pending = null; this.pendingRoll = null;
        this.castSeq++;
        break;
      case "harpoon": this.harpoon(p.tx, p.tz); break;
      case "chat": break;
      case "reel": break;
    }
  }

  private defaultRoll(zone: ZoneId): FishRoll {
    const f = soloRollFish({ zone, rodLevel: this.me.level, storm: this.state.storm, legendaryMult: this.legendaryBoost });
    return { speciesId: f.species.id, tier: f.species.tier, weightKg: f.weightKg, points: f.points };
  }

  private landFish(card: FishCardS, perfect: boolean, roll: FishRoll) {
    const me = this.me;
    const zone = zoneAt(me.x, me.z);
    const best = me.trophies[0];
    me.unbanked.push(card);
    me.unbankedPoints += card.points;
    me.catches++;
    const newBest = !best || tierRank(card.tier) > tierRank(best.tier) || (card.tier === best.tier && card.points > best.points);
    me.trophies = sortCards([...me.trophies, card]).slice(0, 10);
    const xp = Math.round(card.points * 2 * this.xpMult);
    this.emit("catch", { card, zone, perfect, xp, newBest });
    this.addXp(xp);
    if (card.tier === "legendary" || card.tier === "epic") {
      this.emit("announce", { kind: card.tier, text: `${me.name} landed a ${TIER_INFO[card.tier].label.toUpperCase()} catch!`, color: TIER_INFO[card.tier].color, playerId: "me", x: me.x, z: me.z });
    }
    this.save.hof = sortCards([...this.save.hof, card]).slice(0, 20);
    this.emit("hallOfFame", { entries: this.save.hof });
    this.hooks.onLanded?.(card, perfect, roll);
    this.progress({ t: "catch", card, zone, perfect, storm: this.state.storm, usedBait: roll.usedBait });
    this.persist();
  }

  /** take a landed card out of the bag (kept as bait) */
  takeFromBag(card: FishCardS): boolean {
    const me = this.me;
    const i = me.unbanked.indexOf(card);
    if (i < 0) return false;
    me.unbanked.splice(i, 1);
    me.unbankedPoints = Math.max(0, me.unbankedPoints - card.points);
    return true;
  }

  addXp(xp: number) {
    if (xp <= 0) return;
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
  progress(ev: ProgressEvent) {
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
    const cards = me.unbanked.slice();
    me.bankedPoints += pts;
    const sq = this.state.squads.get("tide");
    if (sq) sq.points = me.bankedPoints;
    me.unbanked = []; me.unbankedPoints = 0;
    me.coins += Math.floor(pts / 2); // v2: 1 coin per 2 points banked
    this.emit("banked", { points: pts, fish });
    this.hooks.onBanked?.(pts, cards);
    this.progress({ t: "bank", points: pts, fish, cards });
    this.persist();
  }

  private harpoon(tx: number, tz: number) {
    const me = this.me;
    if (me.sunk) return;
    const d = Math.hypot(tx - me.x, tz - me.z);
    if (d > HARPOON_RANGE) { tx = me.x + ((tx - me.x) / d) * HARPOON_RANGE; tz = me.z + ((tz - me.z) / d) * HARPOON_RANGE; }
    this.fireOne(tx, tz, false);
    if (this.loadout.skills.twin) {
      // second harpoon: slightly offset, a beat later
      const a = Math.random() * Math.PI * 2;
      this.later(140, () => this.fireOne(tx + Math.cos(a) * 1.5, tz + Math.sin(a) * 1.5, true));
    }
  }

  private fireOne(tx: number, tz: number, twin: boolean) {
    const me = this.me;
    if (me.sunk) return;
    let hit: MonsterS | undefined;
    this.state.monsters.forEach((m) => {
      const r = this.controllers.get(m.id)?.hitRadius ?? (m.kind === "kraken" ? 10 : 7);
      if (m.state !== "submerged" && Math.hypot(m.x - tx, m.z - tz) < r + (twin ? 1.5 : 0)) hit = m;
    });
    const L = this.loadout;
    const scale = hit ? this.controllers.get(hit.id)?.damageScale?.() ?? 1 : 1;
    const crit = !!hit && (Math.random() < L.skills.critChance || scale > 1);
    const dmg = Math.round(L.harpoonDamage * (crit ? 2 : 1) * (twin ? 0.6 : 1) * (scale > 1 ? scale / 2 : scale));
    this.emit("harpoonFx", { from: "me", sx: me.x, sz: me.z, tx, tz, hitMonster: hit?.id, dmg: hit ? dmg : undefined });
    if (!hit) return;
    const m = hit;
    const ai = this.ai.get(m.id);
    if (ai) ai.hitters = true;
    this.later(250, () => {
      if (!this.state.monsters.has(m.id)) return;
      if (dmg > 0) m.hp = Math.max(0, m.hp - dmg);
      this.hooks.onHarpoonHit?.(m, dmg, crit);
      this.controllers.get(m.id)?.onHit?.(dmg);
      this.progress({ t: "hit", dmg, monsterId: m.id });
      if (m.hp <= 0) this.killMonster(m);
    });
  }

  /** Endless rigs: a hit that isn't the player's harpoon (fx from (sx,sz), damage after 250 ms like a harpoon) */
  strike(m: MonsterS, dmg: number, opts: { crit?: boolean; sx?: number; sz?: number; fx?: boolean } = {}) {
    if (!this.state.monsters.has(m.id) || m.state === "submerged") return false;
    const scale = this.controllers.get(m.id)?.damageScale?.() ?? 1;
    const crit = !!opts.crit || scale > 1;
    const amount = Math.max(0, Math.round(dmg * (crit ? 2 : 1) * (scale > 1 ? scale / 2 : scale)));
    if (opts.fx !== false) this.emit("harpoonFx", { from: "rig", sx: opts.sx ?? this.me.x, sz: opts.sz ?? this.me.z, tx: m.x, tz: m.z, hitMonster: m.id, dmg: amount });
    const ai = this.ai.get(m.id);
    if (ai) ai.hitters = true;
    this.later(opts.fx === false ? 0 : 250, () => {
      if (!this.state.monsters.has(m.id)) return;
      if (amount > 0) m.hp = Math.max(0, m.hp - amount);
      this.hooks.onHarpoonHit?.(m, amount, crit);
      this.controllers.get(m.id)?.onHit?.(amount);
      this.progress({ t: "hit", dmg: amount, monsterId: m.id });
      if (m.hp <= 0) this.killMonster(m);
    });
    return true;
  }

  private killMonster(m: MonsterS) {
    const ai = this.ai.get(m.id);
    const spec = MONSTERS[m.kind];
    const boss = !!ai?.boss;
    this.removeMonster(m);
    if (!boss && !ai?.quiet) this.emit("announce", { kind: "monster_kill", text: `${spec.name} was slain!`, color: "#ffd24a", x: m.x, z: m.z });
    const sq = this.state.squads.get("tide");
    if (sq) sq.kills++;
    this.addXp(Math.round(spec.xp * (ai?.quiet ? 0.1 : 1) * this.loadout.skills.lootXpMult * this.xpMult));
    if (ai?.hitters && !boss && !ai.quiet) {
      const campaign = this.hooks.rollLoot?.(spec.lootMinTier as Tier, m.x, m.z) ?? null;
      const f = campaign ? null : soloRollFish({ zone: "abyss", rodLevel: this.me.level, storm: false, legendaryMult: this.legendaryBoost, forceMinTier: spec.lootMinTier as Tier });
      const card: FishCardS = campaign
        ? { speciesId: campaign.speciesId, tier: campaign.tier, weightKg: campaign.weightKg, points: campaign.points, at: Date.now(), catcher: this.me.name }
        : { speciesId: f!.species.id, tier: f!.species.tier, weightKg: f!.weightKg, points: f!.points, at: Date.now(), catcher: this.me.name };
      this.me.unbanked.push(card);
      this.me.unbankedPoints += card.points;
      this.me.trophies = sortCards([...this.me.trophies, card]).slice(0, 10);
      this.save.hof = sortCards([...this.save.hof, card]).slice(0, 20);
      this.emit("monsterLoot", { monsterId: m.id, cards: [card] });
      this.emit("hallOfFame", { entries: this.save.hof });
    }
    this.hooks.onMonsterKilled?.(m, boss);
    this.progress({ t: "kill", kind: m.kind, boss });
    this.persist();
  }

  /** damage to the player (monsters, bosses, hazards) */
  damage(amount: number, by: string) {
    const me = this.me;
    if (me.sunk || amount <= 0) return;
    // Hard/Legendary: monsters and bosses (ids "m<n>") hit harder; hazards (lightning, coral, frost, floes) don't change
    const fromMonster = /^m\d+$/.test(by);
    amount = Math.max(1, Math.round(amount * this.damageMult * (fromMonster ? this.monsterDmgMult : 1)));
    me.hp = Math.max(0, me.hp - amount);
    this.emit("damaged", { amount, hp: me.hp, byMonster: by });
    this.progress({ t: "damage", amount, by });
    if (me.state === "waiting" || me.state === "hooked") { me.state = "sailing"; this.pending = null; this.pendingRoll = null; this.castSeq++; }
    if (me.hp <= 0) {
      me.sunk = true;
      me.state = "sailing";
      this.pending = null; this.pendingRoll = null;
      const lost = me.unbanked.length;
      this.emit("announce", { kind: "sunk", text: lost ? `You were sunk! ${lost} unbanked fish lost.` : "You were sunk!", playerId: "me", color: "#ff6b6b" });
      this.progress({ t: "sink" });
      this.hooks.onSunk?.();
      this.state.monsters.forEach((m) => { m.state = "submerged"; const ai = this.ai.get(m.id); if (ai) ai.resurfaceAt = this.now + 12_000; });
      this.later(RESPAWN_MS, () => {
        if (!me.sunk) return;
        me.sunk = false; me.hp = this.loadout.maxHp; me.unbanked = []; me.unbankedPoints = 0;
        me.x = DOCK_POS.x; me.z = DOCK_POS.z - 6; me.rot = 0; me.speed = 0; this.wasInRing = true;
        this.persist();
      });
    }
  }
  heal(n: number) { const me = this.me; if (!me.sunk) me.hp = Math.min(this.loadout.maxHp, me.hp + n); }

  private endStorm() {
    const s = this.state;
    s.storm = false;
    s.nextStormAt = this.calm ? Number.MAX_SAFE_INTEGER : this.now + this.weather.stormEveryMs;
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

    const w = this.state.wind, W = this.weather;
    w.dirRad += Math.sin(now / 23000) * 0.02 * dt;
    w.speed = Math.min(1, Math.max(0.1, (this.state.storm ? 0.85 : W.windBase) + Math.sin(now / 9000) * 0.15));
    if (now >= this.nextGustAt) { this.gustUntil = now + 4000; this.nextGustAt = now + W.gustEveryMs[0] + Math.random() * (W.gustEveryMs[1] - W.gustEveryMs[0]); }
    w.gust = now < this.gustUntil;

    const s = this.state;
    if (!s.storm && now >= s.nextStormAt && !this.calm) {
      s.storm = true;
      s.stormEndsAt = now + W.stormDurationMs;
      this.emit("announce", { kind: "storm_start", text: "A storm rolls in! Rare fish are stirring." });
    } else if (s.storm && now >= s.stormEndsAt) this.endStorm();

    const me = this.me;
    if (!me.sunk && this.loadout.skills.repairPerSec > 0 && me.hp < this.loadout.maxHp) me.hp = Math.min(this.loadout.maxHp, me.hp + this.loadout.skills.repairPerSec * dt);

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

  /** who a monster at (x,z) goes after: the player or an NPC target */
  private pickTarget(mx: number, mz: number): { id: string; x: number; z: number; t: MonsterTarget | null } {
    const me = this.me;
    let best: { id: string; x: number; z: number; t: MonsterTarget | null } = { id: "me", x: me.x, z: me.z, t: null };
    let bestScore = me.sunk ? Infinity : Math.hypot(me.x - mx, me.z - mz);
    for (const t of this.extraTargets()) {
      if (!t.alive) continue;
      const score = Math.hypot(t.x - mx, t.z - mz) / Math.max(0.2, t.priority);
      if (score < bestScore) { bestScore = score; best = { id: t.id, x: t.x, z: t.z, t }; }
    }
    return best;
  }

  private monsterTick(dt: number) {
    const now = this.now, me = this.me;
    this.state.monsters.forEach((m) => {
      const ctl = this.controllers.get(m.id);
      if (ctl) { ctl.update(dt, now); return; }
      const ai = this.ai.get(m.id);
      if (!ai) return;
      const spec0 = MONSTERS[m.kind];
      const sm = this.hooks.monsterSpeedMult?.(m) ?? 1;
      const spec = sm === 1 ? spec0 : { ...spec0, speed: spec0.speed * sm };
      const tgt = this.pickTarget(m.x, m.z);
      m.targetId = tgt.id;
      const dx = tgt.x - m.x, dz = tgt.z - m.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const meR = Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z);
      const safe = meR < 30 && !tgt.t;
      if (!ai.scripted) {
        ai.farFor = Math.hypot(me.x - m.x, me.z - m.z) > 240 || (zoneAt(me.x, me.z) === "shallows" && !tgt.t) ? ai.farFor + dt : 0;
        if (ai.farFor > 25) { this.removeMonster(m); return; }
      } else if (d > 220) {
        if (m.state !== "submerged") { m.state = "submerged"; ai.resurfaceAt = now + 4000; }
      }
      if (m.state === "submerged") {
        if (now >= ai.resurfaceAt && (!me.sunk || tgt.t) && !safe) {
          if (d > 120) {
            const a = Math.random() * Math.PI * 2;
            m.x = tgt.x + Math.cos(a) * 50; m.z = tgt.z + Math.sin(a) * 50;
          }
          this.keepOutOfHarbour(m);
          m.state = "chasing";
          this.hooks.onMonsterSurface?.(m, ai.boss);
        }
        return;
      }
      if ((me.sunk && !tgt.t) || safe) {
        this.moveToward(m, ai.roamX, ai.roamZ, spec.speed * 0.5, dt);
        if (Math.hypot(ai.roamX - m.x, ai.roamZ - m.z) < 5) { const a = Math.random() * 6.28; ai.roamX = m.x + Math.cos(a) * 40; ai.roamZ = m.z + Math.sin(a) * 40; }
        this.keepOutOfHarbour(m);
        return;
      }
      const zoneMult = zoneAt(m.x, m.z) === "abyss" ? 1.25 : 1;
      if (d > spec.attackRadius * 0.55) {
        this.moveToward(m, tgt.x, tgt.z, spec.speed * (d > 80 ? 1.6 : 1), dt);
      } else m.rot = Math.atan2(dx, dz);
      this.keepOutOfHarbour(m);
      if (now >= ai.nextAttack && d < spec.attackRadius + 5) {
        ai.nextAttack = now + spec.attackEveryMs;
        ai.attacks++;
        m.state = "attacking";
        const ax = m.kind === "kraken" ? m.x + dx * 0.5 : tgt.x, az = m.kind === "kraken" ? m.z + dz * 0.5 : tgt.z;
        this.emit("monsterAttack", { monsterId: m.id, x: ax, z: az, radius: spec.attackRadius });
        this.later(m.kind === "kraken" ? 950 : 700, () => {
          if (!this.state.monsters.has(m.id)) return;
          const dmg = Math.round(spec.damage * zoneMult);
          if (Math.hypot(me.x - ax, me.z - az) < spec.attackRadius) this.damage(dmg, m.id);
          for (const t of this.extraTargets()) if (t.alive && Math.hypot(t.x - ax, t.z - az) < spec.attackRadius) t.damage(Math.round(dmg * this.damageMult * this.monsterDmgMult));
          if (m.state === "attacking") m.state = "chasing";
          if (m.kind === "kraken" && ai.attacks % 3 === 0) { m.state = "submerged"; ai.resurfaceAt = now + 6000; }
        });
      }
    });
  }

  moveToward(m: MonsterS, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const step = Math.min(d, speed * dt);
    m.x += (dx / d) * step; m.z += (dz / d) * step;
    m.rot = Math.atan2(dx, dz);
  }
  keepOutOfHarbour(m: MonsterS) {
    const r = Math.hypot(m.x - DOCK_POS.x, m.z - DOCK_POS.z);
    const min = 34;
    if (r < min) { const k = min / (r || 1); m.x = DOCK_POS.x + (m.x - DOCK_POS.x) * k; m.z = DOCK_POS.z + (m.z - DOCK_POS.z) * k; }
  }
}
