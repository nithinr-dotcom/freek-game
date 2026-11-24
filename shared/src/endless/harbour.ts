/**
 * Endless Tide Harbour (permanent meta-progression): Pearls are earned at the end of every run (win or lose) and
 * spent on small permanent upgrades. Pure data + rules; the client stores pearls/levels in the Endless meta save and
 * passes the levels into newRun (they ride on RunState.harbour so resumed runs keep them). The Daily Tide ignores
 * the Harbour so the tournament stays fair.
 */
import type { RunState } from "./rules.js";
import type { StatId } from "./data.js";

export type HarbourId = "coins" | "hull" | "luck" | "crew" | "insurance" | "bank" | "dice" | "stall" | "spare";
export type HarbourLevels = Partial<Record<HarbourId, number>>;

export interface HarbourDef {
  id: HarbourId; name: string; icon: string;
  /** pearl cost of each level (length = max level) */
  costs: number[];
  /** what one level / the given level gives (for the UI) */
  text: (lvl: number) => string;
}

export const HARBOUR: HarbourDef[] = [
  { id: "coins", name: "Seed Money", icon: "💰", costs: [4, 8, 14, 22, 32], text: (l) => `Start every run with +${15 * l} coins` },
  { id: "hull", name: "Reinforced Hull", icon: "❤", costs: [5, 10, 18, 28], text: (l) => `+${6 * l} Max HP` },
  { id: "luck", name: "Lucky Figurehead", icon: "🍀", costs: [6, 12, 20, 30], text: (l) => `+${3 * l} Luck` },
  { id: "crew", name: "Seasoned Crew", icon: "⭐", costs: [8, 18, 30], text: (l) => `+${5 * l}% XP from fish and monsters` },
  { id: "insurance", name: "Hold Insurance", icon: "🚿", costs: [5, 12, 22], text: (l) => `Monster hits spill ${15 * l}% fewer fish` },
  { id: "bank", name: "Harbour Bank", icon: "🏦", costs: [6, 14, 25], text: (l) => `Interest cap +${5 * l}` },
  { id: "dice", name: "Dice Cup", icon: "🎲", costs: [30], text: (l) => `${l} free Tackle Shop reroll${l > 1 ? "s" : ""} per shop` },
  { id: "stall", name: "Market Stall", icon: "🛒", costs: [80], text: () => "+1 offer in every Tackle Shop" },
  { id: "spare", name: "Spare Rig", icon: "🎣", costs: [25, 50], text: (l) => (l >= 2 ? "Always start with a random extra tier I rig" : "50% chance to start with a random extra tier I rig") },
];
export const HARBOUR_BY_ID = Object.fromEntries(HARBOUR.map((d) => [d.id, d])) as Record<HarbourId, HarbourDef>;

export const harbourLevel = (lv: HarbourLevels | undefined, id: HarbourId) => Math.max(0, Math.min(HARBOUR_BY_ID[id].costs.length, lv?.[id] ?? 0));
export const harbourMaxed = (lv: HarbourLevels | undefined, id: HarbourId) => harbourLevel(lv, id) >= HARBOUR_BY_ID[id].costs.length;
/** pearl cost of the next level (null when maxed) */
export function harbourNextCost(lv: HarbourLevels | undefined, id: HarbourId): number | null {
  const l = harbourLevel(lv, id);
  return HARBOUR_BY_ID[id].costs[l] ?? null;
}
/** total pearls to max everything */
export const HARBOUR_TOTAL_COST = HARBOUR.reduce((a, d) => a + d.costs.reduce((x, y) => x + y, 0), 0);

// ------------------------------------------------------------------------------------------------ effects
/** levels in effect for a run (none on the Daily Tide) */
export const runHarbour = (run: RunState): HarbourLevels => (run.daily ? {} : run.harbour ?? {});
export const harbourStartCoins = (lv: HarbourLevels) => 15 * harbourLevel(lv, "coins");
export function harbourStats(lv: HarbourLevels): Partial<Record<StatId, number>> {
  return { maxHp: 6 * harbourLevel(lv, "hull"), luck: 3 * harbourLevel(lv, "luck") };
}
export function harbourSpecials(lv: HarbourLevels): { spillGuard: number; interestCap: number } {
  return { spillGuard: 0.15 * harbourLevel(lv, "insurance"), interestCap: 5 * harbourLevel(lv, "bank") };
}
export const harbourXpMult = (run: RunState) => 1 + 0.05 * harbourLevel(runHarbour(run), "crew");
export const harbourShopSlots = (run: RunState) => harbourLevel(runHarbour(run), "stall");
export const harbourFreeRerolls = (run: RunState) => harbourLevel(runHarbour(run), "dice");
/** chance to start with a spare rig */
export const harbourSpareChance = (lv: HarbourLevels) => [0, 0.5, 1][harbourLevel(lv, "spare")];

// ------------------------------------------------------------------------------------------------ pearls
/**
 * Pearls for a finished run: 1 per tide reached, +3 per boss killed, +10 for clearing tide 20, ×(1 + 15% per Danger),
 * +5 for a Daily Tide run. Always at least 1.
 */
export function pearlsForRun(run: RunState, reached: number, won: boolean): number {
  const base = Math.max(0, reached) + 3 * (run.counters.bossKills ?? 0) + (won || run.endless ? 10 : 0);
  return Math.max(1, Math.round(base * (1 + 0.15 * run.danger)) + (run.daily ? 5 : 0));
}
