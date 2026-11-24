/**
 * Headless Endless Tide balance simulator. Run: `npm run balance:endless -w client` (flags after `--`):
 *   --runs=N (300)  --captain=<id|all> (marlow)  --danger=<0-5|all> (0)  --bot=<casual|average|skilled|all> (all)
 *   --harbour=<none|half|max> (none)  --seed=N (1)  --maxTide=N (30)  --dt=S (0.25)  --unlocks=<all|base> (all)
 *   --workers=N (cores-1)  --write (docs/ENDLESS_BALANCE.md)  --json (machine-readable summary on stdout)
 *   --debug (per-tide trace of each run on stderr; use with --runs=1 --workers=1)
 * With no --captain/--danger filter the default report also runs the captain table (Danger 0, skilled), the danger
 * ladder (skilled Marlow, Danger 0-5) and a Harbour comparison.
 *
 * WHAT IS REAL: every rule in @freek/shared is called directly, so tuning those files changes the results: newRun,
 * computeStats (trinkets, captains, companions, Harbour, combos), tideSpec, rollShop / buy / merge / sell / sellValue /
 * rerollCost, rollLevelOffers / takeLevel, interestFor, evolvable / evolve / activeCombos / hasComboFlag / offerHints,
 * pickMonsterType + ENDLESS_MONSTERS (HP / damage / reward multipliers, unlock tides, weights), rollChestTier /
 * rollChestReward / applyChestReward, rollTideEvent / rollTrinketFor / rollOffer / MERCHANT_DISCOUNT, pearlsForRun,
 * harbourXpMult / harbourFreeRerolls, levelFromXp, FISH_COINS / FISH_XP, campaign boss HP (getBoss), biome species
 * (weights for the reel), and the real reel physics (ReelSim) played by a bot with reaction delay and aim noise.
 *
 * WHAT IS MIRRORED (client runtime code; each lives in ONE function below marked `// mirrors <file> <method>`; change
 * both when tuning): fish tier roll, fish coins, school spawning, manual fishing timings, rig behaviours (updateRigs),
 * kill coins / xp / kill-heal, hold spill, monster speed slows, monster AI timings (SoloNet serpent/kraken AI and the
 * endless/monsters controllers), boss behaviours (Reef Serpent, Crab Titan + brood), hazards (fire coral, lightning,
 * frost, Abyss-Touched rot), player damage (SoloNet.damage), rig hits (SoloNet.strike, EndlessMode.hit), player
 * harpoon (SoloNet.fireOne + EndlessMode.refreshStats), events (merchant, altar, shiny, treasure rain) and chests.
 *
 * WHAT IS APPROXIMATED: geometry is a coarse 2D model (boat, schools, monsters and patches have positions; monsters
 * steer straight at their preferred distance), dodging is a probability from telegraph time, escape distance, boat
 * speed and bot skill (not real steering), loot pickup is a delay distribution, the player harpoon hits with a bot
 * accuracy per target type, the crab shield is a flank chance, fishing pauses during events are a flat 6 s, there are
 * no level-up rerolls, and a boss tide that runs 240 s past its timer counts as a boss death.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fork } from "node:child_process";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import {
  TIER_INFO, TIERS, tierRank, speciesOfRegion, getBoss, levelFromXp, HARPOON_RANGE, CAST_MAX_DIST, BOAT_MAX_SPEED, BITE_WINDOW_MS,
  RIGS_BY_ID, TRINKETS_BY_ID, CAPTAINS, CAPTAINS_BY_ID, FISH_COINS, FISH_XP, WIN_TIDE, MAX_RIG_TIER, HARBOUR, ENDLESS_MONSTERS, SPLIT_COUNT,
  computeStats, tideSpec, armorMult, pct, newRun, rollShop, buy, merge, mergeable, sell, sellValue, rerollCost, rollLevelOffers, takeLevel,
  interestFor, captainRules, rigSlots, rng32, runRng, pearlsForRun, harbourXpMult, harbourFreeRerolls, pickMonsterType,
  evolvable, evolve, evolutionOf, activeCombos, hasComboFlag, offerHints, rollChestTier, rollChestReward, applyChestReward,
  rollTideEvent, rollOffer, rollTrinketFor, MERCHANT_DISCOUNT, ALTAR_DEAL_IDS, CRIT_CAP,
  type RunState, type Stats, type TideSpec, type Tier, type TrinketSpecial, type RigClass, type Offer, type StatId, type LevelOffer,
  type HarbourLevels, type EndlessMonsterType, type ShopCtx, type ChestTier, type AltarDealId, type RegionId,
} from "@freek/shared";
import { ReelSim, type ReelMods } from "../src/ui/reelSim";

// ================================================================================================ bot profiles
/**
 * Skill knobs. dodge: chance to dodge a feasible telegraph; react: seconds before reacting; kite: how much the bot is
 * already moving when a telegraph appears (0..1); reelDistract: extra reaction while reeling; castDelay: aim time per
 * cast; idle: pause between casts; hookMiss: missed bite window; reel: ReelSim bot (reaction s, aim noise, lapses);
 * harpoonUse: share of ready harpoon shots actually fired; harpoonAcc: hit chance on a plain target; flank: share of
 * hits on an Armored Crab that land outside its shield; hazardAvoid: chance to steer out of a patch / circle in time;
 * lootDelay: mean seconds to grab dropped loot; eventP: chance to go to a merchant / altar / shiny school;
 * mergeP / evolveP: chance to press Merge / Evolve when offered; shop: buying policy; threshold: minimum value per coin;
 * rerolls: max paid rerolls per shop; noise: noise on value judgements.
 */
interface Bot {
  name: "casual" | "average" | "skilled";
  dodge: number; react: number; kite: number; reelDistract: number;
  castDelay: number; idle: number; hookMiss: number;
  reel: { reactS: number; noise: number; every: [number, number]; lapsePerS: number; lapseS: number };
  harpoonUse: number; harpoonAcc: number; flank: number; hazardAvoid: number; lootDelay: number; eventP: number;
  mergeP: number; evolveP: number; shop: "greedy" | "value" | "smart"; threshold: number; rerolls: number; noise: number;
}
const BOTS: Record<Bot["name"], Bot> = {
  casual: {
    name: "casual", dodge: 0.55, react: 0.45, kite: 0, reelDistract: 0.35, castDelay: 1.6, idle: 1.4, hookMiss: 0.18,
    reel: { reactS: 0.36, noise: 0.17, every: [0.12, 0.22], lapsePerS: 0.12, lapseS: 0.45 },
    harpoonUse: 0.75, harpoonAcc: 0.6, flank: 0.12, hazardAvoid: 0.45, lootDelay: 6, eventP: 0.45,
    mergeP: 0.6, evolveP: 0.5, shop: "greedy", threshold: 0, rerolls: 0, noise: 0.6,
  },
  average: {
    name: "average", dodge: 0.7, react: 0.3, kite: 0.5, reelDistract: 0.22, castDelay: 0.9, idle: 0.5, hookMiss: 0.08,
    reel: { reactS: 0.28, noise: 0.12, every: [0.09, 0.16], lapsePerS: 0.06, lapseS: 0.35 },
    harpoonUse: 0.75, harpoonAcc: 0.72, flank: 0.3, hazardAvoid: 0.72, lootDelay: 3.5, eventP: 0.75,
    mergeP: 1, evolveP: 0.9, shop: "value", threshold: 0.3, rerolls: 1, noise: 0.3,
  },
  skilled: {
    name: "skilled", dodge: 0.9, react: 0.22, kite: 1, reelDistract: 0.1, castDelay: 0.45, idle: 0.1, hookMiss: 0.03,
    reel: { reactS: 0.2, noise: 0.08, every: [0.07, 0.12], lapsePerS: 0.03, lapseS: 0.25 },
    harpoonUse: 0.95, harpoonAcc: 0.85, flank: 0.5, hazardAvoid: 0.9, lootDelay: 2, eventP: 0.95,
    mergeP: 1, evolveP: 1, shop: "smart", threshold: 0.4, rerolls: 3, noise: 0.1,
  },
};

// ================================================================================================ CLI
const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const RUNS = Math.max(1, Number(arg("runs") ?? 300));
const SEED = Number(arg("seed") ?? 1) >>> 0;
const MAX_TIDE = Math.max(1, Number(arg("maxTide") ?? 30));
const DT = Math.max(0.05, Number(arg("dt") ?? 0.5));
const WRITE = args.includes("--write");
const JSON_OUT = args.includes("--json");
const DEBUG = args.includes("--debug");
const HARBOUR_MODE = (arg("harbour") ?? "none") as "none" | "half" | "max";
const UNLOCKS = (arg("unlocks") ?? "all") as "all" | "base";
const capArg = arg("captain"), dangerArg = arg("danger"), botArg = arg("bot") ?? "all";
const DEFAULT_REPORT = capArg === undefined && dangerArg === undefined;

function harbourLevels(mode: "none" | "half" | "max"): HarbourLevels {
  const out: HarbourLevels = {};
  if (mode === "none") return out;
  for (const d of HARBOUR) out[d.id] = mode === "max" ? d.costs.length : Math.floor(d.costs.length / 2);
  return out;
}
const CTX: ShopCtx = { unlocked: () => UNLOCKS === "all" };

// ================================================================================================ helpers
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ARENA_R = 64; // client/src/endless/world.ts ARENA.r (arena centre is our origin)
let rnd: () => number = Math.random;
const between = (a: number, b: number) => a + rnd() * (b - a);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** client REEL_TIME (EndlessMode.ts): quick reels for low tiers */
const REEL_TIME: Record<Tier, number> = { common: 0.42, rare: 0.58, gold: 0.8, epic: 0.9, legendary: 1 };

// ================================================================================================ reel bot (real ReelSim)
interface ReelOdds { p: number; sec: number }
const reelCache = new Map<string, ReelOdds>();
/** the biome's catchable species of a tier, with the same fallback as EndlessMode.biomeSpecies */
const speciesCache = new Map<string, ReturnType<typeof speciesOfRegion>>();
function biomeSpecies(region: RegionId, tier: Tier) {
  const k = `${region}|${tier}`;
  let v = speciesCache.get(k);
  if (!v) {
    const all = speciesOfRegion(region).filter((s) => !s.conditions || !Object.keys(s.conditions).length);
    const pool = all.filter((s) => s.tier === tier);
    v = pool.length ? pool : all;
    speciesCache.set(k, v);
  }
  return v;
}
function botReel(bot: Bot, mods: ReelMods, difficulty: number, durMs: number, lvl: number, r: () => number): { ok: boolean; sec: number } {
  const sim = new ReelSim(r);
  sim.start(difficulty, durMs, lvl, mods);
  const B = bot.reel, dt = 1 / 30, delay = Math.round(B.reactS / dt);
  const hist: number[] = [];
  let held = false, decideIn = 0, lapse = 0;
  for (let i = 0; i < 30 * 120; i++) {
    hist.push(sim.fishPos);
    decideIn -= dt; lapse -= dt;
    if (lapse <= 0 && r() < B.lapsePerS * dt) lapse = B.lapseS;
    if (decideIn <= 0 && lapse <= 0) {
      decideIn = B.every[0] + r() * (B.every[1] - B.every[0]);
      const seen = hist[Math.max(0, hist.length - 1 - delay)] + (r() - 0.5) * 2 * B.noise;
      const mid = sim.zonePos + sim.zoneSize * 0.5;
      held = seen > mid + sim.zoneVel * 0.12 || (sim.zoneVel < -0.6 && seen > sim.zonePos + sim.zoneSize * 0.3);
    }
    const res = sim.step(dt, held, 0);
    if (res !== null) return { ok: res, sec: sim.elapsed / 1000 };
  }
  return { ok: false, sec: 120 };
}
/** land chance + mean reel seconds for a tier with the current reel stats (cached on rounded stats) */
function reelOdds(bot: Bot, region: RegionId, tier: Tier, s: Stats, secondWind: boolean, level: number): ReelOdds {
  // mirrors client/src/endless/EndlessMode.ts refreshStats (fillMult, liftMult, ratingKg, zoneBonus)
  const fill = Math.round(pct(s.reel) * 10) / 10, lift = Math.round((1 + Math.max(-0.5, s.reel / 300)) * 20) / 20;
  const rating = Math.round(45 * pct(s.line) / 5) * 5, zone = Math.round(s.zone / 3) * 3 / 100, lv = Math.min(8, level);
  const key = `${bot.name}|${region}|${tier}|${fill}|${lift}|${rating}|${zone}|${secondWind ? 1 : 0}|${lv}`;
  let v = reelCache.get(key);
  if (v) return v;
  let ok = 0, sec = 0;
  const N = 40;
  let h = 2166136261; for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const reelRng = rng32(h >>> 0); // seeded by the key: results don't depend on run order
  for (let i = 0; i < N; i++) {
    const pool = biomeSpecies(region, tier);
    const sp = pool[Math.floor(reelRng() * pool.length)];
    const kg = sp.minKg + (sp.maxKg - sp.minKg) * Math.pow(reelRng(), 1.8);
    const diff = Math.min(1, TIER_INFO[sp.tier].difficulty);
    const dur = Math.round((5000 + diff * 6000) * REEL_TIME[sp.tier]);
    const res = botReel(bot, { behaviour: sp.behaviour, weightKg: kg, ratingKg: rating, fillMult: fill, liftMult: lift, zoneBonus: zone, tensionMult: 1, secondWind }, diff, dur, lv, reelRng);
    if (res.ok) ok++;
    sec += res.sec;
  }
  v = { p: ok / N, sec: sec / N };
  reelCache.set(key, v);
  return v;
}

// ================================================================================================ sim world
interface School { id: number; x: number; z: number; r: number; count: number; quality: number; golden: boolean; bounty: boolean; shiny: boolean; vx: number; vz: number; until: number }
type MonKind = EndlessMonsterType | "brute" | "boss_serpent" | "boss_crab" | "brood";
interface Mon {
  id: number; kind: MonKind; x: number; z: number; hp: number; maxHp: number;
  elite: boolean; mine: boolean; boss: boolean; reward: { coin: number; xp: number };
  rise: number; submergedFor: number; cd: number; cd2: number; wind: number; windKind: string; windEscape: number;
  nextAttack: number; attacks: number; slowUntil: number; dead: boolean;
  // boss state
  st: string; stT: number; phase: number; chain: number; cycles: number; stFor: number; latched: boolean; acc: number; bossId: number;
}
interface Loot { kind: "coin" | "fish"; value: number; tier?: Tier; wk?: number; at: number; life: number }
interface Hold { tier: Tier; wk: number }

interface RunResult {
  reached: number; won: boolean; deathTide: number | null; cause: "monsters" | "boss" | "hazard" | null;
  coinsByTide: number[]; spendByShop: number[]; itemsByShop: number[]; levelAt10: number | null; levelAt20: number | null;
  timeTo20: number | null; boss10: number | null; boss20: number | null; pearls: number;
  rigs: Record<string, number>; trinkets: Record<string, number>; evolutions: string[]; combos: string[]; hazard: string;
  manualShare: number; fish: number; kills: number;
}

class Sim {
  run: RunState;
  stats!: Stats; specials: Partial<Record<TrinketSpecial, number>> = {}; classCount!: Record<RigClass, number>;
  spec!: TideSpec;
  hp = 100; xp = 0; level = 1;
  time = 0; tideT = 0;
  boat = { x: 0, z: 8, hx: 0, hz: -1 };
  schools: School[] = []; schoolSeq = 0; schoolT = 0;
  mons: Mon[] = []; monSeq = 0; toSpawn = 0; spawnT = 0; bossSpawnIn = -1; bossesLeft = 0; bossStart = -1;
  loot: Loot[] = []; hold: Hold[] = []; chests: ChestTier[] = [];
  rigRt = new Map<number, { t: number; acc: number }>();
  patches: { x: number; z: number; r: number; kind: "fire" | "frost" }[] = []; patchHurtT = 0; hazardT = 0; strikes: { x: number; z: number; at: number }[] = [];
  rotT = 0; vortexT = 0; harpoonCd = 0; inFrost = false; frostCheck = 0;
  fish = { st: "idle" as "idle" | "sail" | "cast" | "wait" | "reel" | "busy", t: 0, school: null as School | null, tier: "common" as Tier, landed: false, inSchool: false };
  moved = 0; freeItem = false; bountyDone = false; doubleHold = false; maxAliveBonus = 0;
  event: { id: string; at: number; started: boolean; t: number; shiny?: School } | null = null;
  lastDamage: "monsters" | "boss" | "hazard" = "monsters";
  dead = false;
  res: RunResult;
  constructor(readonly bot: Bot, captain: string, danger: number, harbour: HarbourLevels, seed: number) {
    rnd = rng32(seed);
    this.run = newRun({ captain, danger, seed: Math.floor(rnd() * 2 ** 31), harbour });
    this.res = { reached: 0, won: false, deathTide: null, cause: null, coinsByTide: [], spendByShop: [], itemsByShop: [], levelAt10: null, levelAt20: null, timeTo20: null, boss10: null, boss20: null, pearls: 0, rigs: {}, trinkets: {}, evolutions: [], combos: [], hazard: "", manualShare: 0, fish: 0, kills: 0 };
    this.refresh();
  }
  refresh() {
    const c = computeStats(this.run);
    this.stats = c.stats; this.specials = c.specials; this.classCount = c.classCount;
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.inkChain = hasComboFlag(this.run, "inkChain"); this.blastFishing = hasComboFlag(this.run, "blastFishing");
  }
  inkChain = false; blastFishing = false;
  nextLevelAt = levelFromXp(0).need;
  get rules() { return captainRules(this.run); }

  // ---------------------------------------------------------------- mirrored formulas
  /** mirrors client/src/endless/EndlessMode.ts rollTier */
  rollTier(quality: number, minTier?: Tier, maxTier?: Tier): Tier {
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
    let r = rnd() * total;
    let tier: Tier = pool[0][0];
    for (const [k, x] of pool) { r -= x; if (r <= 0) { tier = k; break; } }
    if ((this.specials.upgradeChance ?? 0) > 0 && tierRank(tier) < hi && rnd() < (this.specials.upgradeChance ?? 0)) tier = TIERS[tierRank(tier) + 1];
    return tier;
  }
  /** a fish card (EndlessMode.makeCard): species of the biome; wk = weight share (kg = min + span × U^1.8) */
  card(tier: Tier): Hold {
    const pool = biomeSpecies(this.spec.biome.region, tier);
    const sp = pool[Math.floor(rnd() * pool.length)];
    return { tier: sp.tier, wk: Math.pow(rnd(), 1.8) };
  }
  /** mirrors client/src/endless/EndlessMode.ts fishCoins */
  fishCoins(c: Hold) {
    let v = FISH_COINS[c.tier] * (0.8 + 0.4 * clamp01(c.wk)) * pct(this.stats.haul);
    if (tierRank(c.tier) >= 2) v *= 1 + (this.specials.goldBonus ?? 0);
    if (this.run.danger >= 4) v *= 0.8;
    return Math.max(1, Math.round(v));
  }
  /** SoloNet.addXp wrapped by the Harbour "Seasoned Crew" multiplier (EndlessMode constructor) */
  addXp(xp: number) {
    if (xp <= 0) return;
    const k = harbourXpMult(this.run);
    this.xp += Math.round(xp * k);
    if (this.xp < this.nextLevelAt) return;
    const lv = levelFromXp(this.xp);
    if (lv.level > this.level) this.run.pendingLevels += lv.level - this.level;
    this.level = lv.level;
    this.nextLevelAt = this.xp - lv.into + lv.need;
  }
  addCoins(n: number) { if (n <= 0) return; this.run.coins += n; this.run.earned += n; }
  /** mirrors EndlessMode.rigCatch (rig fish go into the hold, rig xp = FISH_XP) */
  rigCatch(tier: Tier, net = false) {
    const c = this.card(tier);
    this.run.counters.rigFish++; this.run.counters.fish++;
    if (net) this.run.counters.netFish++;
    this.addXp(FISH_XP[c.tier]);
    this.hold.push(c);
  }
  /** mirrors client/src/endless/EndlessMode.ts refreshStats (the hand harpoon) */
  harpoonDamage() { return Math.round(28 * pct(this.stats.harpoon)); }
  harpoonCooldown() { return Math.round(1100 / pct(this.stats.fireRate)) / 1000; }
  critChance() { return Math.min(CRIT_CAP, this.specials.crit ?? 0); } // mirrors EndlessMode.refreshStats critChance
  rigPowerOf(id: string) { return this.run.rigs.filter((r) => r.id === id).reduce((a, r) => a + RIGS_BY_ID[id].power[r.tier - 1], 0); }
  boatSpeed() { return BOAT_MAX_SPEED * 0.98 * pct(this.stats.speed) * (this.inFrost ? 0.5 : 1); }

  // ---------------------------------------------------------------- schools
  /** mirrors EndlessMode.randomArenaPoint */
  arenaPoint(minFromBoat = 14) {
    for (let i = 0; i < 20; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * ARENA_R * 0.82;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x - this.boat.x, z - this.boat.z) > minFromBoat) return { x, z };
    }
    return { x: 0, z: 0 };
  }
  /** mirrors EndlessMode.spawnSchool (+ world.ts Schools.spawn radius) */
  spawnSchool(o: { golden?: boolean; bounty?: boolean; shiny?: boolean } = {}) {
    const [a, b] = this.spec.schoolFish;
    const p = this.arenaPoint();
    const quality = o.shiny ? 3 : o.golden || o.bounty ? 2 : rnd() < 0.2 + this.run.tide * 0.015 ? 1 : 0;
    const count = o.shiny || o.bounty ? 1 : o.golden ? 6 : a + Math.floor(rnd() * (b - a + 1));
    const s: School = { id: ++this.schoolSeq, x: p.x, z: p.z, r: 5.5 + Math.min(3, count * 0.25), count, quality, golden: !!o.golden || !!o.shiny, bounty: !!o.bounty, shiny: !!o.shiny, vx: (rnd() - 0.5) * 1.2, vz: (rnd() - 0.5) * 1.2, until: o.shiny ? this.tideT + 10 : Infinity };
    this.schools.push(s);
    return s;
  }
  liveSchools() { return this.schools.filter((s) => s.count > 0); }
  /** world.ts Schools.nearest: centre distance minus half the radius */
  nearestSchool(x: number, z: number, maxD: number, skip?: School[]): School | null {
    let best: School | null = null, bd = maxD;
    for (const s of this.schools) {
      if (s.count <= 0 || (skip && skip.includes(s))) continue;
      const d = Math.hypot(s.x - x, s.z - z) - s.r * 0.5;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  /** take fish from a school; the shiny school pays its Legendary to whatever rig took it (events.ts updateShiny) */
  take(s: School, n: number, byRig: boolean) {
    const k = Math.min(n, s.count);
    s.count -= k;
    if (k > 0 && s.shiny && byRig) this.rigCatch("legendary");
    return k;
  }

  // ---------------------------------------------------------------- monsters
  newMon(kind: MonKind, x: number, z: number, hp: number, o: Partial<Mon> = {}): Mon {
    const m: Mon = {
      id: ++this.monSeq, kind, x, z, hp, maxHp: hp, elite: false, mine: true, boss: false, reward: { coin: 1, xp: 1 },
      rise: 0.9, submergedFor: 0, cd: 0, cd2: 0, wind: -1, windKind: "", windEscape: 0, nextAttack: 0, attacks: 0, slowUntil: 0, dead: false,
      st: "", stT: 0, phase: 0, chain: 0, cycles: 0, stFor: 0, latched: false, acc: 0, bossId: 0, ...o,
    };
    this.mons.push(m);
    return m;
  }
  aliveMine() { let n = 0; for (const m of this.mons) if (!m.dead && m.mine) n++; return n; }
  /** mirrors client/src/endless/monsters/base.ts spawnEndless (hp, groups, rewards) + per-type timers */
  spawnRoster(type: EndlessMonsterType, x: number, z: number, elite0: boolean, hpOverride?: number, spread?: number) {
    const def = ENDLESS_MONSTERS[type];
    const elite = elite0 && def.canElite;
    const n = def.group ? def.group[0] + Math.floor(rnd() * (def.group[1] - def.group[0] + 1)) : 1;
    const sp = spread ?? (n > 1 ? 3.5 : 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
      const hp = Math.max(1, Math.round(hpOverride ?? this.spec.monsterHp * def.hpMult * (elite ? 3 : 1)));
      const m = this.newMon(type, x + Math.cos(a) * sp, z + Math.sin(a) * sp, hp, { elite, reward: { coin: def.coinMult, xp: def.xpMult } });
      // controller timers (endless/monsters/*.ts)
      if (type === "swarmer") { m.rise = 0.6 + i * 0.15; m.cd = 1 + rnd(); }
      else if (type === "spitter") m.cd = 2 + rnd();
      else if (type === "shielded") { m.cd = 3 + rnd() * 2; m.cd2 = 1; }
      else if (type === "splitter") m.cd = 1.5 + rnd();
      else if (type === "splitling") { m.rise = 0.25; m.cd = 1.5 + rnd(); }
    }
  }
  /** mirrors client/src/endless/EndlessMode.ts spawnMonster (brute / elite / roster roll, HP) */
  spawnMonster() {
    const sp = this.spec, a = rnd() * Math.PI * 2;
    let x = Math.cos(a) * (ARENA_R + 6), z = Math.sin(a) * (ARENA_R + 6);
    if (Math.hypot(x - this.boat.x, z - this.boat.z) < 30) { x = -x; z = -z; }
    const brute = rnd() < sp.bruteChance;
    const elite = !brute && rnd() < sp.eliteChance;
    const type = brute ? "serpent" : pickMonsterType(sp.tide, sp.biome.region, rnd);
    if (type !== "serpent") { this.spawnRoster(type, x, z, elite); return; }
    const hp = Math.round(sp.monsterHp * (brute ? 3.2 : elite ? 3 : 1));
    // SoloNet.spawnMonster: surfaces after 1.8 s, first attack 5 s after spawning
    this.newMon(brute ? "brute" : "serpent", x, z, hp, { elite, rise: 1.8, nextAttack: this.tideT + 5 });
  }
  /** mirrors EndlessMode.spawnBosses / spawnBoss (ids by tide, HP = def.hp × bossHpMult) */
  spawnBosses() {
    const t = this.run.tide;
    const ids = t === 10 ? ["reef_serpent"] : t === 20 ? ["crab_titan", "reef_serpent"] : (t / 10) % 2 === 1 ? ["crab_titan"] : ["reef_serpent", "crab_titan"];
    this.bossStart = this.tideT;
    ids.forEach((id, i) => {
      const def = getBoss(id)!;
      const a = Math.atan2(this.boat.x, this.boat.z) + Math.PI + i * 1.2;
      const hp = Math.round(def.hp * this.spec.bossHpMult);
      const m = this.newMon(id === "reef_serpent" ? "boss_serpent" : "boss_crab", Math.sin(a) * ARENA_R * 0.6, Math.cos(a) * ARENA_R * 0.6, hp, { boss: true, mine: false, st: "rising", rise: i * 2.5 });
      void m;
      this.bossesLeft++;
    });
  }
  /** mirrors EndlessMode.speedFor */
  speedMult(m: Mon) {
    let k = 1 - Math.min(0.6, this.specials.monsterSlow ?? 0);
    if (m.elite) k *= 1.2;
    if (m.slowUntil > this.time) k *= 0.4;
    return k;
  }
  targetable(m: Mon) {
    if (m.dead || m.rise > 0 || m.submergedFor > 0) return false;
    if (m.boss && (m.st === "rising" || m.st === "dive")) return false;
    return true;
  }
  targets(x: number, z: number, range: number): Mon[] {
    const out: Mon[] = [];
    for (const m of this.mons) if (this.targetable(m) && Math.hypot(m.x - x, m.z - z) < range) out.push(m);
    return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }
  /** damageScale of the controllers: Armored Crab shield (flank chance), Crab Titan shell (open = ×2, closed = 0) */
  damageScale(m: Mon) {
    if (m.kind === "shielded") return rnd() < this.bot.flank ? 1 : 0.2;
    if (m.kind === "boss_crab") return m.st === "open" ? 2 : 0;
    return 1;
  }
  /** mirrors client/src/endless/EndlessMode.ts hit (boss bonus + crit roll) → SoloNet.strike */
  hit(m: Mon, dmg: number) {
    const d = dmg * (m.boss ? 1 + (this.specials.bossDmg ?? 0) : 1);
    this.strike(m, d, rnd() < this.critChance());
  }
  /** mirrors client/src/solo/SoloNet.ts strike (scale, crit) + the controllers' onHit */
  strike(m: Mon, dmg: number, crit0: boolean) {
    if (!this.targetable(m)) return;
    const scale = this.damageScale(m);
    const crit = crit0 || scale > 1;
    const amount = Math.max(0, Math.round(dmg * (crit ? 2 : 1) * (scale > 1 ? scale / 2 : scale)));
    this.applyHit(m, amount);
  }
  applyHit(m: Mon, amount: number) {
    if (m.dead) return;
    if (amount > 0) m.hp = Math.max(0, m.hp - amount);
    // controller onHit
    if ((m.kind === "swarmer" || m.kind === "brood") && amount > 0) m.hp = 0; // any hit kills one
    if (m.boss && m.phase === 0 && m.hp > 0 && m.hp / m.maxHp <= 0.5) this.bossPhase(m);
    if (m.hp <= 0) this.kill(m);
  }
  /** mirrors client/src/endless/EndlessMode.ts onKill (+ jelly split, puffer pop, boss rewards and chests) */
  kill(m: Mon) {
    m.dead = true;
    const run = this.run, sp = this.spec;
    if (m.kind === "bomber") this.pufferBlast(m, false);
    if (m.kind === "splitter") { // Jelly Bloom splits (splitter.ts onHit)
      const n = SPLIT_COUNT[0] + Math.floor(rnd() * (SPLIT_COUNT[1] - SPLIT_COUNT[0] + 1));
      for (let i = 0; i < n; i++) this.spawnRoster("splitling", m.x, m.z, false, undefined, 3.5);
    }
    if (m.boss) {
      this.bossesLeft--;
      run.counters.bossKills++;
      for (let i = 0; i < 14; i++) this.dropLoot({ kind: "coin", value: 2 + Math.floor(run.tide / 3), at: this.tideT, life: 14 });
      this.addXp(600 + run.tide * 40);
      this.chests.push(rollChestTier("boss", run.tide, this.stats.luck, rnd));
      if (m.kind === "boss_crab") for (const c of this.mons) if (c.kind === "brood" && c.bossId === m.id) c.dead = true;
      if (this.bossesLeft <= 0 && this.bossStart >= 0) {
        const t = this.tideT - this.bossStart;
        if (run.tide === 10) this.res.boss10 = t;
        if (run.tide === 20) this.res.boss20 = t;
      }
      return;
    }
    if (!m.mine) return;
    const brute = m.kind === "brute";
    if (m.elite) { if (rnd() < 0.25) this.chests.push(rollChestTier("elite", run.tide, this.stats.luck, rnd)); }
    else if (brute && rnd() < 0.35) this.chests.push(rollChestTier("elite", run.tide, this.stats.luck, rnd));
    run.counters.kills++;
    const rw = m.reward;
    const coins = Math.round(sp.killCoins * rw.coin * (this.rules.monsterCoins ?? 1) * (m.elite ? 1.5 : brute ? 3 : 1));
    const drops = Math.min(8, Math.max(1, Math.round(coins / 2)));
    for (let i = 0; i < drops; i++) this.dropLoot({ kind: "coin", value: Math.max(1, Math.round(coins / drops)), at: this.tideT, life: 14 });
    if (m.elite || brute) { const c = this.card(this.rollTier(1.5, "gold")); this.dropLoot({ kind: "fish", value: 0, tier: c.tier, wk: c.wk, at: this.tideT, life: 10 }); }
    this.addXp(Math.round(sp.killXp * rw.xp * (m.elite ? 1.5 : brute ? 3 : 1)));
    if (this.specials.killHeal) this.heal(this.specials.killHeal * (rw.coin < 0.5 ? rw.coin : 1));
  }
  heal(n: number) { this.hp = Math.min(this.stats.maxHp, this.hp + n); }
  /** mirrors client/src/endless/monsters/bomber.ts blast */
  pufferBlast(m: Mon, self: boolean) {
    const dmg = Math.round(this.spec.monsterHp * (self ? 0.6 : 1.1));
    for (const o of this.mons) {
      if (o === m || o.boss || !this.targetable(o)) continue;
      if (Math.hypot(o.x - m.x, o.z - m.z) < 9) this.strike(o, dmg, false);
    }
  }
  bossPhase(m: Mon) {
    m.phase = 1;
    if (m.kind === "boss_serpent") { m.st = "dive"; m.stT = 0; } // reefSerpent.ts enterPhase
    else { m.st = "closing"; m.stT = 0; this.summonBrood(m, 2); } // crabTitan.ts enterPhase
  }
  summonBrood(boss: Mon, n: number) {
    const alive = this.mons.filter((c) => !c.dead && c.kind === "brood" && c.bossId === boss.id).length;
    const k = Math.min(n, 4 - alive);
    for (let i = 0; i < k; i++) { const a = rnd() * Math.PI * 2; this.newMon("brood", boss.x + Math.cos(a) * 7, boss.z + Math.sin(a) * 7, 1, { mine: false, rise: 0.5, bossId: boss.id }); }
  }

  // ---------------------------------------------------------------- damage to the player
  /** mirrors client/src/solo/SoloNet.ts damage (armour on everything, monsterDmgMult on monsters) + EndlessMode.onDamaged spill */
  hazardKind = "";
  /** damage taken by source this tide (--debug) */
  dmgBy: Record<string, number> = {};
  damage(amount: number, src: "monsters" | "boss" | "hazard", hz = "", by = "") {
    if (this.dead || amount <= 0) return;
    const fromMonster = src !== "hazard";
    const dmgMult = this.spec.monsterDmg / 20; // EndlessMode.startTide: net.monsterDmgMult
    amount = Math.max(1, Math.round(amount * armorMult(this.stats.armor) * (fromMonster ? dmgMult : 1)));
    this.hp = Math.max(0, this.hp - amount);
    this.run.counters.damageTaken += amount;
    if (DEBUG) { const k = by || hz || src; this.dmgBy[k] = (this.dmgBy[k] ?? 0) + amount; }
    this.lastDamage = src; this.hazardKind = hz;
    if (this.fish.st === "wait") { this.fish.st = "idle"; this.fish.t = 0; } // a hit cancels a waiting cast
    if (fromMonster && this.hold.length) {
      const n = Math.max(1, Math.round(this.hold.length * 0.06 * (1 - Math.min(0.9, this.specials.spillGuard ?? 0))));
      for (let i = 0; i < n && this.hold.length; i++) {
        const c = this.hold.splice(Math.floor(rnd() * this.hold.length), 1)[0];
        this.dropLoot({ kind: "fish", value: 0, tier: c.tier, wk: c.wk, at: this.tideT, life: 5.5 });
        this.run.counters.spilled++;
      }
    }
    if (this.hp <= 0) this.dead = true;
  }
  /** dodge model: can the boat leave the danger area in the telegraph time, and does the bot do it? */
  activeWinds = 0;
  dodged(tele: number, escape: number) {
    if (escape <= 0) return true;
    const B = this.bot, st = this.fish.st;
    const react = B.react + (st === "reel" ? B.reelDistract : 0);
    const kite = st === "reel" ? 0 : st === "wait" || st === "cast" ? B.kite * 0.5 : B.kite;
    const v = this.boatSpeed();
    const feas = clamp01((Math.max(0, tele - react) * v + kite * v * 0.3) / escape);
    const crowd = Math.pow(0.96, Math.max(0, this.activeWinds - 1));
    const dark = this.spec.biome.hazard === "dark" && !this.rules.darkVision && !this.run.rigs.some((r) => r.id === "drone") ? 0.9 : 1;
    const ok = rnd() < B.dodge * feas * crowd * dark;
    if (ok) this.moved += Math.min(escape + 1, v * tele);
    return ok;
  }
  /** after a dodged bite the chaser has to close the gap again */
  pushBack(m: Mon, metres: number) {
    const dx = m.x - this.boat.x, dz = m.z - this.boat.z, d = Math.hypot(dx, dz) || 1;
    m.x += (dx / d) * metres; m.z += (dz / d) * metres;
  }
  moveToward(m: Mon, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const step = Math.min(d, speed * dt);
    m.x += (dx / d) * step; m.z += (dz / d) * step;
  }
  /** approach the boat to `hold` metres */
  approach(m: Mon, hold: number, speed: number, dt: number) {
    const b = this.boat, dx = m.x - b.x, dz = m.z - b.z, d = Math.hypot(dx, dz) || 1;
    if (d <= hold) return;
    this.moveToward(m, b.x + (dx / d) * hold, b.z + (dz / d) * hold, speed, dt);
  }

  /**
   * Monster AI timings. mirrors client/src/solo/SoloNet.ts monsterTick (serpent / kraken = brute) and
   * client/src/endless/monsters/{swarmer,spitter,bomber,shielded,splitter}.ts and solo/bosses/{reefSerpent,crabTitan}.ts.
   * A wind-up resolves after its telegraph: the bot may dodge it (see dodged), else the hit lands.
   */
  monsterTick(m: Mon, dt: number) {
    if (m.rise > 0) { m.rise -= dt; return; }
    if (m.submergedFor > 0) { m.submergedFor -= dt; return; }
    const b = this.boat, d = Math.hypot(m.x - b.x, m.z - b.z), sm = this.speedMult(m);
    m.cd -= dt; m.cd2 -= dt;
    if (m.wind >= 0) {
      m.wind -= dt;
      if (m.wind > 0) return;
      m.wind = -1;
      this.resolveWind(m, d);
      return;
    }
    switch (m.kind) {
      case "serpent": case "brute": {
        const brute = m.kind === "brute";
        const R = brute ? 16 : 9, spd = (brute ? 6 : 9) * sm;
        this.approach(m, R * 0.55, spd * (d > 80 ? 1.6 : 1), dt);
        if (this.tideT >= m.nextAttack && d < R + 5) {
          m.nextAttack = this.tideT + (brute ? 6 : 4);
          m.attacks++;
          this.wind(m, brute ? "brute" : "serpent", brute ? 0.95 : 0.7, brute ? Math.max(1, R - d / 2) : R);
        }
        break;
      }
      case "swarmer": {
        const ring = d > 12 ? 0 : 2.6;
        this.approach(m, ring, 13.5 * sm * (d > 40 ? 1.3 : 1), dt);
        if (d < 4.2 && m.cd <= 0) this.wind(m, "piranha", 0.6, 5 - ring);
        break;
      }
      case "spitter": {
        const spd = 8 * sm;
        if (d < 24) this.pushBack(m, Math.min(24 - d, spd * 1.1 * dt));
        else if (d > 31) this.approach(m, 31, spd * (d > 60 ? 1.5 : 1), dt);
        if (m.cd <= 0 && d < 41) { m.cd = (m.elite ? 2.6 : 3.4) + rnd() * 0.8; this.wind(m, "spit", 1.4, 6); }
        break;
      }
      case "bomber": {
        this.approach(m, 0, 4.5 * sm * (d > 50 ? 2 : 1), dt);
        if (d < 10) this.wind(m, "puffer", 1.3, 10 - d * 0.5);
        break;
      }
      case "shielded": {
        if (m.st === "recover") { if ((m.stT += dt) >= 1.4) m.st = ""; break; }
        this.approach(m, 5, 4.5 * sm * (d > 60 ? 1.8 : 1), dt);
        if (d < 8 && m.cd2 <= 0) { this.wind(m, "pinch", 0.8, 7); }
        else if (d > 12 && d < 34 && m.cd <= 0) { this.wind(m, "charge", 1.0, 5.5); }
        break;
      }
      case "splitter": case "splitling": {
        const child = m.kind === "splitling", stingR = child ? 4 : 6;
        this.approach(m, 2, (child ? 9.5 : 6) * 0.84 * sm * (d > 50 ? 1.5 : 1), dt);
        if (d < stingR - 0.5 && m.cd <= 0) this.wind(m, "sting", 0.8, stingR + 1 - d * 0.5);
        break;
      }
      case "brood": {
        const boss = this.mons.find((x) => x.id === m.bossId);
        if (!boss || boss.dead) { m.dead = true; break; }
        if (!m.latched) { this.approach(m, 0, 12, dt); if (Math.hypot(m.x - b.x, m.z - b.z) < 3) m.latched = true; break; }
        m.x = b.x + 1.4; m.z = b.z;
        m.acc += dt * 4;
        while (m.acc >= 2) { m.acc -= 2; this.damage(2, "boss"); }
        break;
      }
      case "boss_serpent": this.reefSerpent(m, d, dt); break;
      case "boss_crab": this.crabTitan(m, d, dt); break;
    }
  }
  wind(m: Mon, kind: string, tele: number, escape: number) { m.wind = tele; m.windKind = kind; m.windEscape = escape; }
  resolveWind(m: Mon, d: number) {
    const k = m.windKind;
    const tele = { serpent: 0.7, brute: 0.95, piranha: 0.6, spit: 1.4, puffer: 1.3, pinch: 0.8, charge: 1.0, sting: 0.8 }[k] ?? 1;
    const dmgOf = (base: number) => Math.round(base * (m.elite ? 1.25 : 1)); // EndlessMonster.dmg
    const by = m.kind;
    switch (k) {
      case "serpent": case "brute":
        if (!this.dodged(tele, m.windEscape)) this.damage(k === "brute" ? 35 : 20, "monsters", "", by); else this.pushBack(m, 6);
        if (k === "brute" && m.attacks % 3 === 0) m.submergedFor = 6;
        break;
      case "piranha":
        m.cd = 1.4 + rnd() * 0.8;
        if (!this.dodged(tele, m.windEscape)) this.damage(dmgOf(ENDLESS_MONSTERS.swarmer.dmg), "monsters", "", by); else this.pushBack(m, 7);
        break;
      case "spit":
        if (!this.dodged(tele, m.windEscape)) this.damage(dmgOf(ENDLESS_MONSTERS.spitter.dmg), "monsters", "", by);
        break;
      case "puffer": {
        m.dead = true; // went off by itself: no reward (bomber.ts blast(true) → ctx.forget)
        if (d < 10 && !this.dodged(tele, m.windEscape)) this.damage(dmgOf(ENDLESS_MONSTERS.bomber.dmg), "monsters", "", by);
        this.pufferBlast(m, true);
        break;
      }
      case "pinch":
        m.cd2 = 2.6; m.st = "recover"; m.stT = 0;
        if (!this.dodged(tele, m.windEscape)) this.damage(dmgOf(Math.round(ENDLESS_MONSTERS.shielded.dmg * 0.75)), "monsters", "", by); else this.pushBack(m, 5);
        break;
      case "charge":
        m.cd = 5 + rnd() * 2; m.st = "recover"; m.stT = 0;
        if (!this.dodged(tele, m.windEscape)) this.damage(dmgOf(ENDLESS_MONSTERS.shielded.dmg), "monsters", "", by);
        this.pushBack(m, -Math.min(d + 10, 40)); // charges through the boat
        break;
      case "sting":
        m.cd = 2.2 + rnd();
        if (!this.dodged(tele, m.windEscape)) this.damage(dmgOf(ENDLESS_MONSTERS[m.kind as "splitter" | "splitling"].dmg), "monsters", "", by); else this.pushBack(m, 6);
        break;
    }
  }
  /** mirrors client/src/solo/bosses/reefSerpent.ts (circle at 22 m, line lunges, P2 double lunges, dive) */
  reefSerpent(m: Mon, d: number, dt: number) {
    m.stT += dt;
    const fast = m.phase >= 1 ? 1.35 : 1;
    const orbit = (r: number) => { const dx = m.x - this.boat.x, dz = m.z - this.boat.z, dd = Math.hypot(dx, dz) || 1; this.moveToward(m, this.boat.x + (dx / dd) * r, this.boat.z + (dz / dd) * r, 16 * fast, dt); };
    switch (m.st) {
      case "rising": if (m.stT > 1.2) { m.st = "circling"; m.stT = 0; m.stFor = 3; } break;
      case "dive": if (m.stT > 2) { m.st = "circling"; m.stT = 0; m.stFor = 1.5; } break;
      case "circling": orbit(22); if (m.stT > m.stFor) { m.st = "tele"; m.stT = 0; m.stFor = Math.max(0.8, (m.phase >= 1 ? 0.95 : 1.15) - (m.chain ? 0.1 : 0)); this.activeWinds++; } break;
      case "tele":
        if (m.stT >= m.stFor) {
          this.activeWinds = Math.max(0, this.activeWinds - 1);
          if (!this.dodged(m.stFor, 5)) this.damage(m.phase >= 1 ? 26 : 22, "boss");
          this.pushBack(m, -(d + 18) + 18); // ends ~18 m past the boat
          if (m.phase >= 1 && m.chain === 0) { m.chain = 1; m.st = "tele"; m.stT = -0.55 / fast; m.stFor = Math.max(0.8, 0.85); this.activeWinds++; }
          else { m.chain = 0; m.st = "recover"; m.stT = -0.55 / fast; }
        }
        break;
      case "recover": if (m.stT > 1.8 / fast) { m.st = "circling"; m.stT = 0; m.stFor = (m.phase >= 1 ? 2 : 3.2) + rnd() * 1.2; } break;
    }
  }
  /** mirrors client/src/solo/bosses/crabTitan.ts (stalk at 22 m, two slam circles, shell open 3 s, brood in P2) */
  crabTitan(m: Mon, d: number, dt: number) {
    m.stT += dt;
    const p2 = m.phase >= 1, speed = p2 ? 7.5 : 6;
    switch (m.st) {
      case "rising": if (m.stT > 1.4) { m.st = "stalk"; m.stT = 0; m.stFor = 2.5; } break;
      case "stalk":
        if (d > 24) this.approach(m, 22, speed * (d > 60 ? 1.8 : 1), dt);
        if (m.stT > m.stFor && d < 40) { m.st = "windup"; m.stT = 0; m.stFor = Math.max(0.8, p2 ? 1.05 : 1.3); this.activeWinds++; }
        break;
      case "windup":
        if (m.stT >= m.stFor) {
          this.activeWinds = Math.max(0, this.activeWinds - 1);
          if (!this.dodged(m.stFor, 7.5 + 1.2)) this.damage(p2 ? 26 : 22, "boss");
          m.st = "open"; m.stT = 0;
        }
        break;
      case "open": if (m.stT >= 3) { m.st = "closing"; m.stT = 0; } break;
      case "closing":
        if (m.stT >= 0.6) {
          m.cycles++;
          if (p2 && m.cycles % 2 === 0) this.summonBrood(m, 3);
          m.st = "stalk"; m.stT = 0; m.stFor = (p2 ? 1.6 : 2.6) + rnd() * 1.2;
        }
        break;
    }
  }

  // ---------------------------------------------------------------- loot
  /** loot pickup: a delay (bot skill, Magnet, Loot Hook); expired loot is lost, the rest is scooped at tide end */
  dropLoot(l: Loot, near = true) {
    const mag = Math.sqrt(Math.max(2, this.stats.magnet) / 7) * (this.specials.lootMagnet ? 1.5 : 1);
    const mean = (near ? this.bot.lootDelay : this.bot.lootDelay * 3.5) / mag;
    const t = -Math.log(1 - rnd() * 0.999) * mean;
    (l as Loot & { got: number }).got = l.at + t;
    this.loot.push(l);
  }
  updateLoot(final = false) {
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i] as Loot & { got: number };
      if (final || l.got <= this.tideT) {
        if (final || l.got <= l.at + l.life) this.collect(l);
        this.loot.splice(i, 1);
      } else if (this.tideT > l.at + l.life) this.loot.splice(i, 1);
    }
  }
  collect(l: Loot) { if (l.kind === "coin") this.addCoins(l.value); else if (l.tier) this.hold.push({ tier: l.tier, wk: l.wk ?? 0.4 }); }

  // ---------------------------------------------------------------- rigs
  rigRange(base: number) { return base * pct(this.stats.range) * (this.spec.modifier === "fog" ? 0.5 : 1); }
  /** mirrors client/src/endless/EndlessMode.ts updateRigs (cooldowns, power, range, set bonuses, evolutions, combos) */
  updateRigs(dt: number) {
    const s = this.stats, me = this.boat;
    const eng = pct(s.engineering);
    const cc = this.classCount;
    const rodSet = cc.rod >= 6 ? 1.5 : cc.rod >= 4 ? 1.25 : cc.rod >= 2 ? 1.1 : 1;
    const boost = this.rules.rigPower ?? 1;
    const pierce = cc.harpoon >= 4 ? 2 : cc.harpoon >= 2 ? 1 : 0;
    const harpoonMult = pct(s.harpoon) * (cc.harpoon >= 4 ? 1.1 : 1) * boost;
    const netPlus = (this.specials.netPlus ?? 0) + (cc.net >= 2 ? 1 : 0);
    const inkChain = this.inkChain, blastFishing = this.blastFishing;
    const moved = this.moved; this.moved = 0;
    const still = this.fish.st === "wait" || this.fish.st === "reel" || this.fish.st === "cast";
    for (const slot of this.run.rigs) {
      const def = RIGS_BY_ID[slot.id];
      if (!def) continue;
      let rt = this.rigRt.get(slot.uid);
      if (!rt) { rt = { t: rnd() * 1.5, acc: 0 }; this.rigRt.set(slot.uid, rt); }
      const ti = slot.tier - 1;
      let speed = eng;
      if (def.cls === "rod") speed *= rodSet;
      if (def.cls === "harpoon" || def.id === "drone") speed *= pct(s.fireRate);
      const evo = evolutionOf(slot);
      if (evo) speed /= evo.cdMult;
      const power = evo ? Math.round(def.power[ti] * evo.powerMult * 10) / 10 : def.power[ti];
      const range = this.rigRange(def.range) * (evo?.rangeMult ?? 1);
      if (def.id === "trolling") {
        if (this.rules.noFishing) continue;
        rt.acc += moved * speed;
        while (rt.acc >= power) { rt.acc -= power; for (let i = 0; i < boost; i++) this.rigCatch(this.rollTier(0, undefined, "rare")); }
        continue;
      }
      if (def.id === "chum") {
        for (const sc of this.schools) {
          const dx = me.x - sc.x, dz = me.z - sc.z, d = Math.hypot(dx, dz);
          if (d < range && d > 9) { sc.x += (dx / d) * power * dt; sc.z += (dz / d) * power * dt; }
        }
        continue;
      }
      if (def.id === "deep") {
        if (!still) continue; // only below 3.5 m/s: the bot is still while fishing by hand
        rt.t += dt * speed;
        if (rt.t >= def.cooldown[ti]) { rt.t = 0; for (let i = 0; i < power * boost; i++) this.rigCatch(this.rollTier(1, "gold")); }
        continue;
      }
      rt.t += dt * speed;
      let fires = 0;
      while (rt.t >= def.cooldown[ti] && fires++ < 4) {
        const cd = def.cooldown[ti];
        rt.t -= cd;
        switch (def.id) {
          case "bobber": {
            const sc = this.nearestSchool(me.x, me.z, range);
            if (!sc) { rt.t = cd * 0.8; break; }
            const n = this.take(sc, power * boost, true);
            for (let i = 0; i < n; i++) this.rigCatch(this.rollTier(sc.quality, sc.golden ? "gold" : evo?.minTier, slot.tier >= 3 || sc.golden ? undefined : "gold"));
            break;
          }
          case "castnet": case "trawl": {
            let list: School[];
            if (def.id === "castnet") { list = []; for (let i = 0; i < 1 + (evo?.extraTargets ?? 0); i++) { const sc = this.nearestSchool(me.x, me.z, range, list); if (!sc) break; list.push(sc); } }
            else list = this.schools.filter((x) => x.count > 0 && Math.hypot(x.x - me.x, x.z - me.z) < range);
            if (!list.length) { rt.t = cd * 0.85; break; }
            let budget = (power + netPlus) * boost;
            for (const sc of list) {
              const n = this.take(sc, Math.ceil(budget / list.length), true);
              budget -= n;
              for (let i = 0; i < n; i++) this.rigCatch(this.rollTier(sc.quality - 0.3, sc.golden ? "gold" : undefined, sc.golden ? undefined : "gold"), true);
            }
            break;
          }
          case "harpoongun": {
            const tg = this.targets(me.x, me.z, range);
            if (!tg.length) { rt.t = cd * 0.9; break; }
            for (const m of tg.slice(0, 1 + pierce + (evo?.extraTargets ?? 0))) this.hit(m, power * harpoonMult);
            break;
          }
          case "chain": {
            const tg = this.targets(me.x, me.z, range);
            if (!tg.length) { rt.t = cd * 0.9; break; }
            let cur = tg[0], dmg = power * harpoonMult;
            const chainSlow = Math.max(evo?.slow ?? 0, inkChain ? 1 : 0);
            this.hit(cur, dmg);
            if (chainSlow) cur.slowUntil = Math.max(cur.slowUntil, this.time + chainSlow);
            const hitIds = new Set([cur.id]);
            const jumps = (slot.tier >= 3 ? 3 : 2) + pierce + (evo?.jumps ?? 0);
            for (let j = 0; j < jumps; j++) {
              const next = this.targets(cur.x, cur.z, 22).find((m) => !hitIds.has(m.id));
              if (!next) break;
              dmg *= 0.85;
              this.hit(next, dmg);
              if (chainSlow) next.slowUntil = Math.max(next.slowUntil, this.time + chainSlow);
              hitIds.add(next.id);
              cur = next;
            }
            break;
          }
          case "charge": {
            const tg = this.targets(me.x, me.z, range)[0];
            const sc = tg ? null : this.nearestSchool(me.x, me.z, range);
            const at = tg ?? sc;
            if (!at) { rt.t = cd * 0.85; break; }
            const x = at.x, z = at.z, r = 10 * (cc.explosive >= 2 ? 1.3 : 1) * (evo?.radiusMult ?? 1);
            for (const m of this.targets(x, z, r)) this.hit(m, power * (1 + s.harpoon / 200) * boost);
            for (const q of this.schools.filter((q) => q.count > 0 && Math.hypot(q.x - x, q.z - z) < r + q.r)) {
              const n = this.take(q, 1 + slot.tier + (evo?.stunFish ?? 0) + (blastFishing ? 2 : 0), true);
              for (let i = 0; i < n; i++) this.rigCatch(this.rollTier(q.quality, undefined, "gold"));
            }
            break;
          }
          case "drone": {
            const tgs = this.targets(me.x, me.z, range).slice(0, 1 + (evo?.extraTargets ?? 0));
            if (!tgs.length) { rt.t = cd * 0.9; break; }
            if (evo && tgs.length === 1) tgs.push(tgs[0]);
            for (const tg of tgs) this.hit(tg, power * (1 + s.harpoon / 200) * boost);
            break;
          }
          case "inkjet": {
            const tg = this.targets(me.x, me.z, range);
            if (!tg.length) { rt.t = cd * 0.9; break; }
            for (const m of tg) m.slowUntil = this.time + power;
            break;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- player: fishing + harpoon
  castRange() { return (6 + 0.85 * (CAST_MAX_DIST - 6)) * (1 + this.stats.range / 250); } // a strong cast × castMult
  /**
   * Manual fishing. mirrors client/src/solo/SoloNet.ts cast/bite (0.35 s cast, (2–6.5 s) × biteSpeed × biteDelayMult,
   * 900 + 150 ms hook window) and EndlessMode.manualRoll / biteMult / onManualCatch (school take, tier roll, ×1.25 xp).
   */
  updateFishing(dt: number) {
    const f = this.fish, B = this.bot, b = this.boat;
    f.t -= dt;
    if (f.st === "busy") { if (f.t <= 0) f.st = "idle"; return this.sail(dt, null); }
    if (this.rules.noFishing) return this.sail(dt, null);
    if (f.st === "idle" || f.st === "sail") {
      // the bot picks a school: skilled players go for golden / bounty / shiny ones first
      const live = this.liveSchools();
      let target: School | null = null, best = Infinity;
      for (const s of live) {
        const d = dist(s, b) - (B.name === "skilled" ? (s.shiny ? 60 : s.bounty || s.golden ? 30 : s.quality * 8) : s.shiny ? 20 : 0);
        if (d < best) { best = d; target = s; }
      }
      f.school = target;
      const cr = this.castRange();
      if (target && dist(target, b) > cr * 0.85) { f.st = "sail"; return this.sail(dt, target); }
      if (f.st !== "idle" || f.t <= 0) { f.st = "cast"; f.t = 0.35 + B.castDelay * (0.7 + rnd() * 0.6) + B.idle * rnd() * 2; }
      return;
    }
    if (f.st === "cast") {
      if (f.t > 0) return;
      const s = f.school && f.school.count > 0 && dist(f.school, b) < this.castRange() + f.school.r ? f.school : null;
      f.inSchool = !!s && rnd() < (B.name === "casual" ? 0.75 : B.name === "average" ? 0.88 : 0.96);
      const chum = this.rigPowerOf("chum");
      const biteSpeed = 1 / pct(this.stats.bite + chum * 6);
      f.st = "wait"; f.t = (2 + rnd() * 4.5) * biteSpeed * (f.inSchool ? 0.3 : 1.5);
      return;
    }
    if (f.st === "wait") {
      if (f.t > 0) return;
      if (rnd() < B.hookMiss) { // missed the BITE_WINDOW_MS + 150 ms hook window
         f.st = "idle"; f.t = B.idle; return; }
      const s = f.inSchool && f.school && f.school.count > 0 ? f.school : null;
      let tier: Tier;
      if (s?.shiny) tier = "legendary";
      else if (s?.bounty && !this.bountyDone) { tier = "epic"; this.bountyDone = true; this.freeItem = true; }
      else if (s) tier = this.rollTier(s.quality + 0.5, s.golden ? "gold" : undefined);
      else tier = this.rollTier(-0.5, undefined, "rare");
      if (s) this.take(s, 1, false);
      const card = this.card(tier);
      const odds = reelOdds(B, this.spec.biome.region, card.tier, this.stats, (this.specials.secondWind ?? 0) > 0, this.level);
      f.tier = card.tier; f.landed = rnd() < odds.p; f.st = "reel"; f.t = odds.sec;
      (f as typeof f & { card: Hold }).card = card;
      return;
    }
    if (f.st === "reel") {
      if (f.t > 0) return;
      if (f.landed) {
        const card = (f as typeof f & { card: Hold }).card;
        this.run.counters.manualFish++; this.run.counters.fish++;
        this.hold.push(card);
        this.addXp(Math.round(FISH_XP[card.tier] * 1.25));
      }
      f.st = "idle"; f.t = B.idle * (0.5 + rnd());
    }
  }
  sail(dt: number, target: { x: number; z: number } | null) {
    const b = this.boat, v = this.boatSpeed();
    let tx: number, tz: number;
    if (target) { tx = target.x; tz = target.z; }
    else { // kite in a wide circle
      const a = Math.atan2(b.z, b.x) + 0.6;
      tx = Math.cos(a) * ARENA_R * 0.55; tz = Math.sin(a) * ARENA_R * 0.55;
    }
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return;
    const step = Math.min(d, v * dt);
    b.x += (dx / d) * step; b.z += (dz / d) * step; b.hx = dx / d; b.hz = dz / d;
    this.moved += step;
  }
  /** the hand harpoon: mirrors client/src/solo/SoloNet.ts fireOne (no boss bonus; scale; crit) */
  updateHarpoon(dt: number) {
    this.harpoonCd -= dt;
    if (this.harpoonCd > 0 || this.fish.st === "reel") return;
    const B = this.bot;
    let tg = this.targets(this.boat.x, this.boat.z, HARPOON_RANGE);
    if (B.name === "skilled") {
      tg = tg.filter((m) => !(m.kind === "boss_crab" && m.st !== "open"));
      const pri = (m: Mon) => (m.kind === "brood" && m.latched ? 0 : m.kind === "boss_crab" ? 1 : m.kind === "bomber" && dist(m, this.boat) < 18 ? 2 : 3);
      tg.sort((a, b2) => pri(a) - pri(b2));
    }
    const m = tg[0];
    if (!m) return;
    this.harpoonCd = this.harpoonCooldown();
    if (rnd() > B.harpoonUse) return;
    const acc = B.harpoonAcc * (m.kind === "swarmer" || m.kind === "brood" || m.kind === "splitling" ? 0.7 : m.kind === "boss_serpent" ? (m.st === "recover" ? 0.9 : 0.5) : m.kind === "spitter" ? 0.8 : 1);
    if (rnd() > acc) return;
    const scale = this.damageScale(m);
    const crit = rnd() < this.critChance() || scale > 1;
    const dmg = Math.round(this.harpoonDamage() * (crit ? 2 : 1) * (scale > 1 ? scale / 2 : scale));
    this.applyHit(m, dmg);
  }

  // ---------------------------------------------------------------- hazards
  /** mirrors client/src/endless/EndlessMode.ts startTide/makePatches + updateHazards + the rot in update */
  makePatches() {
    const hz = this.spec.biome.hazard;
    if (hz !== "firecoral" && hz !== "frost") return;
    const n = 3 + Math.min(5, Math.floor((this.run.tide - 4) / 1.5));
    for (let i = 0; i < n; i++) {
      const p = this.arenaPoint(20);
      this.patches.push({ x: p.x, z: p.z, r: hz === "firecoral" ? 6 + rnd() * 4 : 9 + rnd() * 6, kind: hz === "firecoral" ? "fire" : "frost" });
    }
  }
  updateHazards(dt: number) {
    const b = this.boat, tide = this.run.tide, avoid = this.bot.hazardAvoid;
    this.patchHurtT -= dt;
    this.frostCheck -= dt;
    if (this.frostCheck <= 0) { this.frostCheck = 2; this.inFrost = this.patches.some((p) => p.kind === "frost" && dist(p, b) < p.r) && rnd() > avoid; }
    if (this.patchHurtT <= 0) {
      this.patchHurtT = 0.6;
      if (this.patches.some((p) => p.kind === "fire" && dist(p, b) < p.r) && rnd() > avoid) this.damage(Math.round(3 + tide * 0.35), "hazard", "coral");
    }
    if (this.spec.biome.hazard === "lightning") {
      this.hazardT -= dt;
      if (this.hazardT <= 0) {
        this.hazardT = 2.2 + rnd() * 2.4;
        const a = rnd() * Math.PI * 2, d = rnd() * 9, v = this.fish.st === "sail" ? this.boatSpeed() : 0;
        this.strikes.push({ x: b.x + Math.cos(a) * d + b.hx * v * 0.8, z: b.z + Math.sin(a) * d + b.hz * v * 0.8, at: this.tideT + 1.1 });
      }
      for (let i = this.strikes.length - 1; i >= 0; i--) {
        const s = this.strikes[i];
        if (this.tideT < s.at) continue;
        this.strikes.splice(i, 1);
        const dd = dist(s, b);
        if (dd < 6.5 && !this.dodged(1.1, 6.5 - dd + 0.5)) this.damage(Math.round(8 + tide * 0.6), "hazard", "lightning");
        for (const mon of this.targets(s.x, s.z, 6.5)) this.hit(mon, 30 + tide * 3);
      }
    }
    // regen (SoloNet repairPerSec) and the Abyss-Touched rot (EndlessMode.update)
    if (this.stats.regen > 0) this.heal(this.stats.regen * dt);
    else if (this.stats.regen < 0) {
      this.rotT += dt;
      if (this.rotT >= 1) { this.rotT = 0; if (this.hp > -this.stats.regen + 1) this.hp += this.stats.regen; else this.damage(Math.ceil(-this.stats.regen), "hazard", "rot"); }
    }
  }

  // ---------------------------------------------------------------- events
  /** mirrors client/src/endless/events.ts (merchant ship, cursed altar, shiny school, treasure rain) */
  updateEvent(dt: number) {
    const ev = this.event;
    if (!ev) return;
    if (!ev.started) {
      if (this.tideT < ev.at) return;
      ev.started = true; ev.t = 0;
      const B = this.bot, run = this.run;
      if (ev.id === "merchant" && rnd() < B.eventP) {
        this.pauseFishing(6);
        const offers = [rollOffer(run, rnd, CTX), rollOffer(run, rnd, CTX)].map((o) => ({ ...o, price: Math.max(1, Math.round(o.price * MERCHANT_DISCOUNT)) }));
        if (rnd() < 0.5) offers.pop();
        for (const o of offers) if (this.wantOffer(o, true)) this.merchantBuy(o);
      } else if (ev.id === "altar" && rnd() < B.eventP) {
        this.pauseFishing(6);
        const can = ALTAR_DEAL_IDS.filter((d) => d !== "iron_oath" || run.rigs.some((s) => s.tier < MAX_RIG_TIER));
        const deals = can.slice().sort(() => rnd() - 0.5).slice(0, 2);
        const pick = this.pickAltar(deals);
        if (pick) this.altar(pick);
      } else if (ev.id === "shiny") {
        const s = this.spawnSchool({ shiny: true });
        ev.shiny = s;
        if (rnd() > B.eventP) s.until = this.tideT; // the bot ignores it
      }
    }
    ev.t += dt;
    if (ev.id === "treasure_rain" && ev.t <= 8) {
      const drops = Math.floor(ev.t / 0.2) - Math.floor((ev.t - dt) / 0.2);
      for (let i = 0; i < drops; i++) this.dropLoot({ kind: "coin", value: Math.max(1, Math.round(this.run.tide / 3)), at: this.tideT, life: 14 }, rnd() < 0.35);
    }
  }
  pauseFishing(s: number) { if (this.fish.st !== "reel") { this.fish.st = "busy"; this.fish.t = s; } }
  /** mirrors client/src/endless/events.ts buyOffer */
  merchantBuy(o: Offer) {
    const run = this.run;
    if (run.coins < o.price) return;
    if (o.kind === "trinket") {
      const t = TRINKETS_BY_ID[o.id];
      if (t?.max !== undefined && (run.trinkets[o.id] ?? 0) >= t.max) return;
      run.trinkets[o.id] = (run.trinkets[o.id] ?? 0) + 1;
      this.res.trinkets[o.id] = (this.res.trinkets[o.id] ?? 0) + 1;
    } else {
      const twin = run.rigs.find((s) => s.id === o.id && s.tier === o.tier && s.tier < MAX_RIG_TIER);
      const full = run.rigs.length >= rigSlots(run);
      if (twin && (full || this.rules.instantMerge)) { twin.tier++; run.counters.merges++; }
      else if (full) return;
      else run.rigs.push({ id: o.id, tier: o.tier, uid: ++run.uidSeq });
      this.res.rigs[o.id] = (this.res.rigs[o.id] ?? 0) + 1;
    }
    run.coins -= o.price;
    this.refresh();
  }
  pickAltar(deals: AltarDealId[]): AltarDealId | null {
    if (!deals.length) return null;
    const B = this.bot;
    if (B.name === "casual") return deals[Math.floor(rnd() * deals.length)];
    const score = (d: AltarDealId) => {
      if (d === "iron_oath") return 30 - Math.max(0, 4 - this.stats.armor) * 2;
      if (d === "blood_pact") return this.stats.maxHp > 120 ? 28 : 12;
      return this.run.tide < 8 ? 20 : 8; // gambler's tithe: more monsters now
    };
    return deals.slice().sort((a, b) => score(b) - score(a))[0];
  }
  /** mirrors client/src/endless/events.ts takeDeal */
  altar(id: AltarDealId) {
    const run = this.run, stats = this.stats;
    if (id === "blood_pact") {
      const tid = rollTrinketFor(run, rnd, CTX, run.tide + 8, stats.luck, "epic");
      run.trinkets[tid] = (run.trinkets[tid] ?? 0) + 1;
      run.picks.maxHp = (run.picks.maxHp ?? 0) - Math.round(stats.maxHp * 0.2);
    } else if (id === "gamblers_tithe") {
      this.doubleHold = true;
      this.toSpawn += Math.max(4, Math.round(this.spec.monsters * 0.7));
      this.spawnT = Math.min(this.spawnT, 0.5);
      this.maxAliveBonus += 2;
    } else {
      const ups = run.rigs.filter((s) => s.tier < MAX_RIG_TIER);
      const s = ups[Math.floor(rnd() * ups.length)];
      if (s) { s.tier++; run.counters.merges++; }
      run.picks.armor = (run.picks.armor ?? 0) - 4;
    }
    this.refresh();
  }

  // ---------------------------------------------------------------- one tide
  /** mirrors EndlessMode.startTide + update + endTide (returns false when the boat sank) */
  playTide(): boolean {
    const run = this.run;
    this.spec = tideSpec(run);
    const sp = this.spec;
    this.refresh(); this.hp = this.stats.maxHp; // refreshStats(true)
    this.tideT = 0; this.mons = []; this.loot = []; this.hold = []; this.chests = []; this.patches = []; this.strikes = [];
    this.bountyDone = false; this.doubleHold = false; this.maxAliveBonus = 0; this.bossesLeft = 0; this.bossStart = -1;
    this.makePatches();
    this.schools = [];
    for (let i = 0; i < sp.schools; i++) this.spawnSchool();
    if (sp.modifier === "golden_school") this.spawnSchool({ golden: true });
    if (sp.modifier === "bounty") this.spawnSchool({ bounty: true });
    this.schoolT = sp.schoolRespawn;
    const plan = sp.boss ? null : rollTideEvent(run.tide, sp.duration, runRng(run, 7700));
    this.event = plan ? { id: plan.id, at: plan.at, started: false, t: 0 } : null;
    this.toSpawn = sp.monsters;
    this.spawnT = sp.modifier === "calm" ? 20 : 3;
    this.bossSpawnIn = sp.boss ? 3.5 : -1;
    this.rigRt.clear();
    this.fish.st = "idle"; this.fish.t = 0.5;
    const earned0 = run.earned;
    const cap = sp.duration + 240;
    while (true) {
      const dt = DT;
      this.tideT += dt; this.time += dt;
      // schools drift / despawn / respawn
      for (const s of this.schools) {
        s.x += s.vx * dt; s.z += s.vz * dt;
        const d = Math.hypot(s.x, s.z);
        if (d > ARENA_R * 0.85) { s.vx -= (s.x / d) * dt * 2; s.vz -= (s.z / d) * dt * 2; }
        if (this.tideT > s.until) s.count = 0;
      }
      this.schools = this.schools.filter((s) => s.count > 0);
      this.schoolT -= dt;
      if (this.schoolT <= 0) { this.schoolT = sp.schoolRespawn; if (this.schools.filter((s) => !s.shiny).length < sp.schools) this.spawnSchool(); }
      if (this.specials.vortex) {
        this.vortexT += dt;
        if (this.vortexT >= this.specials.vortex) { this.vortexT = 0; for (const s of this.schools) { s.x += (this.boat.x - s.x) * 0.5; s.z += (this.boat.z - s.z) * 0.5; } }
      }
      // monsters (EndlessMode.update spawn cadence)
      if (this.toSpawn > 0) {
        this.spawnT -= dt;
        if (this.spawnT <= 0 && this.aliveMine() < sp.maxAlive + this.maxAliveBonus) {
          this.spawnMonster();
          this.toSpawn--;
          this.spawnT = (sp.duration * 0.8) / Math.max(1, sp.monsters) * (0.6 + rnd() * 0.8);
        }
      }
      if (this.bossSpawnIn >= 0) { this.bossSpawnIn -= dt; if (this.bossSpawnIn < 0) this.spawnBosses(); }
      this.activeWinds = this.mons.filter((m) => !m.dead && m.wind >= 0).length;
      for (const m of this.mons) if (!m.dead) this.monsterTick(m, dt);
      this.mons = this.mons.filter((m) => !m.dead);
      this.updateFishing(dt);
      this.updateHarpoon(dt);
      this.updateRigs(dt);
      this.updateHazards(dt);
      this.updateEvent(dt);
      this.updateLoot();
      this.mons = this.mons.filter((m) => !m.dead);
      if (this.dead) break;
      const bossesDone = this.bossesLeft <= 0 && this.bossSpawnIn < 0;
      if (this.tideT >= sp.duration && (!sp.boss || bossesDone)) break;
      if (this.tideT >= cap) { this.dead = true; this.lastDamage = "boss"; break; }
    }
    if (this.dead) { if (DEBUG) console.error(`DIED T${run.tide} at ${this.tideT.toFixed(0)}s dmg by ${JSON.stringify(this.dmgBy)} rigs ${run.rigs.map((r) => r.id + r.tier).join(",")} maxHp ${this.stats.maxHp} armor ${this.stats.armor}`); return false; }
    // cash-in (EndlessMode.endTide + events.onTideEnd)
    this.updateLoot(true);
    if (this.doubleHold) this.hold.push(...this.hold.map((c) => ({ ...c })));
    for (const c of this.chests) {
      const rw = rollChestReward(run, c, this.stats.luck, rnd, CTX);
      if (rw.kind === "coins") this.addCoins(rw.n); else applyChestReward(run, rw);
    }
    this.chests = [];
    this.refresh();
    let total = 0;
    for (const c of this.hold) total += this.fishCoins(c);
    this.addCoins(total);
    this.hold = [];
    this.res.coinsByTide[run.tide] = run.earned - earned0;
    if (DEBUG) { console.error(`  dmg by ${JSON.stringify(this.dmgBy)}`); this.dmgBy = {}; }
    if (DEBUG) console.error(`T${run.tide} ${this.tideT.toFixed(0)}s hp ${Math.round(this.hp)}/${this.stats.maxHp} dmgTaken ${run.counters.damageTaken} earned ${run.earned - earned0} (hold ${total}) coins ${run.coins} fish ${run.counters.fish} manual ${run.counters.manualFish} kills ${run.counters.kills} lvl ${this.level} rigs ${run.rigs.map((r) => r.id + r.tier + (r.evolved ? "*" : "")).join(",")} tr ${Object.keys(run.trinkets).length} monHp ${this.spec.monsterHp} left ${this.toSpawn} luck ${this.stats.luck} haul ${this.stats.haul} eng ${this.stats.engineering} harp ${this.stats.harpoon} armor ${this.stats.armor} gb ${this.specials.goldBonus ?? 0} picks ${JSON.stringify(run.picks)} tr ${JSON.stringify(run.trinkets)}`);
    if (run.tide === 10) this.res.levelAt10 = this.level;
    if (run.tide === 20) this.res.levelAt20 = this.level;
    return true;
  }

  // ---------------------------------------------------------------- shop bot
  /** rough value of a stat amount for this build (bot heuristic, not a game rule) */
  statValue(stat: StatId, amount: number): number {
    const cc = this.classCount, nRigs = this.run.rigs.length, tide = this.run.tide;
    const dmgRigs = cc.harpoon + cc.explosive, fireRigs = cc.harpoon + this.run.rigs.filter((r) => r.id === "drone").length;
    const noFish = !!this.rules.noFishing;
    const w: Record<StatId, number> = {
      maxHp: 0.8, regen: amount < 0 || this.stats.regen < 0 ? 120 : 10, /* negative regen drains HP all tide long */ armor: 4 * 15 / (15 + Math.max(0, this.stats.armor)), speed: 0.4 * Math.max(1, -this.stats.speed / 15), // slow boats can't dodge
      reel: noFish ? 0 : 0.25, zone: noFish ? 0 : 0.5, line: noFish ? 0 : 0.15, bite: noFish ? 0 : 0.25, luck: 0.45,
      harpoon: 0.35 + 0.3 * dmgRigs, fireRate: 0.35 + 0.35 * fireRigs, range: 0.25 + 0.1 * nRigs, engineering: 0.2 + 0.25 * nRigs,
      magnet: 0.8, haul: tide <= 16 ? 0.8 : 0.4, interest: tide < 12 ? 0.6 : 0.1,
    };
    return w[stat] * amount;
  }
  specialValue(k: TrinketSpecial, v: number): number {
    const nets = this.classCount.net;
    const map: Partial<Record<TrinketSpecial, number>> = {
      goldBonus: 60, crit: 120, killHeal: 4, extraSchools: 18, monsterSlow: 100, netPlus: 6 * nets, spillGuard: 12, interestCap: 0.3,
      upgradeChance: 120, bossDmg: 30, vortex: 0.8, secondWind: 6, dash: 3, lootMagnet: 3, monsterMore: -40,
      noRegen: -(Math.max(0, this.stats.regen) * 10 + 8),
    };
    return (map[k] ?? 0) * v;
  }
  /** fish/s or dps of a rig slot → value points */
  rigValue(id: string, tier: number, evolved?: string): number {
    const d = RIGS_BY_ID[id];
    if (!d) return 0;
    const evoMult = evolved ? 2 : 1;
    const p = d.power[tier - 1], cd = d.cooldown[tier - 1];
    const fishK = this.rules.noFishing ? 0 : 25;
    let v = 0;
    switch (id) {
      case "harpoongun": v = (p / cd) * 1.6 * 1.3; break;
      case "chain": v = (p / cd) * 1.6 * (1 + (tier >= 3 ? 3 : 2) * 0.5); break;
      case "charge": v = (p / cd) * 1.6 * 1.8 + (fishK * (1 + tier)) / cd * 0.2; break;
      case "drone": v = (p / cd) * 1.6 * 0.8; break;
      case "bobber": v = (p / cd) * fishK; break;
      case "castnet": v = (p / cd) * fishK * 0.9; break;
      case "trawl": v = (p / cd) * fishK; break;
      case "deep": v = (p / cd) * fishK * 5; break;
      case "trolling": v = (2.5 / p) * fishK * 0.6; break;
      case "chum": v = p * 4; break;
      case "inkjet": v = (p / cd) * 60; break;
    }
    return v * evoMult * (this.rules.rigPower ?? 1);
  }
  /** value of an offer for this bot (incl. merges, sets, combos, evolutions) */
  offerValue(o: Offer): number {
    const run = this.run;
    let v = 0;
    if (o.kind === "trinket") {
      const t = TRINKETS_BY_ID[o.id];
      if (!t || (t.max !== undefined && (run.trinkets[o.id] ?? 0) >= t.max)) return -1;
      for (const [k, a] of Object.entries(t.stats)) v += this.statValue(k as StatId, a as number);
      for (const [k, a] of Object.entries(t.special ?? {})) v += this.specialValue(k as TrinketSpecial, a as number);
    } else {
      const twin = run.rigs.find((s) => s.id === o.id && s.tier === o.tier && s.tier < MAX_RIG_TIER && !s.evolved);
      const full = run.rigs.length >= rigSlots(run);
      if (twin) v = this.rigValue(o.id, o.tier + 1) - this.rigValue(o.id, o.tier) + (full ? 0 : 0) + 10;
      else if (full && rigSlots(run) === 1) { // one-slot captain: buying swaps the rig (rules.ts buy)
        const old = run.rigs[0];
        const lone = (id: string) => (RIGS_BY_ID[id]?.cls === "support" && id !== "drone" ? 0.2 : 1); // a lone chum / ink rig does nothing
        v = this.rigValue(o.id, o.tier) * lone(o.id) - this.rigValue(old.id, old.tier, old.evolved) * lone(old.id) - 15;
        if (v <= 0) return -1;
      } else if (full) return -1;
      else {
        v = this.rigValue(o.id, o.tier) + 5;
        const cls = RIGS_BY_ID[o.id].cls, n = this.classCount[cls] + 1;
        if ((cls === "harpoon" && (n === 2 || n === 4)) || (cls === "rod" && (n === 2 || n === 4 || n === 6)) || (cls === "net" && (n === 2 || n === 3)) || ((cls === "explosive" || cls === "support") && n === 2)) v += 12;
        // a build without damage needs some by tide 3
        const dmgRigs = this.classCount.harpoon + this.classCount.explosive + run.rigs.filter((r) => r.id === "drone").length;
        if (dmgRigs === 0 && run.tide >= 3 && (cls === "harpoon" || cls === "explosive" || o.id === "drone")) v *= 1.8;
      }
    }
    if (this.bot.shop === "smart") for (const h of offerHints(run, o)) v += h.kind === "combo" ? 15 : h.ready ? 45 : 15;
    return v;
  }
  /** no harpoon / explosive / drone rig yet (tide 2+) */
  needsWeapon() { return this.run.tide >= 2 && !this.run.rigs.some((r) => { const c = RIGS_BY_ID[r.id]?.cls; return c === "harpoon" || c === "explosive" || r.id === "drone"; }); }
  isWeapon(o: Offer) { if (o.kind !== "rig") return false; const c = RIGS_BY_ID[o.id]?.cls; return c === "harpoon" || c === "explosive" || o.id === "drone"; }
  wantOffer(o: Offer, merchant = false): boolean {
    if (this.run.coins < o.price) return false;
    if (o.price === 0) return true;
    const v = this.offerValue(o);
    if (v < 0) return false;
    if (this.bot.shop === "greedy") return !merchant || rnd() < 0.5;
    const ratio = (v * (1 + (rnd() - 0.5) * this.bot.noise)) / Math.max(1, o.price / this.spec.priceMult);
    return ratio >= this.bot.threshold;
  }
  /** level-ups: rollLevelOffers + takeLevel (casual picks at random, others by stat value) */
  doLevels() {
    while (this.run.pendingLevels > 0) {
      const offers = rollLevelOffers(this.run);
      if (!offers.length) { this.run.pendingLevels = 0; break; }
      let pick: LevelOffer;
      if (this.bot.name === "casual") pick = offers[Math.floor(rnd() * offers.length)];
      else pick = offers.slice().sort((a, b) => this.statValue(b.stat, b.amount) * (1 + (rnd() - 0.5) * this.bot.noise) - this.statValue(a.stat, a.amount) * (1 + (rnd() - 0.5) * this.bot.noise))[0];
      takeLevel(this.run, pick);
      this.refresh();
    }
  }
  /** the Tackle Shop: mirrors EndlessMode.openBetween / injectFreeItem / nextTide (interest) and ui.ts reroll pricing */
  doShop() {
    const run = this.run, B = this.bot;
    rollShop(run, CTX);
    run.shop!.locked = run.shop!.locked.map(() => false); // last shop's locks are in; nothing stays locked by default
    if (this.freeItem && run.shop) { // injectFreeItem
      this.freeItem = false;
      const i = run.shop.offers.findIndex((o) => o && !run.shop!.locked[run.shop!.offers.indexOf(o)]);
      const o = run.shop.offers[Math.max(0, i)];
      if (o) o.price = 0;
    }
    this.doLevels();
    this.spec = tideSpec(run);
    const coins0 = run.coins;
    let items = 0;
    const evolveMerge = () => {
      for (const [a, b] of mergeable(run)) if (rnd() < B.mergeP) merge(run, a, b);
      for (const e of evolvable(run)) if (rnd() < B.evolveP && evolve(run, e.slot.uid)) this.res.evolutions.push(e.evo.id);
      this.refresh();
    };
    const buyOne = (i: number) => {
      const o = run.shop!.offers[i]!;
      const r = buy(run, i);
      if (!r.ok) return false;
      items++;
      if (o.kind === "rig") this.res.rigs[o.id] = (this.res.rigs[o.id] ?? 0) + 1; else this.res.trinkets[o.id] = (this.res.trinkets[o.id] ?? 0) + 1;
      this.refresh();
      evolveMerge();
      return true;
    };
    evolveMerge();
    // skilled: keep a reserve for interest when it pays
    const reserve = () => {
      if (B.shop !== "smart" || this.stats.interest < 8 || run.tide > 15) return 0;
      return Math.min(run.coins * 0.5, (this.spec.interestCap * 100) / Math.max(1, this.stats.interest));
    };
    let rerolls = 0;
    for (let guard = 0; guard < 40; guard++) {
      const offers = run.shop!.offers;
      // free items first
      const free = offers.findIndex((o) => o && o.price === 0);
      if (free >= 0) { buyOne(free); continue; }
      let bestI = -1, bestR = -Infinity;
      offers.forEach((o, i) => {
        if (!o || run.coins < o.price) return;
        const v = this.offerValue(o);
        if (v < 0) return;
        // greedy (casual) buys the priciest offer, but a player with no weapon rig at all grabs one once monsters bite
        const r = B.shop === "greedy" ? o.price * (this.needsWeapon() && this.isWeapon(o) ? 4 : 1) : (v * (1 + (rnd() - 0.5) * B.noise)) / Math.max(1, o.price / this.spec.priceMult);
        if (r > bestR) { bestR = r; bestI = i; }
      });
      // a player with coins to spare is less picky: the bar drops as coins pile up (price ≤ 1/3 of the purse → anything useful)
      const bar = bestI >= 0 ? B.threshold * Math.min(1, (3 * offers[bestI]!.price) / Math.max(1, run.coins)) : 0;
      if (bestI >= 0 && (B.shop === "greedy" || bestR >= bar) && run.coins - offers[bestI]!.price >= (B.shop === "smart" && bestR < 1.2 ? reserve() : 0)) { if (buyOne(bestI)) continue; }
      // skilled: sell the weakest rig for a clearly better one when slots are full
      if (B.shop === "smart" && run.rigs.length >= rigSlots(run) && run.rigs.length > 1) {
        const weakest = run.rigs.filter((s) => !s.evolved).sort((a, b) => this.rigValue(a.id, a.tier) - this.rigValue(b.id, b.tier))[0];
        const better = offers.findIndex((o) => o && o.kind === "rig" && !run.rigs.some((s) => s.id === o.id && s.tier === o.tier) && weakest && this.rigValue(o.id, o.tier) > this.rigValue(weakest.id, weakest.tier) + 15 && run.coins + sellValue(weakest, run.tide) >= o.price);
        if (weakest && better >= 0) { sell(run, weakest.uid); this.refresh(); if (buyOne(better)) continue; }
      }
      // reroll
      const free2 = harbourFreeRerolls(run), n = run.shop!.rerolls;
      const rc = n < free2 ? 0 : rerollCost(run.tide, n - free2);
      const paid = Math.max(0, rerolls - free2);
      const maxRerolls = B.rerolls + (B.shop !== "greedy" && run.coins > 20 * Math.max(1, rc) ? 2 : 0);
      if ((rc === 0 && B.shop !== "greedy") || (maxRerolls > paid && run.coins >= rc * 3 && run.coins - rc > reserve() && (bestI < 0 || bestR < B.threshold * 1.5))) {
        if (B.shop === "smart") { // lock a great offer we can't afford yet
          offers.forEach((o, i) => { if (o && run.coins < o.price && this.offerValue(o) / Math.max(1, o.price / this.spec.priceMult) > 0.9) run.shop!.locked[i] = true; });
        }
        run.coins -= rc; rerolls++; run.counters.rerolls++;
        const rr = n + 1;
        rollShop(run, CTX, rr);
        run.shop!.rerolls = rr;
        continue;
      }
      break;
    }
    if (B.shop === "smart") run.shop!.offers.forEach((o, i) => { if (o && run.coins < o.price && this.offerValue(o) / Math.max(1, o.price / this.spec.priceMult) > 0.9) run.shop!.locked[i] = true; });
    this.res.spendByShop[run.tide - 1] = Math.max(0, coins0 - run.coins);
    this.res.itemsByShop[run.tide - 1] = items;
    // Next Tide: interest (EndlessMode.nextTide: coins only, not "earned")
    run.coins += interestFor(run);
  }

  // ---------------------------------------------------------------- whole run
  play(): RunResult {
    const run = this.run, res = this.res;
    let elapsed = 0;
    while (run.tide <= MAX_TIDE) {
      const ok = this.playTide();
      elapsed += this.tideT;
      if (!ok) { res.deathTide = run.tide; res.cause = this.lastDamage; res.hazard = this.hazardKind; res.reached = run.tide; break; }
      if (run.tide === WIN_TIDE) { res.won = true; res.timeTo20 = elapsed; }
      run.tide++;
      if (run.tide > WIN_TIDE) run.endless = true;
      if (run.tide > MAX_TIDE) { res.reached = run.tide - 1; break; }
      this.doShop();
    }
    res.pearls = pearlsForRun(run, res.reached, res.won && res.deathTide === null);
    res.combos = activeCombos(run).map((c) => c.id);
    res.fish = run.counters.fish; res.kills = run.counters.kills;
    res.manualShare = run.counters.fish ? run.counters.manualFish / run.counters.fish : 0;
    return res;
  }
}

// ================================================================================================ aggregation
interface Config { captain: string; danger: number; bot: Bot["name"]; harbour: "none" | "half" | "max" }
const keyOf = (c: Config) => `${c.captain}|${c.danger}|${c.bot}|${c.harbour}`;
const BANDS: [number, number][] = [[1, 5], [6, 10], [11, 15], [16, 20]];
function q(xs: number[], p: number) { if (!xs.length) return NaN; const s = xs.slice().sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); }
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const r1 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

interface Summary {
  config: Config; runs: number;
  tide: { p25: number; median: number; p75: number; mean: number };
  winRate: number; deathHist: Record<number, number>;
  coinsPerTide: Record<string, number | null>; spendPerShop: Record<string, number | null>; itemsPerShop: Record<string, number | null>;
  levelAt10: number | null; levelAt20: number | null; minutesTo20: number | null;
  cause: { monsters: number; boss: number; hazard: number; hazardKinds: Record<string, number> };
  boss10: { killRate: number; medianSec: number | null }; boss20: { killRate: number; medianSec: number | null };
  pearls: { mean: number | null; median: number | null };
  topRigs: [string, number][]; topTrinkets: [string, number][]; evolutions: [string, number][]; combos: [string, number][];
  manualShare: number | null; fishPerRun: number | null; killsPerRun: number | null;
}
function summarise(config: Config, rs: RunResult[]): Summary {
  const n = rs.length;
  const reached = rs.map((r) => r.reached);
  const deathHist: Record<number, number> = {};
  for (const r of rs) if (r.deathTide !== null) deathHist[r.deathTide] = (deathHist[r.deathTide] ?? 0) + 1;
  const band = (get: (r: RunResult) => number[], [a, b]: [number, number]) => {
    const xs: number[] = [];
    for (const r of rs) { const arr = get(r); for (let t = a; t <= b; t++) if (arr[t] !== undefined) xs.push(arr[t]); }
    return r1(mean(xs));
  };
  const bandRec = (get: (r: RunResult) => number[]) => Object.fromEntries(BANDS.map((bd) => [`${bd[0]}-${bd[1]}`, band(get, bd)]));
  const deaths = rs.filter((r) => r.cause);
  const share = (c: string) => (deaths.length ? deaths.filter((r) => r.cause === c).length / deaths.length : 0);
  const count = (get: (r: RunResult) => Record<string, number>) => {
    const m: Record<string, number> = {};
    for (const r of rs) for (const [k, v] of Object.entries(get(r))) m[k] = (m[k] ?? 0) + v;
    return Object.entries(m).map(([k, v]) => [k, Math.round((v / n) * 100) / 100] as [string, number]).sort((a, b) => b[1] - a[1]);
  };
  const runsWith = (get: (r: RunResult) => string[]) => {
    const m: Record<string, number> = {};
    for (const r of rs) for (const k of new Set(get(r))) m[k] = (m[k] ?? 0) + 1;
    return Object.entries(m).map(([k, v]) => [k, Math.round((v / n) * 1000) / 10] as [string, number]).sort((a, b) => b[1] - a[1]);
  };
  const reachedBoss = (t: number) => rs.filter((r) => r.reached >= t);
  const bossStat = (t: number, get: (r: RunResult) => number | null) => {
    const at = reachedBoss(t), killed = at.map(get).filter((x): x is number => x !== null);
    return { killRate: at.length ? Math.round((killed.length / at.length) * 1000) / 10 : 0, medianSec: r1(q(killed, 0.5)) };
  };
  const lv = (get: (r: RunResult) => number | null) => r1(mean(rs.map(get).filter((x): x is number => x !== null)));
  const t20 = rs.map((r) => r.timeTo20).filter((x): x is number => x !== null);
  return {
    config, runs: n,
    tide: { p25: q(reached, 0.25), median: q(reached, 0.5), p75: q(reached, 0.75), mean: r1(mean(reached))! },
    winRate: Math.round((rs.filter((r) => r.won).length / n) * 1000) / 10,
    deathHist,
    coinsPerTide: bandRec((r) => r.coinsByTide), spendPerShop: bandRec((r) => r.spendByShop), itemsPerShop: bandRec((r) => r.itemsByShop),
    levelAt10: lv((r) => r.levelAt10), levelAt20: lv((r) => r.levelAt20),
    minutesTo20: t20.length ? r1(q(t20, 0.5) / 60) : null,
    cause: { monsters: Math.round(share("monsters") * 100), boss: Math.round(share("boss") * 100), hazard: Math.round(share("hazard") * 100), hazardKinds: Object.fromEntries(["coral", "lightning", "rot"].map((k) => [k, Math.round((deaths.length ? deaths.filter((r) => r.cause === "hazard" && r.hazard === k).length / deaths.length : 0) * 100)])) },
    boss10: bossStat(10, (r) => r.boss10), boss20: bossStat(20, (r) => r.boss20),
    pearls: { mean: r1(mean(rs.map((r) => r.pearls))), median: r1(q(rs.map((r) => r.pearls), 0.5)) },
    topRigs: count((r) => r.rigs).slice(0, 6), topTrinkets: count((r) => r.trinkets).slice(0, 8),
    evolutions: runsWith((r) => r.evolutions), combos: runsWith((r) => r.combos).slice(0, 6),
    manualShare: r1(mean(rs.map((r) => r.manualShare)) * 100), fishPerRun: r1(mean(rs.map((r) => r.fish))), killsPerRun: r1(mean(rs.map((r) => r.kills))),
  };
}

const cache = new Map<string, Summary>();
function runConfig(c: Config): Summary {
  const k = keyOf(c);
  const hit = cache.get(k);
  if (hit) return hit;
  const rs: RunResult[] = [];
  const hb = harbourLevels(c.harbour);
  for (let i = 0; i < RUNS; i++) {
    // seed per run: same seeds across configs (common random numbers make comparisons less noisy)
    const seed = (SEED * 0x9e3779b1 + i * 0x85ebca6b) >>> 0;
    rs.push(new Sim(BOTS[c.bot], c.captain, c.danger, hb, seed).play());
  }
  const s = summarise(c, rs);
  cache.set(k, s);
  return s;
}

// ================================================================================================ main
// Configs are independent and every run has its own seed, so they are spread over child processes (same results as
// --workers=1). A worker gets configs over IPC and sends back summaries.
if (process.argv.includes("--worker")) {
  process.on("message", (c: Config) => process.send!(runConfig(c)));
} else {
  await mainReport();
}
async function runAll(configs: Config[]): Promise<void> {
  const todo = configs.filter((c, i) => configs.findIndex((x) => keyOf(x) === keyOf(c)) === i && !cache.has(keyOf(c)));
  const nW = Math.max(1, Math.min(Number(arg("workers") ?? Math.max(1, cpus().length - 1)), todo.length));
  if (nW <= 1) { for (const c of todo) runConfig(c); return; }
  // biggest first (skilled runs go deepest)
  const queue = todo.slice().sort((a, b) => (b.bot === "skilled" ? 1 : 0) - (a.bot === "skilled" ? 1 : 0));
  const self = fileURLToPath(import.meta.url);
  const passArgs = args.filter((a) => !a.startsWith("--write") && !a.startsWith("--json"));
  await Promise.all(Array.from({ length: nW }, () => new Promise<void>((resolve, reject) => {
    const w = fork(self, [...passArgs, "--worker"], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
    const next = () => { const c = queue.shift(); if (c) w.send(c); else { w.kill(); resolve(); } };
    w.on("message", (s: Summary) => { cache.set(keyOf(s.config), s); next(); });
    w.on("error", reject);
    w.on("exit", (code) => { if (code && queue.length) reject(new Error(`worker exited with ${code}`)); });
    next();
  })));
}

async function mainReport() {
const t0 = Date.now();
const captains = capArg === undefined ? ["marlow"] : capArg === "all" ? CAPTAINS.map((c) => c.id) : capArg.split(",");
for (const c of captains) if (!CAPTAINS_BY_ID[c]) { console.error(`unknown captain ${c}`); process.exit(1); }
const dangers = dangerArg === undefined ? [0] : dangerArg === "all" ? [0, 1, 2, 3, 4, 5] : dangerArg.split(",").map(Number);
const bots = (botArg === "all" ? ["casual", "average", "skilled"] : botArg.split(",")) as Bot["name"][];
for (const b of bots) if (!BOTS[b]) { console.error(`unknown bot ${b}`); process.exit(1); }

const mainC: Config[] = [];
for (const captain of captains) for (const danger of dangers) for (const bot of bots) mainC.push({ captain, danger, bot, harbour: HARBOUR_MODE });
const capC: Config[] = DEFAULT_REPORT ? CAPTAINS.map((c) => ({ captain: c.id, danger: 0, bot: "skilled" as const, harbour: HARBOUR_MODE })) : [];
const dangerC: Config[] = DEFAULT_REPORT ? [0, 1, 2, 3, 4, 5].map((d) => ({ captain: "marlow", danger: d, bot: "skilled" as const, harbour: HARBOUR_MODE })) : [];
const harbourC: Config[] = DEFAULT_REPORT ? (["none", "half", "max"] as const).map((h) => ({ captain: "marlow", danger: 0, bot: "average" as const, harbour: h })) : [];
await runAll([...mainC, ...capC, ...dangerC, ...harbourC]);
const main = mainC.map(runConfig);
let captainTable = capC.map(runConfig), dangerLadder = dangerC.map(runConfig);
const harbourTable = harbourC.map(runConfig);
if (!DEFAULT_REPORT) {
  if (captains.length > 1) captainTable = main.filter((s) => s.config.bot === bots[bots.length - 1] && s.config.danger === dangers[0]);
  if (dangers.length > 1) dangerLadder = main.filter((s) => s.config.bot === bots[bots.length - 1] && s.config.captain === captains[0]);
}
const secs = (Date.now() - t0) / 1000;

const name = (id: string) => RIGS_BY_ID[id]?.name ?? TRINKETS_BY_ID[id]?.name ?? id;
const cfgName = (c: Config) => `${CAPTAINS_BY_ID[c.captain].name} · Danger ${c.danger} · ${c.bot}${c.harbour !== "none" ? ` · Harbour ${c.harbour}` : ""}`;
const fmt = (x: number | null | undefined, suf = "") => (x === null || x === undefined || Number.isNaN(x) ? "–" : `${x}${suf}`);

function configSection(s: Summary): string {
  const L: string[] = [];
  L.push(`### ${cfgName(s.config)}`, "");
  L.push(`- Tide reached: median **${fmt(s.tide.median)}** (p25 ${fmt(s.tide.p25)}, p75 ${fmt(s.tide.p75)}, mean ${fmt(s.tide.mean)}) · **win rate ${s.winRate}%** (cleared tide 20)`);
  const hist = Object.entries(s.deathHist).sort((a, b) => Number(a[0]) - Number(b[0])).map(([t, n]) => `${t}:${Math.round((n / s.runs) * 1000) / 10}%`).join(" ");
  L.push(`- Death tide histogram (share of runs): ${hist || "no deaths"}`);
  L.push(`- Cause of death: monsters ${s.cause.monsters}% · boss ${s.cause.boss}% · hazard ${s.cause.hazard}% (fire coral ${s.cause.hazardKinds.coral}%, lightning ${s.cause.hazardKinds.lightning}%, rot ${s.cause.hazardKinds.rot}%)`);
  L.push(`- Levels: ${fmt(s.levelAt10)} after tide 10, ${fmt(s.levelAt20)} after tide 20 · time to clear tide 20: ${fmt(s.minutesTo20, " min")} (tide time only)`);
  L.push(`- Bosses: tide 10 killed by ${s.boss10.killRate}% of the runs that got there (median ${fmt(s.boss10.medianSec, " s")}), tide 20 ${s.boss20.killRate}% (median ${fmt(s.boss20.medianSec, " s")})`);
  L.push(`- Pearls per run: mean ${fmt(s.pearls.mean)}, median ${fmt(s.pearls.median)} · fish per run ${fmt(s.fishPerRun)} (${fmt(s.manualShare, "%")} by hand) · kills per run ${fmt(s.killsPerRun)}`);
  L.push("", "| Tides | Coins earned / tide | Spent / shop | Items / shop |", "|---|---|---|---|");
  for (const [a, b] of BANDS) { const k = `${a}-${b}`; L.push(`| ${k} | ${fmt(s.coinsPerTide[k])} | ${fmt(s.spendPerShop[k])} | ${fmt(s.itemsPerShop[k])} |`); }
  L.push("");
  L.push(`- Most-bought rigs (per run): ${s.topRigs.map(([k, v]) => `${name(k)} ${v}`).join(", ") || "–"}`);
  L.push(`- Most-bought trinkets (per run): ${s.topTrinkets.map(([k, v]) => `${name(k)} ${v}`).join(", ") || "–"}`);
  L.push(`- Evolutions (share of runs): ${s.evolutions.map(([k, v]) => `${k} ${v}%`).join(", ") || "none"}`);
  L.push(`- Combos active at the end (share of runs): ${s.combos.map(([k, v]) => `${k} ${v}%`).join(", ") || "none"}`, "");
  return L.join("\n");
}
function table(title: string, rows: Summary[], label: (s: Summary) => string): string {
  if (!rows.length) return "";
  const L = [`## ${title}`, "", "| | Median tide | p25–p75 | Win rate | Death: monsters / boss / hazard | Boss 10 kill | Boss 20 kill | Pearls |", "|---|---|---|---|---|---|---|---|"];
  for (const s of rows) L.push(`| ${label(s)} | ${fmt(s.tide.median)} | ${fmt(s.tide.p25)}–${fmt(s.tide.p75)} | ${s.winRate}% | ${s.cause.monsters} / ${s.cause.boss} / ${s.cause.hazard}% | ${s.boss10.killRate}% (${fmt(s.boss10.medianSec, " s")}) | ${s.boss20.killRate}% (${fmt(s.boss20.medianSec, " s")}) | ${fmt(s.pearls.mean)} |`);
  return L.join("\n") + "\n";
}

const INTRO = `# Endless Tide balance report

Generated by \`npm run balance:endless -w client -- --write\` (client/scripts/endlessBalance.ts), ${RUNS} runs per config, seed ${SEED}, max tide ${MAX_TIDE}, step ${DT} s, unlocks: ${UNLOCKS}, Harbour: ${HARBOUR_MODE} (unless stated), no companion. ${secs.toFixed(1)} s.

The script calls the real shared rules (\`shared/src/endless/*\`: stats, tide curve, shop, merges, level-ups, interest, Harbour,
evolutions, combos, monster roster, chests, events, pearls) and the real reel physics (ReelSim). Client-only formulas (fish tier
roll, fish coins, rig behaviours, kill rewards, spill, hazards, monster and boss AI timings) are mirrored in one function each,
marked \`// mirrors <file> <method>\`: when you tune those in \`client/src/endless\`, change the mirror too. Dodging, loot pickup and
the player's harpoon aim are probability models driven by the bot constants at the top of the script (casual / average / skilled).
Treat the numbers as relative (A vs B after a change), not as exact player outcomes.
`;

let md = INTRO + "\n";
md += table("Summary", main, (s) => cfgName(s.config));
if (captainTable.length) md += "\n" + table("Captains (Danger 0, skilled bot)", captainTable, (s) => CAPTAINS_BY_ID[s.config.captain].name);
if (dangerLadder.length) md += "\n" + table("Danger ladder (Marlow, skilled bot)", dangerLadder, (s) => `Danger ${s.config.danger}`);
if (harbourTable.length) md += "\n" + table("Harbour (Marlow, Danger 0, average bot)", harbourTable, (s) => `Harbour ${s.config.harbour}`);
md += "\n## Per config\n\n" + [...main, ...captainTable.filter((s) => !main.includes(s)), ...dangerLadder.filter((s) => !main.includes(s) && !captainTable.includes(s))].map(configSection).join("\n");

if (JSON_OUT) console.log(JSON.stringify({ runs: RUNS, seed: SEED, maxTide: MAX_TIDE, dt: DT, seconds: secs, main, captainTable, dangerLadder, harbourTable }, null, 1));
else console.log(md);
if (WRITE) {
  const path = fileURLToPath(new URL("../../docs/ENDLESS_BALANCE.md", import.meta.url));
  // keep the hand-written "## Tuning changelog" section (it lives at the end of the file)
  let keep = "";
  try { const old = readFileSync(path, "utf8"); const at = old.indexOf("\n## Tuning changelog"); if (at >= 0) keep = old.slice(at); } catch { /* first write */ }
  writeFileSync(path, md + keep);
  if (!JSON_OUT) console.log(`\nwrote ${path}`);
  else console.error(`wrote ${path}`);
}
}
