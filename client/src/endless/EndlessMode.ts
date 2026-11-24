/**
 * Endless Tide: the roguelite single-player mode (see docs/ENDLESS.md). Runs inside the normal Game with a SoloNet
 * that never touches the campaign save. One run = tides of fishing + monsters inside the arena ring; between tides the
 * hold cashes in, level-ups are picked and the Tackle Shop sells rigs and trinkets.
 */
import * as THREE from "three";
import {
  TIER_INFO, TIERS, tierRank, fishPoints, speciesOfRegion, getCampaignSpecies, getBoss, getRegion, skillEffects,
  RIGS_BY_ID, TRINKETS_BY_ID, CAPTAINS_BY_ID, FISH_COINS, FISH_XP, MODIFIERS, WIN_TIDE, BIOMES,
  computeStats, tideSpec, armorMult, pct, newRun, rollShop, rollLevelOffers, interestFor, runScore, captainRules, dailySeed, dailyCaptain, DAILY_DANGER,
  harbourXpMult, pearlsForRun,
  type RunState, type Stats, type TideSpec, type FishCardS, type Tier, type MonsterS, type PlayerS, type TrinketSpecial, type RigClass, type BossDef,
} from "@freek/shared";
import { evolutionOf, hasComboFlag, CRIT_CAP } from "@freek/shared";
import type { SoloNet } from "../solo/SoloNet";
import type { SoloGameCtx } from "../game/soloMode";
import type { SoloModeLike, TrackerItem, BossBarInfo } from "../game/modeLike";
import type { MapExtra } from "../solo/actors";
import type { Loadout } from "../solo/loadout";
import { createBossBehaviour, type BossBehaviour, type BossFx } from "../solo/bosses";
import { Telegraphs } from "../fx/telegraphs";
import { pickMonsterType } from "@freek/shared";
import { spawnEndless, takeEndlessReward, type EndlessMonsterCtx } from "./monsters";
import { ARENA, ArenaRing, Schools, LootField, Flyers, hazardPatch, type School } from "./world";
import { loadMeta, writeMeta, checkUnlocks, isUnlocked, type EndlessMeta } from "./meta";
import { EndlessUI } from "./ui";
import { EndlessEvents } from "./events";
import { ComboTracker } from "./combos";
import { rememberRunStart, takeDeathSnapshot } from "./deathScreen";
import { sfx } from "../audio";
import { h } from "../util";
import "./endless.css";

export interface EndlessOpts { captain: string; danger: number; daily?: string | null; resume?: boolean }
type Phase = "intro" | "tide" | "cashin" | "levelup" | "shop" | "over";

interface RigRt { t: number; acc: number }
interface BossRt { def: BossDef; m: MonsterS; ctl: BossBehaviour }
interface Patch { x: number; z: number; r: number; mesh: THREE.Mesh; kind: "fire" | "frost" }

const REEL_TIME: Record<Tier, number> = { common: 0.42, rare: 0.58, gold: 0.8, epic: 0.9, legendary: 1 };

export class EndlessMode implements SoloModeLike {
  run: RunState;
  meta: EndlessMeta;
  phase: Phase = "intro";
  spec!: TideSpec;
  stats!: Stats;
  specials: Partial<Record<TrinketSpecial, number>> = {};
  classCount: Record<RigClass, number> = { rod: 0, net: 0, harpoon: 0, explosive: 0, support: 0 };
  tideT = 0;
  readonly ui: EndlessUI;
  /** treasure chests + mid-tide events (events.ts) */
  readonly events: EndlessEvents;
  /** combo discovery (combos.ts) */
  combos!: ComboTracker;
  private ring: ArenaRing;
  readonly schools: Schools;
  private loot: LootField;
  private flyers: Flyers;
  private tele: Telegraphs;
  private rigRt = new Map<number, RigRt>();
  private mine = new Set<string>();
  private elites = new Set<string>();
  /** context for the Endless monster roster (endless/monsters) */
  private mctx: EndlessMonsterCtx | null = null;
  private slowUntil = new Map<string, number>();
  private bosses: BossRt[] = [];
  private toSpawn = 0;
  private spawnT = 0;
  private schoolT = 0;
  private hazardT = 0;
  private patches: Patch[] = [];
  private patchHurtT = 0;
  private vortexT = 0;
  private waveT = 0;
  private dashReadyAt = 0;
  private lastX = 0; private lastZ = 0;
  private time = 0;
  private drone: THREE.Mesh | null = null;
  /** Twin Drones (evolved Lantern Drone): the second orbiting drone */
  private drone2: THREE.Mesh | null = null;
  private lantern: THREE.PointLight | null = null;
  private tintEl: HTMLElement;
  private bountyDone = false;
  private bossSpawnIn = -1;
  private tideStartCoins = 0;
  private tideFish: FishCardS[] = [];
  private freeItem = false;
  private rogueNext = 0;
  private lastLevel = 1;

  constructor(readonly net: SoloNet, readonly g: SoloGameCtx, opts: EndlessOpts) {
    this.meta = loadMeta();
    const daily = opts.daily ?? null;
    if (opts.resume && this.meta.run) this.run = this.meta.run;
    else {
      const captain = daily ? dailyCaptain(daily) : opts.captain;
      this.run = newRun({ captain, danger: daily ? DAILY_DANGER : opts.danger, daily, seed: daily ? dailySeed(daily) : undefined, companion: this.meta.companion, harbour: this.meta.harbour });
      this.meta.stats.runs =(this.meta.stats.runs ?? 0) + 1;
      const cr = this.meta.captains[this.run.captain] ?? { bestTide: 0, bestScore: 0, danger: -1, runs: 0, wins: 0 };
      cr.runs++;
      this.meta.captains[this.run.captain] = cr;
      if (daily) { const d = this.meta.daily[daily] ?? { best: 0, tide: 0, runs: 0 }; d.runs++; this.meta.daily[daily] = d; }
    }
    this.markSeen();
    rememberRunStart(this.meta, this.run, this.meta.run === this.run);
    // ---- the net: no campaign save, no missions, Endless grants its own xp, monsters are ours
    net.persistEnabled = false;
    net.xpMult = 0;
    { // Harbour "Seasoned Crew": scale the xp Endless grants (xpMult above only zeroes campaign-style xp)
      const k = harbourXpMult(this.run), addXp = net.addXp.bind(net);
      if (k !== 1) net.addXp = (xp: number) => addXp(Math.round(xp * k));
    }
    net.randomMonsters = false;
    net.randomKraken = false;
    net.setCalm(true);
    net.zonesOpen = { shallows: true, reef: true, abyss: true };
    net.me.missions = [];
    net.me.name = this.net.save.name;
    net.me.xp = 0; net.me.level = 1; net.me.trophies = []; net.me.unbanked = []; net.me.unbankedPoints = 0;
    net.save.hof = [];
    net.hooks.rollFish = () => this.manualRoll();
    net.hooks.biteDelayMult = (x, z) => this.biteMult(x, z);
    net.hooks.reelTimeMult = (t) => REEL_TIME[t];
    net.hooks.monsterSpeedMult = (m) => this.speedFor(m);
    net.hooks.onLanded = (card) => this.onManualCatch(card);
    net.hooks.onMonsterKilled = (m, boss) => this.onKill(m, boss);
    net.hooks.onSunk = () => this.gameOver(false);
    net.hooks.onProgress = (ev) => { if (ev.t === "damage") this.onDamaged(ev.amount, ev.by); };
    net.on("levelUp", (p) => { const n = Math.max(1, p.level - this.lastLevel); this.lastLevel = p.level; this.run.pendingLevels += n; this.ui.levelPop(); });
    g.fishing.blocked = () => (captainRules(this.run).noFishing ? "The Harpooner doesn't fish. Hunt!" : this.phase !== "tide" ? "Wait for the tide…" : null);
    g.fishing.modsProvider = () => {
      const r = net.pendingRoll, L = net.loadout;
      if (!r) return null;
      return { behaviour: r.behaviour, weightKg: r.weightKg, ratingKg: L.ratingKg, fillMult: L.fillMult, liftMult: L.liftMult, zoneBonus: L.skills.zoneBonus, tensionMult: L.skills.tensionMult, secondWind: L.skills.secondWind, onSecondWind: () => g.hud.showPrompt("💨 SECOND WIND!", "", 1.2) };
    };
    // ---- scene
    this.ring = new ArenaRing(g.scene);
    this.schools = new Schools(g.scene, (x, z, s) => g.fx.splashAt(x, z, s));
    this.loot = new LootField(g.scene);
    this.flyers = new Flyers(g.scene);
    this.tele = new Telegraphs(g.scene);
    this.tintEl = h("div.solo-tint");
    g.ui.append(this.tintEl);
    g.hud.setSoloStrip(true);
    g.hud.setRoom("ENDLESS", false);
    g.ui.classList.add("endless-on");
    this.ui = new EndlessUI(this, g.ui);
    this.events = new EndlessEvents(this, {
      addCoins: (n) => this.addCoins(n),
      dropCoin: (x, z, v) => this.loot.drop("coin", x, z, v),
      addMonsters: (n) => { this.toSpawn += n; this.spawnT = Math.min(this.spawnT, 0.5); },
      rigCatch: (tier, from) => this.rigCatch(tier, from),
      arenaPoint: (d) => this.randomArenaPoint(d),
      biomeSpecies: (tier) => this.biomeSpecies(tier),
    });
    this.combos = new ComboTracker(this);
    // boat to the arena centre
    const me = net.me;
    me.x = ARENA.x; me.z = ARENA.z + 8; me.rot = Math.PI; me.hp = 100;
    g.local.snap(me.x, me.z, me.rot);
    this.lastX = me.x; this.lastZ = me.z;
    this.spec = tideSpec(this.run);
    this.refreshStats(true);
    if (opts.resume && this.meta.run) {
      net.me.xp = (this.run as RunState & { xp?: number }).xp ?? 0;
      net.me.level = (this.run as RunState & { level?: number }).level ?? 1;
      this.lastLevel = net.me.level;
      this.applyBiome();
      this.phase = "shop";
      setTimeout(() => this.openBetween(true), 300);
    } else {
      writeMeta(this.meta);
      setTimeout(() => this.startTide(), 600);
    }
  }

  // ======================================================================= stats → loadout
  refreshStats(full = false) {
    const c = computeStats(this.run);
    this.stats = c.stats; this.specials = c.specials; this.classCount = c.classCount;
    const s = this.stats, sp = this.specials;
    const skills = skillEffects({});
    skills.zoneBonus = s.zone / 100;
    skills.secondWind = (sp.secondWind ?? 0) > 0;
    skills.critChance = Math.min(CRIT_CAP, sp.crit ?? 0);
    skills.repairPerSec = Math.max(0, s.regen);
    skills.biteWindowMs = 150;
    const chum = this.rigPowerOf("chum");
    const L: Loadout = {
      castMult: 1 + s.range / 250, biteSpeed: 1 / pct(s.bite + chum * 6), rareBonus: 0,
      fillMult: pct(s.reel), liftMult: 1 + Math.max(-0.5, s.reel / 300), ratingKg: Math.round(45 * pct(s.line)),
      maxHp: s.maxHp, capacityKg: 9999,
      harpoonDamage: Math.round(28 * pct(s.harpoon)), harpoonCooldownMs: Math.round(1100 / pct(s.fireRate)),
      lightRadius: 30 + (this.rigTier("drone") ? 20 : 0), warmthDrain: 1, skills, assist: false,
    };
    this.net.setLoadout(L);
    if (full) this.net.me.hp = L.maxHp;
    this.net.damageMult = armorMult(s.armor);
    this.g.hud.maxHp = L.maxHp;
    this.g.hud.cooldownMs = L.harpoonCooldownMs;
  }
  private rigTier(id: string) { return this.run.rigs.filter((r) => r.id === id).reduce((a, r) => Math.max(a, r.tier), 0); }
  private rigPowerOf(id: string) { return this.run.rigs.filter((r) => r.id === id).reduce((a, r) => a + RIGS_BY_ID[id].power[r.tier - 1], 0); }
  private get rigBoost() { return captainRules(this.run).rigPower ?? 1; }

  // ======================================================================= tide flow
  private applyBiome() {
    const b = this.spec?.biome ?? tideSpec(this.run).biome;
    const R = getRegion(b.region);
    if (R) {
      this.g.world.ocean.setWater(R.biome.water.shallow, R.biome.water.mid, R.biome.water.deep);
      this.g.world.sky.setBiome(R.biome.sky.top, R.biome.sky.horizon);
    }
    this.ring.setColor(b.hazard === "firecoral" ? "#ff8a5a" : b.hazard === "lightning" ? "#ffe45a" : b.hazard === "frost" ? "#bff4ff" : b.hazard === "dark" ? "#b05cff" : "#5fe0ff");
  }

  startTide() {
    const run = this.run, net = this.net;
    this.spec = tideSpec(run);
    const sp = this.spec;
    this.phase = "intro";
    this.tideT = 0;
    this.tideFish = [];
    this.tideStartCoins = run.earned;
    this.bountyDone = false;
    this.refreshStats(true);
    net.me.sunk = false;
    net.me.state = "sailing";
    net.monsterDmgMult = sp.monsterDmg / 20;
    net.monsterHpMult = 1;
    this.applyBiome();
    // weather
    if (sp.biome.hazard === "lightning") { net.setCalm(false); net.forceStorm(0); } else net.setCalm(true);
    this.clearPatches();
    if (sp.biome.hazard === "firecoral" || sp.biome.hazard === "frost") this.makePatches(sp.biome.hazard === "firecoral" ? "fire" : "frost", 3 + Math.min(5, Math.floor((run.tide - 4) / 1.5)));
    // schools
    this.schools.clear();
    for (let i = 0; i < sp.schools; i++) this.spawnSchool();
    if (sp.modifier === "golden_school") this.spawnSchool({ golden: true });
    if (sp.modifier === "bounty") this.spawnSchool({ bounty: true });
    this.schoolT = sp.schoolRespawn;
    this.events.onTideStart();
    // monsters
    this.toSpawn = sp.monsters;
    this.spawnT = sp.modifier === "calm" ? 20 : 3;
    this.bossSpawnIn = sp.boss ? 3.5 : -1;
    this.rogueNext = 6;
    for (const r of run.rigs) this.rigRt.set(r.uid, { t: Math.random() * 1.5, acc: 0 });
    this.ui.tideIntro(sp, () => { this.phase = "tide"; sfx.mission(); });
    this.ui.closeBetween();
  }

  private endTide() {
    if (this.phase !== "tide") return;
    const net = this.net, run = this.run;
    this.phase = "cashin";
    this.g.fishing.cancel();
    this.tele.clear();
    this.flyers.clear();
    this.events.onTideEnd();
    // leftover loot is scooped up
    for (const l of this.loot.takeAll()) { if (l.kind === "coin") this.addCoins(l.value); else if (l.card) this.addToHold(l.card, false); }
    // monsters sink
    for (const m of [...net.state.monsters.values()]) net.removeMonster(m);
    this.bosses = [];
    this.mine.clear(); this.elites.clear();
    // cash-in
    const lines: { tier: Tier; n: number; coins: number }[] = TIERS.map((t) => ({ tier: t, n: 0, coins: 0 }));
    let total = 0;
    for (const c of net.me.unbanked) {
      const v = this.fishCoins(c);
      const l = lines[tierRank(c.tier)];
      l.n++; l.coins += v; total += v;
    }
    net.me.unbanked = []; net.me.unbankedPoints = 0;
    this.addCoins(total);
    const fishThisTide = this.tideFish.length;
    this.schools.clear();
    this.clearPatches();
    net.setCalm(true);
    run.tide++;
    if (run.tide > WIN_TIDE) run.endless = true;
    const won = run.tide === WIN_TIDE + 1;
    if (won) this.recordWin();
    this.ui.cashIn({ lines: lines.filter((l) => l.n), total, fish: fishThisTide, earned: run.earned - this.tideStartCoins, tide: run.tide - 1 }, () => {
      if (won) this.ui.victory(() => this.openBetween(false), () => this.gameOver(true, true));
      else this.openBetween(false);
    });
  }

  /** level-ups then the shop */
  openBetween(resumed: boolean) {
    this.phase = this.run.pendingLevels > 0 ? "levelup" : "shop";
    if (!resumed || !this.run.shop) { rollShop(this.run, { unlocked: (k) => isUnlocked(this.meta, k) }); this.injectFreeItem(); }
    this.saveRun();
    const next = () => {
      if (this.run.pendingLevels > 0) { this.phase = "levelup"; this.ui.levelUp(rollLevelOffers(this.run), next); return; }
      this.phase = "shop";
      this.refreshStats(true);
      this.saveRun();
      this.ui.shop(() => this.nextTide());
    };
    next();
  }
  private injectFreeItem() {
    if (!this.freeItem || !this.run.shop) return;
    this.freeItem = false;
    const i = this.run.shop.offers.findIndex((o) => o && !this.run.shop!.locked[this.run.shop!.offers.indexOf(o)]);
    const o = this.run.shop.offers[Math.max(0, i)];
    if (o) o.price = 0;
  }
  private nextTide() {
    const gain = interestFor(this.run);
    if (gain > 0) { this.run.coins += gain; this.g.feed.toast(`<b>🏦 Interest:</b> +${gain} coins`, "good", 2200); sfx.coin(); }
    this.startTide();
  }

  private saveRun() {
    const r = this.run as RunState & { xp?: number; level?: number };
    r.xp = this.net.me.xp; r.level = this.net.me.level;
    this.meta.run = this.phase === "over" ? null : r;
    writeMeta(this.meta);
  }

  // ======================================================================= end of run
  private recordWin() {
    const m = this.meta, run = this.run;
    m.stats.wins = (m.stats.wins ?? 0) + 1;
    const cr = m.captains[run.captain] ?? { bestTide: 0, bestScore: 0, danger: -1, runs: 0, wins: 0 };
    cr.wins++;
    cr.danger = Math.max(cr.danger, run.danger);
    m.captains[run.captain] = cr;
    if (run.rigs.length === 1) m.stats.winOneRig = 1;
    writeMeta(m);
  }
  gameOver(won: boolean, retired = false) {
    if (this.phase === "over") return;
    takeDeathSnapshot(this, won || retired);
    const reached = retired || won ? this.run.tide - 1 : this.run.tide;
    this.phase = "over";
    this.g.fishing.cancel();
    this.events.clear();
    const run = this.run, m = this.meta;
    const score = runScore(run, reached);
    m.stats.bestTide = Math.max(m.stats.bestTide ?? 0, reached);
    const cr = m.captains[run.captain] ?? { bestTide: 0, bestScore: 0, danger: -1, runs: 0, wins: 0 };
    const newBest = score > cr.bestScore;
    cr.bestTide = Math.max(cr.bestTide, reached); cr.bestScore = Math.max(cr.bestScore, score);
    m.captains[run.captain] = cr;
    if (run.daily) { const d = m.daily[run.daily] ?? { best: 0, tide: 0, runs: 1 }; if (score > d.best) { d.best = score; d.tide = reached; } m.daily[run.daily] = d; }
    m.history = [{ captain: run.captain, danger: run.danger, tide: reached, score, won: won || run.endless, daily: run.daily, at: Date.now() }, ...m.history].slice(0, 20);
    m.run = null;
    const fresh = checkUnlocks(m);
    const pearls = pearlsForRun(run, reached, won); // Harbour currency: every run pays, win or lose
    m.pearls = (m.pearls ?? 0) + pearls; m.pearlsEarned = (m.pearlsEarned ?? 0) + pearls;
    writeMeta(m);
    sfx.sink();
    setTimeout(() => this.ui.summary({ won: won || run.endless, reached, score, newBest, unlocks: fresh, pearls }), won ? 200 : 1400);
  }
  /** abandon from the pause menu */
  abandon() { this.gameOver(false); }

  // ======================================================================= spawning
  private biomeSpecies(tier?: Tier): string[] {
    const all = speciesOfRegion(this.spec.biome.region).filter((s) => !s.conditions || !Object.keys(s.conditions).length);
    const pool = tier ? all.filter((s) => s.tier === tier) : all.filter((s) => tierRank(s.tier) <= 2);
    return (pool.length ? pool : all).map((s) => s.id);
  }
  private randomArenaPoint(minFromBoat = 14) {
    const me = this.net.me;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * ARENA.r * 0.82;
      const x = ARENA.x + Math.cos(a) * d, z = ARENA.z + Math.sin(a) * d;
      if (Math.hypot(x - me.x, z - me.z) > minFromBoat) return { x, z };
    }
    return { x: ARENA.x, z: ARENA.z };
  }
  private spawnSchool(o: { golden?: boolean; bounty?: boolean } = {}) {
    const [a, b] = this.spec.schoolFish;
    const p = this.randomArenaPoint();
    const quality = o.golden || o.bounty ? 2 : Math.random() < 0.2 + this.run.tide * 0.015 ? 1 : 0;
    const sp = o.golden ? this.biomeSpecies("gold") : o.bounty ? this.biomeSpecies("epic") : this.biomeSpecies();
    const count = o.bounty ? 1 : o.golden ? 6 : a + Math.floor(Math.random() * (b - a + 1));
    this.schools.spawn({ x: p.x, z: p.z, count, species: sp.sort(() => Math.random() - 0.5).slice(0, 3), quality, golden: o.golden, bounty: o.bounty });
  }
  private monsterCtx(): EndlessMonsterCtx {
    return this.mctx ??= {
      net: this.net, scene: this.g.scene, tele: this.tele, fx: this.bossFx(),
      entity: (id) => this.g.monster(id),
      spec: () => this.spec,
      register: (id, elite) => { this.mine.add(id); if (elite) this.elites.add(id); },
      forget: (id) => { this.mine.delete(id); this.elites.delete(id); },
      live: () => this.phase === "tide",
    };
  }
  private spawnMonster() {
    const sp = this.spec, me = this.net.me;
    const a = Math.random() * Math.PI * 2;
    let x = ARENA.x + Math.cos(a) * (ARENA.r + 6), z = ARENA.z + Math.sin(a) * (ARENA.r + 6);
    if (Math.hypot(x - me.x, z - me.z) < 30) { x = 2 * ARENA.x - x; z = 2 * ARENA.z - z; }
    const brute = Math.random() < sp.bruteChance;
    const elite = !brute && Math.random() < sp.eliteChance;
    // the roster (packs, spitters, crabs, jellies, mines): controllers in endless/monsters
    const type = brute ? "serpent" : pickMonsterType(sp.tide, sp.biome.region);
    if (type !== "serpent") { spawnEndless(this.monsterCtx(), type, { x, z }, { elite }); return; }
    const hp = Math.round(sp.monsterHp * (brute ? 3.2 : elite ? 3 : 1));
    const m = this.net.spawnMonster(brute ? "kraken" : "serpent", { scripted: true, quiet: true, hp, at: { x, z } });
    this.mine.add(m.id);
    if (elite) {
      this.elites.add(m.id);
      setTimeout(() => this.g.monster(m.id)?.setVisual(null, "Elite Serpent", { cls: "elite" }), 50);
    } else if (brute) setTimeout(() => this.g.monster(m.id)?.setVisual(null, "Deep Brute", {}), 50);
    else setTimeout(() => this.g.monster(m.id)?.setVisual(null, "Tide Serpent", {}), 50);
  }
  private spawnBosses() {
    const t = this.run.tide;
    const ids = t === 10 ? ["reef_serpent"] : t === 20 ? ["crab_titan", "reef_serpent"] : (t / 10) % 2 === 1 ? ["crab_titan"] : ["reef_serpent", "crab_titan"];
    ids.forEach((id, i) => setTimeout(() => this.spawnBoss(id, i), i * 2500));
  }
  private bossFx(): BossFx {
    const g = this.g;
    return {
      lineTelegraph: (x1, z1, x2, z2, w, dur) => { this.tele.line(x1, z1, x2, z2, w, dur); sfx.announce(); },
      circleTelegraph: (x, z, r, dur) => this.tele.circle(x, z, r, dur),
      roar: (big) => sfx.roar(big),
      shake: (n) => g.chase.shake(n),
      splash: (x, z, s) => g.fx.splashAt(x, z, s),
      attackAnim: () => { for (const b of this.bosses) g.monster(b.m.id)?.attack(); },
      announce: (t) => g.feed.announce(t, "#ff4fd8", "☠", true),
      dress: (id, rig, name, opts) => g.monster(id)?.setVisual(rig, name, opts),
      spark: (x, y, z, color, n) => g.fx.sparkAt(new THREE.Vector3(x, y, z), color, n ?? 30),
      float: (text, x, y, z, cls) => g.labels.float(text, new THREE.Vector3(x, y, z), cls ?? "hit", 1.2),
      tint: (color, a) => { this.tintEl.style.background = `radial-gradient(ellipse at center, transparent 18%, ${color} 70%)`; this.tintEl.style.opacity = String(Math.max(0, Math.min(1, a))); },
      toast: (html, cls) => g.feed.toast(html, cls ?? "", 3000),
    };
  }
  private spawnBoss(id: string, i: number) {
    if (this.phase !== "tide" && this.phase !== "intro") return;
    const def = getBoss(id);
    if (!def) return;
    const me = this.net.me;
    const a = Math.atan2(me.x - ARENA.x, me.z - ARENA.z) + Math.PI + i * 1.2;
    const x = ARENA.x + Math.sin(a) * ARENA.r * 0.6, z = ARENA.z + Math.cos(a) * ARENA.r * 0.6;
    const hp = Math.round(def.hp * this.spec.bossHpMult);
    const m = this.net.spawnMonster(def.monsterKind, { scripted: true, boss: true, hp, at: { x, z } });
    m.maxHp = hp;
    const ctl = createBossBehaviour(def.id, { net: this.net, monster: m, def, fx: this.bossFx(), startPhase: 0, onPhase: (p) => { this.g.feed.announce(`${def.name}: ${def.phases[p]?.name ?? "enraged"}`, "#ff4fd8", "☠", true); this.g.feed.flash("#ff2d6b", 0.5); } });
    if (!ctl) { this.net.removeMonster(m); return; }
    this.net.controllers.set(m.id, ctl);
    this.bosses.push({ def, m, ctl });
    const e = this.g.monster(m.id);
    if (e) e.root.scale.setScalar(1.7);
    this.g.cinematic(m.x, m.z, 2.6);
    this.ui.bossCard(def.name, def.epithet ?? "");
    sfx.roar(true);
    this.g.chase.shake(0.7);
  }

  // ======================================================================= fishing
  private rollTier(quality: number, minTier?: Tier, maxTier?: Tier): Tier {
    const luck = Math.max(0, 1 + this.stats.luck / 100), t = this.run.tide;
    const w: [Tier, number][] = [
      ["common", 60],
      ["rare", 24 * (1 + quality * 0.6) * luck * (1 + t * 0.015)],
      ["gold", 8 * (1 + quality * 1.2) * luck * (1 + t * 0.03)],
      ["epic", 2.2 * (1 + quality * 2) * luck * (1 + t * 0.04)],
      ["legendary", 0.45 * (1 + quality * 3) * luck * (1 + t * 0.05)],
    ];
    const lo = minTier ? tierRank(minTier) : 0, hi = maxTier ? tierRank(maxTier) : 4;
    const pool = w.filter(([k]) => tierRank(k) >= lo && tierRank(k) <= hi);
    const total = pool.reduce((a, [, x]) => a + x, 0);
    let r = Math.random() * total;
    let tier: Tier = pool[0][0];
    for (const [k, x] of pool) { r -= x; if (r <= 0) { tier = k; break; } }
    if ((this.specials.upgradeChance ?? 0) > 0 && tierRank(tier) < hi && Math.random() < (this.specials.upgradeChance ?? 0)) tier = TIERS[tierRank(tier) + 1];
    return tier;
  }
  private makeCard(tier: Tier): FishCardS {
    const ids = this.biomeSpecies(tier);
    const id = ids[Math.floor(Math.random() * ids.length)];
    const sp = getCampaignSpecies(id);
    const kg = sp ? Math.round((sp.minKg + (sp.maxKg - sp.minKg) * Math.pow(Math.random(), 1.8)) * 10) / 10 : 1;
    const t = sp?.tier ?? tier;
    return { speciesId: id, tier: t, weightKg: kg, points: fishPoints(t, kg), at: Date.now(), catcher: this.net.me.name };
  }
  private manualRoll() {
    const me = this.net.me;
    const s = this.schools.at(me.bobX, me.bobZ);
    let tier: Tier;
    if (this.events.hooksShiny(s)) tier = "legendary";
    else if (s?.bounty && !this.bountyDone) tier = "epic";
    else if (s) tier = this.rollTier(s.quality + 0.5, s.golden ? "gold" : undefined);
    else tier = this.rollTier(-0.5, undefined, "rare");
    if (s) { this.schools.take(s, 1); if (s.bounty) { this.bountyDone = true; this.freeItem = true; this.g.feed.toast("<b>🎯 Bounty fish hooked!</b> Land it: the next shop has a free item.", "good", 3200); } }
    const card = this.makeCard(tier);
    const sp = getCampaignSpecies(card.speciesId);
    return { speciesId: card.speciesId, tier: card.tier, weightKg: card.weightKg, points: card.points, behaviour: sp?.behaviour };
  }
  private biteMult(x: number, z: number) {
    if (this.phase !== "tide") return 3;
    return this.schools.at(x, z) ? 0.3 : 1.5;
  }
  private onManualCatch(card: FishCardS) {
    this.run.counters.manualFish++;
    this.countFish(card);
    this.net.addXp(Math.round(FISH_XP[card.tier] * 1.25));
  }
  private countFish(card: FishCardS) {
    const c = this.run.counters;
    c.fish++;
    this.tideFish.push(card);
    if (card.tier === "legendary") { c.legendaries++; this.meta.stats.legendaries = (this.meta.stats.legendaries ?? 0) + 1; }
    if (card.tier === "epic") c.epics++;
    const v = this.fishCoins(card);
    if (v > c.bestFishCoins) { c.bestFishCoins = v; c.bestFishId = card.speciesId; c.bestFishKg = card.weightKg; c.bestFishTier = card.tier; }
    this.meta.stats.fish = (this.meta.stats.fish ?? 0) + 1;
    const tr = this.meta.trophies[card.speciesId];
    if (!tr || card.weightKg > tr.kg) this.meta.trophies[card.speciesId] = { kg: card.weightKg, tier: card.tier, at: Date.now() };
  }
  fishCoins(c: FishCardS) {
    const sp = getCampaignSpecies(c.speciesId);
    const wk = sp ? (c.weightKg - sp.minKg) / Math.max(0.01, sp.maxKg - sp.minKg) : 0.5;
    let v = FISH_COINS[c.tier] * (0.8 + 0.4 * Math.max(0, Math.min(1, wk))) * pct(this.stats.haul);
    if (tierRank(c.tier) >= 2) v *= 1 + (this.specials.goldBonus ?? 0);
    if (this.run.danger >= 4) v *= 0.8;
    return Math.max(1, Math.round(v));
  }
  /** a rig catch goes into the hold (with a flying fish from the school) */
  private rigCatch(tier: Tier, from: { x: number; z: number } | null, net = false) {
    const card = this.makeCard(tier);
    const run = this.run;
    run.counters.rigFish++;
    if (net) { run.counters.netFish++; this.meta.stats.netFish = (this.meta.stats.netFish ?? 0) + 1; }
    this.countFish(card);
    this.net.addXp(FISH_XP[card.tier]);
    const land = () => this.addToHold(card, true);
    if (from) this.flyers.launch(card.speciesId, from.x, from.z, () => this.g.boat()?.position ?? null, land);
    else land();
  }
  private addToHold(card: FishCardS, fx: boolean) {
    const me = this.net.me;
    me.unbanked.push(card);
    me.unbankedPoints += card.points;
    if (fx) {
      const bp = this.g.boat()?.position;
      if (bp) this.g.labels.float(`+${this.fishCoins(card)}●`, new THREE.Vector3(bp.x + (Math.random() - 0.5) * 2, bp.y + 4.5, bp.z), tierRank(card.tier) >= 2 ? "pts" : "xp", 1.1);
      if (tierRank(card.tier) >= 3) { sfx.catchJingle(card.tier); this.g.feed.flash(TIER_INFO[card.tier].color, 0.3); }
      else sfx.reelClick();
    }
  }
  private addCoins(n: number) { if (n <= 0) return; this.run.coins += n; this.run.earned += n; }

  // ======================================================================= combat
  private onKill(m: MonsterS, boss: boolean) {
    const b = this.bosses.find((x) => x.m.id === m.id);
    if (b) {
      this.bosses = this.bosses.filter((x) => x !== b);
      this.run.counters.bossKills++;
      this.meta.stats[`boss_${b.def.id}`] = (this.meta.stats[`boss_${b.def.id}`] ?? 0) + 1;
      for (let i = 0; i < 14; i++) this.loot.drop("coin", m.x, m.z, 2 + Math.floor(this.run.tide / 3));
      this.net.addXp(600 + this.run.tide * 40);
      this.g.slowmo(0.3, 1.4);
      this.g.feed.flash("#ffffff", 0.8);
      this.g.fx.confettiAt(new THREE.Vector3(m.x, 3, m.z));
      sfx.catchJingle("legendary");
      this.g.feed.announce(`${b.def.name} defeated!`, "#ffd24a", "🏆", true);
      this.tele.clear();
      this.events.dropChest(m.x, m.z, "boss");
      return;
    }
    if (!this.mine.has(m.id)) return;
    void boss;
    this.mine.delete(m.id);
    const elite = this.elites.delete(m.id);
    if (elite && Math.random() < 0.25) this.events.dropChest(m.x, m.z, "elite"); // a quarter of elites carry a chest
    else if (!elite && m.kind === "kraken" && Math.random() < 0.35) this.events.dropChest(m.x, m.z, "elite"); // brutes: chests on Danger 0 too
    const run = this.run;
    run.counters.kills++;
    this.meta.stats.kills = (this.meta.stats.kills ?? 0) + 1;
    const rw = takeEndlessReward(m.id); // roster type multipliers (Piranha Pack pays little, …)
    const coins = Math.round(this.spec.killCoins * rw.coin * (captainRules(run).monsterCoins ?? 1) * (elite ? 1.5 : m.kind === "kraken" ? 3 : 1));
    const drops = Math.min(8, Math.max(1, Math.round(coins / 2)));
    for (let i = 0; i < drops; i++) this.loot.drop("coin", m.x, m.z, Math.max(1, Math.round(coins / drops)));
    if (elite || m.kind === "kraken") this.loot.drop("fish", m.x, m.z, 0, this.makeCard(this.rollTier(1.5, "gold")), 10);
    this.net.addXp(Math.round(this.spec.killXp * rw.xp * (elite ? 1.5 : m.kind === "kraken" ? 3 : 1)));
    // swarm / split pieces (Piranha Pack 0.3, Jellylet 0.4 coin weight) heal by that weight; normal monsters full value
    if (this.specials.killHeal) this.net.heal(this.specials.killHeal * (rw.coin < 0.5 ? rw.coin : 1));
  }
  private onDamaged(amount: number, by: string) {
    this.run.counters.damageTaken += amount;
    if (!/^m\d+$/.test(by)) return;
    const me = this.net.me;
    if (!me.unbanked.length) return;
    const n = Math.max(1, Math.round(me.unbanked.length * 0.06 * (1 - Math.min(0.9, this.specials.spillGuard ?? 0))));
    for (let i = 0; i < n && me.unbanked.length; i++) {
      const card = me.unbanked.splice(Math.floor(Math.random() * me.unbanked.length), 1)[0];
      me.unbankedPoints = Math.max(0, me.unbankedPoints - card.points);
      this.loot.drop("fish", me.x, me.z, 0, card);
      this.run.counters.spilled++;
    }
    this.g.feed.toast(`<b>🐟 ${n} fish spilled!</b> Grab them before they sink.`, "bad", 1600);
  }
  private speedFor(m: MonsterS) {
    let k = 1 - Math.min(0.6, this.specials.monsterSlow ?? 0);
    if (this.elites.has(m.id)) k *= 1.2;
    if ((this.slowUntil.get(m.id) ?? 0) > this.time) k *= 0.4;
    return k;
  }
  private targets(x: number, z: number, range: number): MonsterS[] {
    const out: MonsterS[] = [];
    this.net.state.monsters.forEach((m) => { if (m.state !== "submerged" && Math.hypot(m.x - x, m.z - z) < range) out.push(m); });
    return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }
  private hit(m: MonsterS, dmg: number, opts: { sx?: number; sz?: number; fx?: boolean } = {}) {
    const isBoss = this.bosses.some((b) => b.m.id === m.id);
    const d = dmg * (isBoss ? 1 + (this.specials.bossDmg ?? 0) : 1);
    this.net.strike(m, d, { ...opts, crit: Math.random() < (this.net.loadout.skills.critChance ?? 0) });
  }

  // ======================================================================= rigs
  /** the n nearest live schools in range (Cast Net; Kraken Net takes 2) */
  private nearSchools(range: number, n: number): School[] {
    const me = this.net.me, out: School[] = [];
    for (let i = 0; i < n; i++) { const sc = this.schools.nearest(me.x, me.z, range, (x) => !out.includes(x)); if (!sc) break; out.push(sc); }
    return out;
  }
  private slowFor(id: string, sec: number) { this.slowUntil.set(id, Math.max(this.slowUntil.get(id) ?? 0, this.time + sec)); }
  private rigRange(base: number) { return base * pct(this.stats.range) * (this.spec.modifier === "fog" ? 0.5 : 1); }
  private updateRigs(dt: number) {
    const me = this.net.me, s = this.stats;
    const eng = pct(s.engineering);
    const rodSet = this.classCount.rod >= 6 ? 1.5 : this.classCount.rod >= 4 ? 1.25 : this.classCount.rod >= 2 ? 1.1 : 1;
    const moved = Math.hypot(me.x - this.lastX, me.z - this.lastZ);
    this.lastX = me.x; this.lastZ = me.z;
    const boost = this.rigBoost;
    const pierce = this.classCount.harpoon >= 4 ? 2 : this.classCount.harpoon >= 2 ? 1 : 0;
    const harpoonMult = pct(s.harpoon) * (this.classCount.harpoon >= 4 ? 1.1 : 1) * boost;
    const netPlus = (this.specials.netPlus ?? 0) + (this.classCount.net >= 2 ? 1 : 0);
    const inkChain = hasComboFlag(this.run, "inkChain"), blastFishing = hasComboFlag(this.run, "blastFishing");
    for (const slot of this.run.rigs) {
      const def = RIGS_BY_ID[slot.id];
      if (!def) continue;
      const rt = this.rigRt.get(slot.uid) ?? { t: 0, acc: 0 };
      this.rigRt.set(slot.uid, rt);
      const ti = slot.tier - 1;
      let speed = eng;
      if (def.cls === "rod") speed *= rodSet;
      if (def.cls === "harpoon" || def.id === "drone") speed *= pct(s.fireRate);
      // ★ evolved rig (evolutions.ts): faster, stronger, further; per-rig extras below
      const evo = evolutionOf(slot);
      if (evo) speed /= evo.cdMult;
      const power = evo ? Math.round(def.power[ti] * evo.powerMult * 10) / 10 : def.power[ti];
      const range = this.rigRange(def.range) * (evo?.rangeMult ?? 1);
      switch (def.id) {
        case "trolling": {
          if (captainRules(this.run).noFishing) break;
          rt.acc += moved * speed;
          if (rt.acc >= power) { rt.acc -= power; for (let i = 0; i < boost; i++) this.rigCatch(this.rollTier(0, undefined, "rare"), { x: me.x - Math.sin(me.rot) * 8, z: me.z - Math.cos(me.rot) * 8 }); }
          continue;
        }
        case "chum": {
          for (const sc of this.schools.list) {
            const dx = me.x - sc.x, dz = me.z - sc.z, d = Math.hypot(dx, dz);
            if (d < range && d > 9) { sc.x += (dx / d) * power * dt; sc.z += (dz / d) * power * dt; }
          }
          continue;
        }
        case "deep": {
          if (Math.abs(me.speed) > 3.5) continue;
          rt.t += dt * speed;
          if (rt.t >= def.cooldown[ti]) { rt.t = 0; for (let i = 0; i < power * boost; i++) setTimeout(() => this.rigCatch(this.rollTier(1, "gold"), { x: me.x + 4, z: me.z + 4 }), i * 300); this.g.feed.toast("<b>⚓ Deep Line:</b> something heavy came up!", "good", 1600); }
          continue;
        }
      }
      rt.t += dt * speed;
      if (rt.t < def.cooldown[ti]) continue;
      switch (def.id) {
        case "bobber": {
          const sc = this.schools.nearest(me.x, me.z, range);
          if (!sc) { rt.t = def.cooldown[ti] * 0.8; break; }
          rt.t = 0;
          const n = this.schools.take(sc, power * boost);
          for (let i = 0; i < n; i++) setTimeout(() => this.rigCatch(this.rollTier(sc.quality, sc.golden ? "gold" : evo?.minTier, slot.tier >= 3 || sc.golden ? undefined : "gold"), sc), i * 160);
          this.g.fx.splashAt(sc.x, sc.z, 0.7);
          break;
        }
        case "castnet": case "trawl": {
          const list = def.id === "castnet" ? this.nearSchools(range, 1 + (evo?.extraTargets ?? 0)) : this.schools.list.filter((x) => x.count > 0 && !x.dying && Math.hypot(x.x - me.x, x.z - me.z) < range);
          if (!list.length) { rt.t = def.cooldown[ti] * 0.85; break; }
          rt.t = 0;
          let budget = (power + netPlus) * boost;
          for (const sc of list) {
            const n = this.schools.take(sc, Math.ceil(budget / list.length));
            budget -= n;
            this.netFx(sc.x, sc.z, sc.r);
            for (let i = 0; i < n; i++) setTimeout(() => this.rigCatch(this.rollTier(sc.quality - 0.3, sc.golden ? "gold" : undefined, sc.golden ? undefined : "gold"), sc, true), i * 110);
          }
          if (this.classCount.net >= 3) for (const l of this.loot.list) if (Math.hypot(l.x - me.x, l.z - me.z) < range) { l.x += (me.x - l.x) * 0.8; l.z += (me.z - l.z) * 0.8; }
          break;
        }
        case "harpoongun": {
          const tg = this.targets(me.x, me.z, range);
          if (!tg.length) { rt.t = def.cooldown[ti] * 0.9; break; }
          rt.t = 0;
          for (const m of tg.slice(0, 1 + pierce + (evo?.extraTargets ?? 0))) this.hit(m, power * harpoonMult);
          sfx.harpoon();
          break;
        }
        case "chain": {
          const tg = this.targets(me.x, me.z, range);
          if (!tg.length) { rt.t = def.cooldown[ti] * 0.9; break; }
          rt.t = 0;
          let cur = tg[0], dmg = power * harpoonMult;
          this.hit(cur, dmg);
          const chainSlow = Math.max(evo?.slow ?? 0, inkChain ? 1 : 0);
          if (chainSlow) this.slowFor(cur.id, chainSlow);
          const hitIds = new Set([cur.id]);
          const jumps = (slot.tier >= 3 ? 3 : 2) + pierce + (evo?.jumps ?? 0);
          for (let j = 0; j < jumps; j++) {
            const next = this.targets(cur.x, cur.z, 22).find((m) => !hitIds.has(m.id));
            if (!next) break;
            dmg *= 0.85;
            const from = cur;
            setTimeout(() => { this.hit(next, dmg, { sx: from.x, sz: from.z }); if (chainSlow) this.slowFor(next.id, chainSlow); }, 120 * (j + 1));
            hitIds.add(next.id);
            cur = next;
          }
          sfx.harpoon();
          break;
        }
        case "charge": {
          const tg = this.targets(me.x, me.z, range)[0];
          const sc = tg ? null : this.schools.nearest(me.x, me.z, range);
          const at = tg ?? sc;
          if (!at) { rt.t = def.cooldown[ti] * 0.85; break; }
          rt.t = 0;
          const x = at.x, z = at.z, r = 10 * (this.classCount.explosive >= 2 ? 1.3 : 1) * (evo?.radiusMult ?? 1);
          this.tele.circle(x, z, r, 0.55, () => {
            this.g.fx.splashAt(x, z, 3.2);
            this.g.fx.sparkAt(new THREE.Vector3(x, 1.5, z), "#ffa13a", 60);
            this.g.chase.shake(0.15);
            sfx.slam();
            for (const m of this.targets(x, z, r)) this.hit(m, power * (1 + s.harpoon / 200) * boost, { fx: false });
            const near = this.schools.list.filter((q) => q.count > 0 && !q.dying && Math.hypot(q.x - x, q.z - z) < r + q.r);
            for (const q of near) { const n = this.schools.take(q, 1 + slot.tier + (evo?.stunFish ?? 0) + (blastFishing ? 2 : 0)); for (let i = 0; i < n; i++) setTimeout(() => this.rigCatch(this.rollTier(q.quality, undefined, "gold"), q), i * 120); }
          }, "#ffa13a");
          break;
        }
        case "drone": {
          const tgs = this.targets(me.x, me.z, range).slice(0, 1 + (evo?.extraTargets ?? 0));
          if (!tgs.length) { rt.t = def.cooldown[ti] * 0.9; break; }
          rt.t = 0;
          if (evo && tgs.length === 1) tgs.push(tgs[0]); // Twin Drones: both zap the lone target
          for (const tg of tgs) {
            this.hit(tg, power * (1 + s.harpoon / 200) * boost, { fx: false });
            this.g.fx.sparkAt(new THREE.Vector3(tg.x, 2, tg.z), evo ? "#9fe8ff" : "#ffe9a0", 18);
          }
          break;
        }
        case "inkjet": {
          const tg = this.targets(me.x, me.z, range);
          if (!tg.length) { rt.t = def.cooldown[ti] * 0.9; break; }
          rt.t = 0;
          for (const m of tg) this.slowUntil.set(m.id, this.time + power);
          this.g.fx.splashAt(me.x, me.z, 2.5, { color: "#1a1030" });
          this.tele.circle(me.x, me.z, range, 0.35, undefined, "#5a2a8a");
          break;
        }
      }
    }
  }
  private netFx(x: number, z: number, r: number) {
    this.tele.circle(x, z, r + 1, 0.35, undefined, "#7fdc6a");
    this.g.fx.splashAt(x, z, 1.4);
  }

  // ======================================================================= hazards
  private makePatches(kind: "fire" | "frost", n: number) {
    for (let i = 0; i < n; i++) {
      const p = this.randomArenaPoint(20);
      const r = kind === "fire" ? 6 + Math.random() * 4 : 9 + Math.random() * 6;
      const mesh = hazardPatch(r, kind === "fire" ? "#ff5a1f" : "#cfefff", kind === "fire" ? 0.6 : 0.35);
      mesh.position.set(p.x, 0, p.z);
      this.g.scene.add(mesh);
      this.patches.push({ x: p.x, z: p.z, r, mesh, kind });
    }
  }
  private clearPatches() { for (const p of this.patches) { this.g.scene.remove(p.mesh); p.mesh.geometry.dispose(); (p.mesh.material as THREE.Material).dispose(); } this.patches = []; }
  private updateHazards(dt: number) {
    const me = this.net.me, sp = this.spec;
    let slow = 1;
    this.patchHurtT -= dt;
    for (const p of this.patches) {
      const inside = Math.hypot(me.x - p.x, me.z - p.z) < p.r;
      if (!inside) continue;
      if (p.kind === "frost") slow = 0.5;
      else if (this.patchHurtT <= 0) { this.patchHurtT = 0.6; this.net.damage(Math.round(3 + this.run.tide * 0.35), "coral"); this.g.fx.sparkAt(new THREE.Vector3(me.x, 1, me.z), "#ff7a2a", 16); }
    }
    this.g.local.speedMult = pct(this.stats.speed) * slow;
    if (sp.biome.hazard === "lightning") {
      this.hazardT -= dt;
      if (this.hazardT <= 0) {
        this.hazardT = 2.2 + Math.random() * 2.4;
        const a = Math.random() * Math.PI * 2, d = Math.random() * 9;
        const x = me.x + Math.cos(a) * d + Math.sin(me.rot) * me.speed * 0.8, z = me.z + Math.sin(a) * d + Math.cos(me.rot) * me.speed * 0.8;
        this.tele.circle(x, z, 6.5, 1.1, () => {
          this.g.fx.sparkAt(new THREE.Vector3(x, 6, z), "#fff6a0", 70);
          this.g.fx.splashAt(x, z, 2);
          this.g.feed.flash("#fff8c0", 0.35);
          sfx.thunder(0.05);
          const m = this.net.me;
          if (Math.hypot(m.x - x, m.z - z) < 6.5) this.net.damage(Math.round(8 + this.run.tide * 0.6), "lightning");
          for (const mon of this.targets(x, z, 6.5)) this.hit(mon, 30 + this.run.tide * 3, { fx: false });
        }, "#ffe45a");
      }
    }
    if (sp.modifier === "rogue_wave") {
      this.rogueNext -= dt;
      if (this.rogueNext <= 0) {
        this.rogueNext = 7 + Math.random() * 4;
        const a = Math.random() * Math.PI * 2;
        const x1 = me.x + Math.cos(a) * 30, z1 = me.z + Math.sin(a) * 30, x2 = me.x - Math.cos(a) * 30, z2 = me.z - Math.sin(a) * 30;
        this.tele.line(x1, z1, x2, z2, 14, 1.4, () => {
          const m = this.net.me;
          const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz);
          const dist = Math.abs((m.x - x1) * dz - (m.z - z1) * dx) / L;
          if (dist < 7) { this.g.local.knockback(m.x - dz / L * 10, m.z + dx / L * 10, 20); this.g.chase.shake(0.4); this.g.fx.splashAt(m.x, m.z, 3); }
        });
      }
    }
  }

  // ======================================================================= frame
  get busy() { return this.phase !== "tide"; }
  get overlayOpen() { return this.ui.open; }
  get trackerLabel() { return `TIDE ${this.run.tide} · ${this.spec?.biome.name.toUpperCase() ?? ""}`; }

  update(dt: number, me: PlayerS | undefined, paused: boolean) {
    const g = this.g;
    this.time += paused ? 0 : dt;
    const t = performance.now() / 1000;
    this.ring.update(t);
    this.tele.update(dt, t);
    this.schools.update(paused ? 0 : dt, t);
    this.flyers.update(dt, t);
    // sky: day that turns to dusk over the tide; the Abyss is night
    const dark = this.spec?.biome.hazard === "dark";
    const k = this.spec ? Math.min(1, this.tideT / this.spec.duration) : 0;
    g.world.sky.forcedHour = dark ? 0.5 : 9.5 + k * 8.5;
    g.world.sky.visMult = dark ? (captainRules(this.run).darkVision ? 0.85 : 0.5) : this.spec?.biome.hazard === "frost" ? 0.7 : 1;
    this.updateLights(t);
    this.net.me.coins = this.run.coins;
    if (me && !paused && this.phase === "tide" && !me.sunk) {
      this.tideT += dt;
      const sp = this.spec;
      // loot
      const pull = this.specials.lootMagnet ? 2 : 1;
      for (const l of this.loot.update(dt, t, me.x, me.z, this.stats.magnet, pull)) {
        if (l.kind === "coin") { this.addCoins(l.value); sfx.coin(); }
        else if (l.card) { this.addToHold(l.card, true); }
      }
      // monsters
      if (this.toSpawn > 0) {
        this.spawnT -= dt;
        const alive = [...this.mine].length;
        if (this.spawnT <= 0 && alive < sp.maxAlive) {
          this.spawnMonster();
          this.toSpawn--;
          this.spawnT = (sp.duration * 0.8) / Math.max(1, sp.monsters) * (0.6 + Math.random() * 0.8);
        }
      }
      if (this.bossSpawnIn >= 0) { this.bossSpawnIn -= dt; if (this.bossSpawnIn < 0) this.spawnBosses(); }
      // schools respawn
      this.schoolT -= dt;
      if (this.schoolT <= 0) { this.schoolT = sp.schoolRespawn; if (this.schools.alive < sp.schools) this.spawnSchool(); }
      // vortex trinket
      if (this.specials.vortex) {
        this.vortexT += dt;
        if (this.vortexT >= this.specials.vortex) {
          this.vortexT = 0;
          for (const s of this.schools.list) { s.x += (me.x - s.x) * 0.5; s.z += (me.z - s.z) * 0.5; }
          for (const l of this.loot.list) { l.x += (me.x - l.x) * 0.7; l.z += (me.z - l.z) * 0.7; }
          this.tele.circle(me.x, me.z, 30, 0.5, undefined, "#5fb8ff");
          sfx.announce();
        }
      }
      // regen below zero (Abyss-Touched)
      if (this.stats.regen < 0) {
        this.waveT += dt;
        if (this.waveT >= 1) { this.waveT = 0; if (me.hp > -this.stats.regen + 1) me.hp += this.stats.regen; else this.net.damage(Math.ceil(-this.stats.regen), "rot"); }
      }
      this.updateRigs(dt);
      this.updateHazards(dt);
      this.events.update(dt);
      // end of the tide (boss tides wait for the bosses)
      if (this.tideT >= sp.duration && (!sp.boss || (this.bosses.length === 0 && this.bossSpawnIn < 0))) this.endTide();
    }
    this.ui.update(dt);
  }

  private updateLights(t: number) {
    const boat = this.g.boat();
    if (!boat) return;
    if (!this.lantern) { this.lantern = new THREE.PointLight("#ffcf7a", 0, 40, 1.2); this.lantern.position.set(0, 3, 0); boat.root.add(this.lantern); }
    const dark = this.spec?.biome.hazard === "dark";
    this.lantern.intensity = dark ? 14 : 0;
    this.lantern.distance = this.rigTier("drone") ? 70 : 42;
    const want = this.rigTier("drone") > 0;
    if (want && !this.drone) {
      this.drone = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: "#fff2b0", emissive: "#ffd24a", emissiveIntensity: 2 }));
      this.drone.add(new THREE.PointLight("#ffd27a", 6, 22, 1.5));
      this.g.scene.add(this.drone);
    }
    if (this.drone) {
      this.drone.visible = want;
      const p = boat.position;
      this.drone.position.set(p.x + Math.cos(t * 1.6) * 6, p.y + 4 + Math.sin(t * 3) * 0.4, p.z + Math.sin(t * 1.6) * 6);
    }
    const twin = this.run.rigs.some((r) => r.id === "drone" && r.evolved === "twin_drones");
    if (twin && !this.drone2) {
      this.drone2 = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: "#e0f8ff", emissive: "#9fe8ff", emissiveIntensity: 2 }));
      this.drone2.add(new THREE.PointLight("#9fe8ff", 5, 20, 1.5));
      this.g.scene.add(this.drone2);
    }
    if (this.drone2) {
      this.drone2.visible = twin;
      const p = boat.position, a = t * 1.6 + Math.PI; // opposite side of the same orbit
      this.drone2.position.set(p.x + Math.cos(a) * 6, p.y + 4 + Math.cos(t * 3) * 0.4, p.z + Math.sin(a) * 6);
    }
  }

  onKey(code: string): boolean {
    if (this.ui.open) return false;
    if ((code === "ShiftLeft" || code === "ShiftRight") && this.specials.dash) { this.dash(); return true; }
    if (code === "Tab") return false;
    return false;
  }
  dash() {
    if (!this.specials.dash || this.phase !== "tide" || performance.now() < this.dashReadyAt) return;
    this.dashReadyAt = performance.now() + 4000;
    const L = this.g.local;
    L.knockback(L.x - Math.sin(L.rot) * 5, L.z - Math.cos(L.rot) * 5, 24);
    this.g.fx.splashAt(L.x, L.z, 2);
    sfx.cast();
  }

  hint(_me: PlayerS | undefined, phase: string) {
    if (this.phase !== "tide") return "";
    if (this.run.tide === 1 && this.tideT < 25 && phase === "idle") return captainRules(this.run).noFishing ? "Your rigs fire on their own: steer close to monsters and grab the coins they drop." : "Cast into a <b>ring of fish</b> for a quick bite. Your rigs work on their own. Grab floating coins.";
    return "";
  }
  mapExtras(): MapExtra[] {
    const out: MapExtra[] = this.schools.list.filter((s) => s.count > 0 && !s.dying).map((s) => ({ x: s.x, z: s.z, icon: s.bounty ? "🎯" : s.golden ? "✨" : "🐟", color: s.golden ? "#ffd24a" : "#bff4ff", pulse: s.golden || s.bounty }));
    for (const l of this.loot.list) if (l.kind === "fish") out.push({ x: l.x, z: l.z, icon: "•", color: "#ff9a6a" });
    out.push(...this.events.mapExtras());
    return out;
  }
  bossBar(): BossBarInfo | null {
    const b = this.bosses.find((x) => x.m.state !== "submerged") ?? this.bosses[0];
    if (!b) return null;
    return { name: b.def.name, hp: b.m.hp, maxHp: b.m.maxHp, pips: b.def.phases.slice(1).map((p) => p.atPct), phase: b.ctl.phase };
  }
  isBoss(id: string) { return this.bosses.some((b) => b.m.id === id); }
  trackerItems(): TrackerItem[] {
    if (!this.spec) return [];
    const left = Math.max(0, Math.ceil(this.spec.duration - this.tideT));
    const items: TrackerItem[] = [
      { id: "tide", title: this.spec.boss && this.tideT >= this.spec.duration && this.bosses.length ? "Defeat the boss!" : `Survive the tide`, progress: Math.min(this.spec.duration, Math.floor(this.tideT)), target: this.spec.duration, squad: false, numText: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` },
      { id: "hold", title: `Hold: ${this.net.me.unbanked.length} fish`, progress: 0, target: 1, squad: false, numText: `≈${this.net.me.unbanked.reduce((a, c) => a + this.fishCoins(c), 0)}●`, optional: true },
    ];
    if (this.spec.modifier) items.push({ id: "mod", title: `${MODIFIERS[this.spec.modifier].icon} ${MODIFIERS[this.spec.modifier].name}`, progress: 0, target: 1, squad: false, numText: "", optional: true });
    return items;
  }
  lockedBorder() { return null; }
  /** the arena wall */
  clampBoat(p: { x: number; z: number; speed: number }) {
    const dx = p.x - ARENA.x, dz = p.z - ARENA.z, d = Math.hypot(dx, dz);
    const max = ARENA.r - 1;
    if (d > max) { p.x = ARENA.x + (dx / d) * max; p.z = ARENA.z + (dz / d) * max; p.speed *= 0.5; }
  }
  private markSeen() {
    const s = this.meta.seen;
    for (const r of this.run.rigs) if (!s.rigs.includes(r.id)) s.rigs.push(r.id);
    for (const id of Object.keys(this.run.trinkets)) if (!s.trinkets.includes(id)) s.trinkets.push(id);
  }
  /** after buying (Almanac + stats) */
  changed() { this.markSeen(); this.refreshStats(false); this.combos?.check(); this.saveRun(); }
  get captain() { return CAPTAINS_BY_ID[this.run.captain]; }
  biomeAt(tide: number) { return BIOMES[Math.floor((tide - 1) / 4) % BIOMES.length]; }
  trinketDef(id: string) { return TRINKETS_BY_ID[id]; }
}
