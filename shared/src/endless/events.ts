/**
 * Endless Tide treasure chests and mid-tide events (pure data + rolls, no DOM). The client side lives in
 * client/src/endless/events.ts. Elites and bosses drop chests (wood / silver / gold); from tide 2 on, a tide may get
 * one random event (merchant ship, cursed altar, shiny legendary school, treasure rain).
 */
import { TRINKETS, MAX_RIG_TIER, type Rarity, type StatId } from "./data.js";
import { rarityWeights, captainRules, isBossTide, type RunState, type ShopCtx } from "./rules.js";

function pick<T>(items: readonly (readonly [T, number])[], r: () => number): T {
  const total = items.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let x = r() * total;
  for (const [v, w] of items) { x -= Math.max(0, w); if (x <= 0) return v; }
  return items[items.length - 1][0];
}

// ------------------------------------------------------------------------------------------------ chests
export type ChestTier = "wood" | "silver" | "gold";
export const CHEST_INFO: Record<ChestTier, { label: string; color: string; trim: string; coinMult: number; tideBonus: number; odds: { coins: number; trinket: number; rig: number } }> = {
  wood: { label: "Wooden Chest", color: "#a0683a", trim: "#d9a066", coinMult: 1, tideBonus: 0, odds: { coins: 50, trinket: 40, rig: 10 } },
  silver: { label: "Silver Chest", color: "#8a96a3", trim: "#e6eef5", coinMult: 2, tideBonus: 3, odds: { coins: 35, trinket: 45, rig: 20 } },
  gold: { label: "Golden Chest", color: "#c98d1a", trim: "#ffe27a", coinMult: 4, tideBonus: 6, odds: { coins: 20, trinket: 50, rig: 30 } },
};

/** chest tier: bosses drop gold (silver 25%), elites mostly wood; Luck shifts the odds up */
export function rollChestTier(source: "elite" | "boss", tide: number, luck: number, r: () => number): ChestTier {
  const L = Math.max(0, 1 + luck / 100);
  if (source === "boss") return r() < 0.25 / L ? "silver" : "gold";
  return pick<ChestTier>([["wood", 62], ["silver", (30 + tide) * L], ["gold", (4 + tide * 0.4) * L]], r);
}

export type ChestReward =
  | { kind: "coins"; n: number }
  | { kind: "trinket"; id: string }
  | { kind: "rig"; uid: number; from: number };

/** a random trinket the run may own (rarity by tide + Luck, unlocks, max copies; no cursed ones) */
export function rollTrinketFor(run: RunState, r: () => number, ctx: ShopCtx, tide: number, luck: number, minRarity: Rarity = "common"): string {
  const order: Rarity[] = ["common", "rare", "gold", "epic", "legendary"];
  const lo = order.indexOf(minRarity);
  const w = rarityWeights(tide, luck).filter(([k]) => order.indexOf(k) >= lo);
  const noFish: StatId[] = ["reel", "zone", "line", "bite"];
  const ok = (rar: Rarity) => {
    let pool = TRINKETS.filter((t) => !t.cursed && t.rarity === rar && (!t.unlock || ctx.unlocked(t.unlock)) && (t.max === undefined || (run.trinkets[t.id] ?? 0) < t.max));
    if (captainRules(run).noFishing) pool = pool.filter((t) => Object.keys(t.stats).length === 0 || !Object.keys(t.stats).every((k) => noFish.includes(k as StatId)));
    return pool;
  };
  let rarity = pick(w.length ? w : [["common", 1] as const], r);
  let pool = ok(rarity);
  // fall back down the rarities when a tier is empty
  for (let i = order.indexOf(rarity) - 1; !pool.length && i >= 0; i--) { rarity = order[i]; pool = ok(rarity); }
  if (!pool.length) pool = TRINKETS.filter((t) => !t.cursed && t.rarity === "common");
  return pool[Math.floor(r() * pool.length)].id;
}

/** what a chest holds (coins, a trinket, or a tier-up of a random owned rig below tier IV) */
export function rollChestReward(run: RunState, tier: ChestTier, luck: number, r: () => number, ctx: ShopCtx): ChestReward {
  const info = CHEST_INFO[tier];
  const upgradable = run.rigs.filter((s) => s.tier < MAX_RIG_TIER);
  const kind = pick<"coins" | "trinket" | "rig">([["coins", info.odds.coins], ["trinket", info.odds.trinket], ["rig", upgradable.length ? info.odds.rig : 0]], r);
  if (kind === "coins") return { kind: "coins", n: Math.round((10 + run.tide * 2.5) * info.coinMult * (0.8 + r() * 0.4)) };
  if (kind === "rig") { const s = upgradable[Math.floor(r() * upgradable.length)]; return { kind: "rig", uid: s.uid, from: s.tier }; }
  return { kind: "trinket", id: rollTrinketFor(run, r, ctx, run.tide + info.tideBonus, luck, tier === "gold" ? "rare" : "common") };
}

/** apply a chest reward to the run (coins go through the caller so they count as earned) */
export function applyChestReward(run: RunState, rw: ChestReward): void {
  if (rw.kind === "trinket") run.trinkets[rw.id] = (run.trinkets[rw.id] ?? 0) + 1;
  else if (rw.kind === "rig") { const s = run.rigs.find((x) => x.uid === rw.uid); if (s && s.tier < MAX_RIG_TIER) { s.tier++; run.counters.merges++; } }
}

// ------------------------------------------------------------------------------------------------ mid-tide events
export type TideEventId = "merchant" | "altar" | "shiny" | "treasure_rain";
export const TIDE_EVENTS: Record<TideEventId, { name: string; icon: string; color: string; text: string; weight: number; minTide: number }> = {
  merchant: { name: "Merchant Ship", icon: "⛵", color: "#ffd24a", text: "A trader is crossing the arena. Sail alongside to browse cut-price wares!", weight: 30, minTide: 2 },
  altar: { name: "Cursed Altar", icon: "🗿", color: "#b05cff", text: "A cursed shrine has surfaced. Touch it… if you dare.", weight: 22, minTide: 3 },
  shiny: { name: "Shiny School", icon: "🌈", color: "#ff7ae0", text: "A rainbow school with a Legendary inside! 10 seconds, go!", weight: 22, minTide: 2 },
  treasure_rain: { name: "Treasure Rain", icon: "💰", color: "#ffe27a", text: "Coins are falling from the sky!", weight: 26, minTide: 2 },
};
export const TIDE_EVENT_IDS = Object.keys(TIDE_EVENTS) as TideEventId[];

/** chance that a tide has an event */
export function tideEventChance(tide: number) { return tide < 2 ? 0 : Math.min(0.65, 0.4 + tide * 0.015); }
/** the event of a tide (or null) and when it starts, in seconds into the tide */
export function rollTideEvent(tide: number, duration: number, r: () => number): { id: TideEventId; at: number } | null {
  if (tide < 2 || isBossTide(tide) || r() >= tideEventChance(tide)) return null;
  const id = pick(TIDE_EVENT_IDS.filter((k) => tide >= TIDE_EVENTS[k].minTide).map((k) => [k, TIDE_EVENTS[k].weight] as const), r);
  const lo = 10, hi = Math.max(lo + 1, duration - 28);
  return { id, at: lo + r() * (hi - lo) };
}

/** cursed altar deals: a reward with a price */
export type AltarDealId = "blood_pact" | "gamblers_tithe" | "iron_oath";
export const ALTAR_DEALS: Record<AltarDealId, { name: string; icon: string; gain: string; cost: string }> = {
  blood_pact: { name: "Blood Pact", icon: "🩸", gain: "An Epic-or-better trinket", cost: "−20% Max HP for the run" },
  gamblers_tithe: { name: "Gambler's Tithe", icon: "🎲", gain: "The hold pays double this tide", cost: "Twice the monsters, now" },
  iron_oath: { name: "Iron Oath", icon: "⛓", gain: "+1 tier on a random rig", cost: "−4 Armor for the run" },
};
export const ALTAR_DEAL_IDS = Object.keys(ALTAR_DEALS) as AltarDealId[];
/** merchant discount on rolled offers */
export const MERCHANT_DISCOUNT = 0.6;
