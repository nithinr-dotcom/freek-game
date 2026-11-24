/**
 * Endless Tide rules (pure, no DOM): the run state, stat totals, tide difficulty curve, the seeded shop and level-up
 * rolls, merging, interest, the Daily Tide seed and its rival scores. The client (client/src/endless) runs the tides.
 */
import {
  BASE_STATS, STAT_IDS, RIGS, RIGS_BY_ID, TRINKETS, TRINKETS_BY_ID, TRINKET_PRICE, RIG_TIER_PRICE, MAX_RIG_TIER, LEVEL_STEP,
  CAPTAINS_BY_ID, COMPANIONS_BY_ID, BIOMES, TIDES_PER_BIOME, BOSS_TIDES, MODIFIER_IDS, RIG_CLASS_INFO,
  type Stats, type StatId, type Rarity, type RigClass, type TrinketSpecial, type ModifierId, type BiomeDef,
} from "./data.js";
import { comboBonuses } from "./evolutions.js";
import { runHarbour, harbourStats, harbourSpecials, harbourStartCoins, harbourSpareChance, harbourShopSlots, type HarbourLevels } from "./harbour.js";

export interface RigSlot { id: string; tier: number; uid: number; /** evolution id (★ rig, see ./evolutions.ts) */ evolved?: string }
export type Offer =
  | { kind: "rig"; id: string; tier: number; price: number }
  | { kind: "trinket"; id: string; price: number };
export interface LevelOffer { stat: StatId; rarity: Rarity; amount: number }

export interface RunCounters {
  fish: number; manualFish: number; rigFish: number; netFish: number; kills: number; bossKills: number;
  legendaries: number; epics: number; merges: number; rerolls: number; damageTaken: number; spilled: number;
  bestFishCoins: number; bestFishId: string; bestFishKg: number; bestFishTier: string;
}
export interface RunState {
  v: 1;
  captain: string;
  danger: number;
  /** "YYYY-MM-DD" for a Daily Tide run */
  daily: string | null;
  seed: number;
  companion: string;
  tide: number;
  coins: number;
  /** all coins earned this run (score) */
  earned: number;
  rigs: RigSlot[];
  trinkets: Record<string, number>;
  /** stat points from level-ups */
  picks: Partial<Stats>;
  /** level-ups not picked yet */
  pendingLevels: number;
  levelsTaken: number;
  counters: RunCounters;
  uidSeq: number;
  /** offers of the shop being shown (locked ones carry over) */
  shop: { offers: (Offer | null)[]; locked: boolean[]; rerolls: number } | null;
  /** past tide 20 */
  endless: boolean;
  startedAt: number;
  /** Harbour upgrade levels this run started with (ignored on the Daily Tide); see harbour.ts */
  harbour?: HarbourLevels;
}

export function newCounters(): RunCounters {
  return { fish: 0, manualFish: 0, rigFish: 0, netFish: 0, kills: 0, bossKills: 0, legendaries: 0, epics: 0, merges: 0, rerolls: 0, damageTaken: 0, spilled: 0, bestFishCoins: 0, bestFishId: "", bestFishKg: 0, bestFishTier: "" };
}

export function newRun(o: { captain: string; danger: number; daily?: string | null; seed?: number; companion?: string; harbour?: HarbourLevels }): RunState {
  const cap = CAPTAINS_BY_ID[o.captain] ?? CAPTAINS_BY_ID.marlow;
  const run: RunState = {
    v: 1, captain: cap.id, danger: Math.max(0, Math.min(5, o.danger | 0)), daily: o.daily ?? null,
    seed: o.seed ?? Math.floor(Math.random() * 2 ** 31), companion: o.companion ?? "none",
    tide: 1, coins: 15, earned: 0,
    rigs: [{ id: cap.startRig, tier: 1, uid: 1 }], trinkets: {}, picks: {}, pendingLevels: 0, levelsTaken: 0,
    counters: newCounters(), uidSeq: 1, shop: null, endless: false, startedAt: Date.now(),
  };
  // Harbour upgrades (permanent meta): starting coins and a spare rig; stat parts are applied in computeStats
  if (o.harbour && !run.daily) {
    run.harbour = { ...o.harbour };
    const lv = runHarbour(run);
    run.coins += harbourStartCoins(lv);
    const r = rng32((run.seed ^ 0x51ed27) >>> 0);
    if (rigSlots(run) > 1 && r() < harbourSpareChance(lv)) {
      const rules = cap.rules;
      const pool = RIGS.filter((d) => !d.unlock && d.id !== cap.startRig && (!rules.onlyClasses || rules.onlyClasses.includes(d.cls)) && !(rules.noFishing && (d.cls === "rod" || d.cls === "net")));
      if (pool.length) run.rigs.push({ id: pool[Math.floor(r() * pool.length)].id, tier: 1, uid: ++run.uidSeq });
    }
  }
  return run;
}

// ------------------------------------------------------------------------------------------------ rng
/** small seeded rng (same as client util mulberry32) */
export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** the rng for one roll of a run (tide + roll index keep shops reproducible for the Daily Tide) */
export function runRng(run: RunState, salt: number) { return rng32((run.seed ^ Math.imul(run.tide + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0); }
function pickWeighted<T>(items: readonly (readonly [T, number])[], r: () => number): T {
  const total = items.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let x = r() * total;
  for (const [v, w] of items) { x -= Math.max(0, w); if (x <= 0) return v; }
  return items[items.length - 1][0];
}

// ------------------------------------------------------------------------------------------------ stats
export interface RunSpecials { [k: string]: number }
export function captainRules(run: RunState) { return (CAPTAINS_BY_ID[run.captain] ?? CAPTAINS_BY_ID.marlow).rules; }
export function rigSlots(run: RunState) { return captainRules(run).slots ?? 6; }

export function computeStats(run: RunState): { stats: Stats; specials: Partial<Record<TrinketSpecial, number>>; classCount: Record<RigClass, number> } {
  const s: Stats = { ...BASE_STATS };
  const add = (p: Partial<Stats>, n = 1) => { for (const k of STAT_IDS) if (p[k]) s[k] += (p[k] as number) * n; };
  add(CAPTAINS_BY_ID[run.captain]?.stats ?? {});
  add(COMPANIONS_BY_ID[run.companion]?.stats ?? {});
  add(run.picks);
  const specials: Partial<Record<TrinketSpecial, number>> = {};
  for (const [id, n] of Object.entries(run.trinkets)) {
    const t = TRINKETS_BY_ID[id];
    if (!t || n <= 0) continue;
    add(t.stats, n);
    for (const [k, v] of Object.entries(t.special ?? {})) specials[k as TrinketSpecial] = (specials[k as TrinketSpecial] ?? 0) + (v as number) * n;
  }
  { // Harbour (permanent meta upgrades)
    const lv = runHarbour(run);
    add(harbourStats(lv));
    for (const [k, v] of Object.entries(harbourSpecials(lv))) if (v) specials[k as TrinketSpecial] = (specials[k as TrinketSpecial] ?? 0) + v;
  }
  { // item combos (./evolutions.ts)
    const cb = comboBonuses(run);
    add(cb.stats);
    for (const [k, v] of Object.entries(cb.special)) specials[k as TrinketSpecial] = (specials[k as TrinketSpecial] ?? 0) + (v as number);
  }
  const classCount: Record<RigClass, number> = { rod: 0, net: 0, harpoon: 0, explosive: 0, support: 0 };
  for (const r of run.rigs) { const d = RIGS_BY_ID[r.id]; if (d) classCount[d.cls]++; }
  if (classCount.support >= 2) s.regen += 2;
  // diminishing returns on the stats that multiply each other (damage × fire rate × engineering, haul × luck)
  for (const [k, [knee, room]] of Object.entries(STAT_SOFT_CAPS) as [StatId, [number, number]][]) s[k] = softCap(s[k], knee, room);
  if (specials.noRegen) s.regen = Math.min(0, s.regen);
  s.magnet = Math.max(2, s.magnet);
  s.maxHp = Math.max(10, Math.round(s.maxHp));
  return { stats: s, specials, classCount };
}
/** class set bonuses that are active (for the UI) */
export function activeSets(classCount: Record<RigClass, number>): { cls: RigClass; n: number; text: string }[] {
  const out: { cls: RigClass; n: number; text: string }[] = [];
  for (const [cls, info] of Object.entries(RIG_CLASS_INFO) as [RigClass, typeof RIG_CLASS_INFO[RigClass]][]) {
    for (const st of info.sets) if (classCount[cls] >= st.n) out.push({ cls, n: st.n, text: st.text });
  }
  return out;
}
/**
 * Stat soft caps: a stat counts in full up to `knee`, then each extra point is worth less and the total never passes
 * knee + room (hyperbolic: knee + room·x/(room + x) for x points above the knee). Negative values are untouched.
 */
export const STAT_SOFT_CAPS: Partial<Record<StatId, [number, number]>> = {
  harpoon: [40, 110], fireRate: [30, 60], engineering: [40, 90], haul: [25, 45], luck: [40, 90], regen: [1.5, 2.5], range: [30, 30],
  armor: [12, 18], maxHp: [180, 170],
};
export function softCap(v: number, knee: number, room: number) {
  if (v <= knee) return v;
  const x = v - knee;
  return Math.round((knee + (room * x) / (room + x)) * 10) / 10;
}
/** most critical-hit chance from trinkets and combos */
export const CRIT_CAP = 0.5;
/** armor → damage multiplier (Brotato-style diminishing returns; negative armor hurts) */
export function armorMult(armor: number) { return armor >= 0 ? 15 / (15 + armor) : (15 - armor) / 15; }
/** percent stat → multiplier, never below 0.25 */
export const pct = (v: number) => Math.max(0.25, 1 + v / 100);

// ------------------------------------------------------------------------------------------------ tides
export function biomeOf(tide: number): BiomeDef { return BIOMES[Math.floor((tide - 1) / TIDES_PER_BIOME) % BIOMES.length]; }
export function isBossTide(tide: number) { return BOSS_TIDES.includes(tide) || (tide > 20 && tide % 10 === 0); }
export function modifierOf(run: RunState, tide: number): ModifierId | null {
  if (tide < 3 || tide % 3 !== 0 || isBossTide(tide)) return null;
  const r = rng32((run.seed ^ Math.imul(tide, 0x27d4eb2d)) >>> 0);
  return MODIFIER_IDS[Math.floor(r() * MODIFIER_IDS.length)];
}

/** tides 1-6 are a warm-up: monster HP and damage ×0.76 at tide 1, +0.04 a tide (×1 from tide 7) */
export function earlyEase(tide: number) { return Math.min(1, 0.72 + 0.04 * tide); }
/**
 * Base monster HP of a tide (before Danger and the past-20 growth): ×1.18 a tide, eased on tides 1-4, and a wall from
 * tide 16 to 20 (×1.36 more a tide) so a build has to be complete by the final boss.
 */
export function monsterHpCurve(tide: number) {
  const t = Math.min(20, tide);
  return 45 * earlyEase(t) * Math.pow(1.18, t - 1) * Math.pow(1.36, Math.max(0, t - 15));
}
export interface TideSpec {
  tide: number; duration: number; boss: boolean; biome: BiomeDef; modifier: ModifierId | null;
  monsters: number; maxAlive: number; monsterHp: number; monsterDmg: number; eliteChance: number; bruteChance: number;
  schools: number; schoolFish: [number, number]; schoolRespawn: number;
  killCoins: number; killXp: number; interestCap: number; priceMult: number;
  bossHpMult: number;
}
export function tideSpec(run: RunState, tide = run.tide): TideSpec {
  const { specials } = computeStats(run);
  const d = run.danger;
  const over = Math.max(0, tide - 20);
  const boss = isBossTide(tide);
  const mod = modifierOf(run, tide);
  const frenzy = mod === "frenzy" ? 2 : 1;
  const dangerHp = 1 + 0.07 * d; // every Danger level: +7% monster and boss HP
  const hpMult = dangerHp * (d >= 5 ? 1.1 : 1) * Math.pow(1.12, over);
  return {
    tide, boss, biome: biomeOf(tide), modifier: mod,
    duration: boss ? 90 : Math.min(90, 50 + tide * 3),
    monsters: Math.round((2 + tide * 1.15) * (1 + 0.05 * d) * (1 + (specials.monsterMore ?? 0)) * frenzy * (boss ? 0.5 : 1)),
    maxAlive: Math.min(9, 2 + Math.floor(tide / 3) + (frenzy > 1 ? 2 : 0)),
    monsterHp: Math.round(monsterHpCurve(tide) * hpMult),
    monsterDmg: Math.round((4 + tide * 1.15) * earlyEase(tide) * Math.pow(1.045, Math.max(0, Math.min(20, tide) - 10)) * (d >= 3 ? 1.25 : 1) * Math.pow(1.05, over)),
    eliteChance: d >= 1 ? Math.min(0.25, 0.05 + tide * 0.01) : 0,
    bruteChance: tide >= 8 ? Math.min(0.2, 0.05 + (tide - 8) * 0.01) : 0,
    schools: 3 + Math.floor(tide / 8) + (specials.extraSchools ?? 0) + (frenzy > 1 ? 2 : 0),
    schoolFish: [4 + Math.floor(tide / 10), 7 + Math.floor(tide / 8)],
    schoolRespawn: mod === "school_rush" ? 4 : 8,
    killCoins: 2 + tide,
    killXp: 10 + tide * 4,
    interestCap: 15 + tide * 4 + (specials.interestCap ?? 0),
    priceMult: priceMultOf(tide),
    // bosses follow the monster curve, flatter (a tide-20 boss has about 9× the HP of a tide-10 one)
    bossHpMult: 1.8 * Math.pow(monsterHpCurve(tide) / monsterHpCurve(10), 0.72) * dangerHp * (d >= 5 ? 1.25 : 1) * Math.pow(1.15, over),
  };
}

// ------------------------------------------------------------------------------------------------ shop
export function rarityWeights(tide: number, luck: number): [Rarity, number][] {
  const L = Math.max(0, 1 + luck / 100);
  return [
    ["common", Math.max(12, 100 - tide * 4)],
    ["rare", (22 + tide * 1.6) * L],
    ["gold", tide >= 3 ? (3 + tide * 1.3) * L : 0],
    ["epic", tide >= 6 ? (0.8 + tide * 0.55) * L : 0],
    ["legendary", tide >= 10 ? (0.2 + tide * 0.16) * L : 0],
  ];
}
function rigTierFor(tide: number, r: () => number): number {
  const w: [number, number][] = [[1, Math.max(4, 24 - tide)], [2, tide >= 4 ? tide - 2 : 0], [3, tide >= 9 ? (tide - 7) * 0.8 : 0], [4, tide >= 14 ? (tide - 12) * 0.6 : 0]];
  return pickWeighted(w, r);
}
/** shop price multiplier of a tide (rigs, trinkets; tideSpec.priceMult) */
export function priceMultOf(tide: number) { return Math.pow(1.13, tide - 1) * (1 + 0.05 * Math.max(0, tide - 20)); }
export function rigPrice(id: string, tier: number, tide: number) {
  const d = RIGS_BY_ID[id];
  return Math.round((d?.price ?? 20) * RIG_TIER_PRICE[tier - 1] * priceMultOf(tide));
}
export function trinketPrice(id: string, tide: number) {
  const t = TRINKETS_BY_ID[id];
  return Math.round(TRINKET_PRICE[t?.rarity ?? "common"] * priceMultOf(tide));
}
/** 30% of the rig's price; an evolved (★) rig sells for twice its Tier IV value */
export function sellValue(slot: RigSlot, tide: number) { return Math.max(1, Math.floor(rigPrice(slot.id, slot.tier, tide) * 0.3)) * (slot.evolved ? 2 : 1); }
/** Tackle Shop reroll: 10 coins, +10 per reroll already done in this shop, × the tide's price multiplier */
export function rerollCost(tide: number, rerolls: number) { return Math.round((10 + 10 * rerolls) * priceMultOf(tide)); }

export interface ShopCtx { unlocked: (key: string) => boolean }
/** roll one offer */
export function rollOffer(run: RunState, r: () => number, ctx: ShopCtx, cursed = false): Offer {
  const rules = captainRules(run);
  const { stats } = computeStats(run);
  if (cursed) {
    // at most `max` copies of each cursed trinket: once all are maxed the slot is a normal offer
    const list = TRINKETS.filter((t) => t.cursed && (t.max === undefined || (run.trinkets[t.id] ?? 0) < t.max));
    if (list.length) {
      const t = list[Math.floor(r() * list.length)];
      return { kind: "trinket", id: t.id, price: Math.round(trinketPrice(t.id, run.tide) * 0.6) };
    }
  }
  const rigChance = rigSlots(run) <= 1 ? 0.3 : 0.36;
  if (r() < rigChance) {
    // a one-slot captain (Willy) sees a twin of his rig half the time, so he can merge it up
    const only = rigSlots(run) <= 1 ? run.rigs[0] : undefined;
    if (only && only.tier < MAX_RIG_TIER && r() < 0.5) return { kind: "rig", id: only.id, tier: only.tier, price: rigPrice(only.id, only.tier, run.tide) };
    const pool = RIGS.filter((d) => (!d.unlock || ctx.unlocked(d.unlock)) && (!rules.onlyClasses || rules.onlyClasses.includes(d.cls)) && !(rules.noFishing && (d.cls === "rod" || d.cls === "net")));
    // owned rigs are offered more often (merging is the point), much more often once every slot is taken
    const owned = new Set(run.rigs.map((x) => x.id));
    const ownedW = run.rigs.length >= rigSlots(run) ? 5 : 2.2;
    const d = pickWeighted(pool.map((p) => [p, owned.has(p.id) ? ownedW : 1] as const), r);
    const tier = rigTierFor(run.tide, r);
    return { kind: "rig", id: d.id, tier, price: rigPrice(d.id, tier, run.tide) };
  }
  const rarity = pickWeighted(rarityWeights(run.tide, stats.luck), r);
  const noFishStats: StatId[] = ["reel", "zone", "line", "bite"];
  let pool = TRINKETS.filter((t) => !t.cursed && t.rarity === rarity && (!t.unlock || ctx.unlocked(t.unlock)) && (t.max === undefined || (run.trinkets[t.id] ?? 0) < t.max));
  if (rules.noFishing) pool = pool.filter((t) => !Object.keys(t.stats).every((k) => noFishStats.includes(k as StatId)) || Object.keys(t.stats).length === 0);
  if (!pool.length) pool = TRINKETS.filter((t) => !t.cursed && t.rarity === "common");
  const t = pool[Math.floor(r() * pool.length)];
  return { kind: "trinket", id: t.id, price: trinketPrice(t.id, run.tide) };
}

export function shopSize(run: RunState) { return Math.max(2, (captainRules(run).shopSize ?? 4) - (run.danger >= 2 ? 1 : 0)) + harbourShopSlots(run); }
/** a fresh shop for the current tide (locked offers stay) */
export function rollShop(run: RunState, ctx: ShopCtx, salt = 0) {
  const n = shopSize(run);
  const prev = run.shop;
  const r = runRng(run, 1000 + salt);
  const offers: (Offer | null)[] = [];
  const locked: boolean[] = [];
  const cursedAt = captainRules(run).cursedShop ? Math.floor(r() * n) : -1;
  for (let i = 0; i < n; i++) {
    if (prev && prev.locked[i] && prev.offers[i]) { offers.push(prev.offers[i]); locked.push(true); continue; }
    offers.push(rollOffer(run, r, ctx, i === cursedAt));
    locked.push(false);
  }
  run.shop = { offers, locked, rerolls: prev && salt > 0 ? prev.rerolls : 0 };
}

/** buy: rigs go in a free slot (or merge into a twin when full / Net Witch; a one-slot captain swaps, selling the old rig); returns why it failed */
export function buy(run: RunState, i: number): { ok: true; merged?: RigSlot; swapped?: RigSlot } | { ok: false; why: string } {
  const o = run.shop?.offers[i];
  if (!o) return { ok: false, why: "Sold out" };
  if (run.coins < o.price) return { ok: false, why: "Not enough coins" };
  if (o.kind === "rig") {
    const twin = run.rigs.find((s) => s.id === o.id && s.tier === o.tier && s.tier < MAX_RIG_TIER);
    const full = run.rigs.length >= rigSlots(run);
    if (twin && (full || captainRules(run).instantMerge)) {
      run.coins -= o.price;
      twin.tier++;
      run.counters.merges++;
      run.shop!.offers[i] = null;
      return { ok: true, merged: twin };
    }
    if (full && rigSlots(run) === 1) { // One-Line Willy: the new rig replaces the old one, which is sold
      const old = run.rigs[0];
      run.coins += sellValue(old, run.tide) - o.price;
      run.rigs = [{ id: o.id, tier: o.tier, uid: ++run.uidSeq }];
      run.shop!.offers[i] = null;
      run.shop!.locked[i] = false;
      return { ok: true, swapped: old };
    }
    if (full) return { ok: false, why: "Rig slots full (sell one, or buy a twin to merge)" };
    run.coins -= o.price;
    run.rigs.push({ id: o.id, tier: o.tier, uid: ++run.uidSeq });
  } else {
    const t = TRINKETS_BY_ID[o.id];
    if (t?.max !== undefined && (run.trinkets[o.id] ?? 0) >= t.max) return { ok: false, why: "You can only carry one" };
    run.coins -= o.price;
    run.trinkets[o.id] = (run.trinkets[o.id] ?? 0) + 1;
  }
  run.shop!.offers[i] = null;
  run.shop!.locked[i] = false;
  return { ok: true };
}
/** two rigs of the same kind and tier → one of the next tier */
export function mergeable(run: RunState): [RigSlot, RigSlot][] {
  const out: [RigSlot, RigSlot][] = [];
  const seen = new Set<number>();
  for (const a of run.rigs) for (const b of run.rigs) {
    if (a.uid >= b.uid || seen.has(a.uid) || seen.has(b.uid)) continue;
    if (a.id === b.id && a.tier === b.tier && a.tier < MAX_RIG_TIER) { out.push([a, b]); seen.add(a.uid); seen.add(b.uid); }
  }
  return out;
}
export function merge(run: RunState, a: RigSlot, b: RigSlot) {
  if (a.id !== b.id || a.tier !== b.tier || a.tier >= MAX_RIG_TIER) return false;
  a.tier++;
  run.rigs = run.rigs.filter((s) => s.uid !== b.uid);
  run.counters.merges++;
  return true;
}
export function sell(run: RunState, uid: number) {
  if (run.rigs.length <= 1) return 0;
  const s = run.rigs.find((x) => x.uid === uid);
  if (!s) return 0;
  const v = sellValue(s, run.tide);
  run.rigs = run.rigs.filter((x) => x.uid !== uid);
  run.coins += v;
  return v;
}

// ------------------------------------------------------------------------------------------------ level-ups
export function rollLevelOffers(run: RunState, salt = 0): LevelOffer[] {
  const r = runRng(run, 5000 + run.levelsTaken * 31 + salt);
  const { stats } = computeStats(run);
  const rules = captainRules(run);
  let ids = STAT_IDS.slice();
  if (rules.noFishing) ids = ids.filter((s) => !["reel", "zone", "line", "bite"].includes(s));
  const out: LevelOffer[] = [];
  const w = rarityWeights(Math.max(1, run.tide + 2), stats.luck).filter(([k]) => k !== "legendary");
  while (out.length < 4 && ids.length) {
    const stat = ids.splice(Math.floor(r() * ids.length), 1)[0];
    const rarity = pickWeighted(w, r);
    const mult = { common: 1, rare: 2, gold: 3, epic: 5, legendary: 8 }[rarity];
    out.push({ stat, rarity, amount: Math.round(LEVEL_STEP[stat] * mult * 100) / 100 });
  }
  return out;
}
export function takeLevel(run: RunState, o: LevelOffer) {
  run.picks[o.stat] = Math.round(((run.picks[o.stat] ?? 0) + o.amount) * 100) / 100;
  run.pendingLevels = Math.max(0, run.pendingLevels - 1);
  run.levelsTaken++;
}
export function levelRerollCost(tide: number) { return 4 + tide; }

// ------------------------------------------------------------------------------------------------ interest and score
export function interestFor(run: RunState) {
  const { stats } = computeStats(run);
  const cap = tideSpec(run).interestCap;
  return Math.max(0, Math.min(cap, Math.floor(run.coins * Math.max(0, stats.interest) / 100)));
}
export function runScore(run: RunState, tideReached: number) { return tideReached * 1000 + run.earned; }

// ------------------------------------------------------------------------------------------------ daily tide
export function todayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function dailySeed(key: string) { let h = 2166136261; for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function dailyCaptain(key: string) { const ids = ["marlow", "merchant", "harpooner", "willy", "netwitch", "ingrid", "abyssal", "pip"]; return ids[dailySeed(key) % ids.length]; }
export const DAILY_DANGER = 1;
const RIVALS = ["Salty Sue", "Capt. Barnacle", "Wavecrest Wen", "Old Jory", "Mira Gale", "Rook Halloran", "Tess Driftwood", "Bo Hookline", "Nell Fathom", "Ivo Brine", "Cora Reefheart"];
/** the AI rivals of the Daily Tide tournament (same for everyone on a day) */
export function dailyRivals(key: string): { name: string; tide: number; score: number }[] {
  const r = rng32(dailySeed(key) ^ 0x5bd1e995);
  return RIVALS.map((name) => {
    const tide = Math.max(3, Math.min(24, Math.round(4 + Math.pow(r(), 0.9) * 18)));
    return { name, tide, score: tide * 1000 + Math.round(tide * tide * (6 + r() * 6)) };
  }).sort((a, b) => b.score - a.score);
}
