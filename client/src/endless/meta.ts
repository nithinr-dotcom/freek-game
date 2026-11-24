/**
 * Endless Tide meta save (separate from the campaign save): unlocks, records per captain, the Almanac, the Daily Tide,
 * the run in progress (resumable between tides), the chosen companion and the Endless aquarium trophies.
 */
import { CAPTAINS, CAPTAINS_BY_ID, COMPANIONS_BY_ID, UNLOCK_TEXT, RIGS, TRINKETS, type RunState, type Tier, type HarbourLevels } from "@freek/shared";
import { loadSave } from "../solo/save";

export const META_KEY = "tidebreakers.endless.v1";

export interface CaptainRecord { bestTide: number; bestScore: number; /** highest Danger won (-1 = none) */ danger: number; runs: number; wins: number }
export interface DailyRecord { best: number; tide: number; runs: number }
export interface TrophyFish { kg: number; tier: Tier; at: number }
export interface EndlessMeta {
  v: 1;
  unlocks: string[];
  stats: Record<string, number>;
  captains: Record<string, CaptainRecord>;
  seen: { rigs: string[]; trinkets: string[] };
  daily: Record<string, DailyRecord>;
  run: RunState | null;
  companion: string;
  trophies: Record<string, TrophyFish>;
  /** recent runs for the history list */
  history: { captain: string; danger: number; tide: number; score: number; won: boolean; daily: string | null; at: number }[];
  /** combo + evolution ids ever discovered (Almanac "Combos" tab, see combos.ts) */
  discoveries?: string[];
  /** Harbour: permanent currency (earned every run) and bought upgrade levels */
  pearls: number;
  pearlsEarned: number;
  harbour: HarbourLevels;
}

export function newMeta(): EndlessMeta {
  return { v: 1, unlocks: [], stats: {}, captains: {}, seen: { rigs: [], trinkets: [] }, daily: {}, run: null, companion: "gull", trophies: {}, history: [], pearls: 0, pearlsEarned: 0, harbour: {} };
}
export function loadMeta(): EndlessMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return newMeta();
    const m = JSON.parse(raw) as EndlessMeta;
    if (m?.v !== 1) return newMeta();
    return {
      ...newMeta(), ...m, seen: { rigs: m.seen?.rigs ?? [], trinkets: m.seen?.trinkets ?? [] },
      pearls: Number.isFinite(m.pearls) ? Math.max(0, m.pearls) : 0, pearlsEarned: Number.isFinite(m.pearlsEarned) ? m.pearlsEarned : 0,
      harbour: m.harbour && typeof m.harbour === "object" ? m.harbour : {},
    };
  } catch { return newMeta(); }
}
export function writeMeta(m: EndlessMeta) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* storage full */ } }

export const isUnlocked = (m: EndlessMeta, key?: string) => !key || m.unlocks.includes(key);
export const unlockText = (key?: string) => (key ? UNLOCK_TEXT[key] ?? key : "");
export function captainRecord(m: EndlessMeta, id: string): CaptainRecord { return m.captains[id] ?? { bestTide: 0, bestScore: 0, danger: -1, runs: 0, wins: 0 }; }
export function maxDanger(m: EndlessMeta, id: string) { return Math.min(5, captainRecord(m, id).danger + 1); }
export function captainUnlocked(m: EndlessMeta, id: string) { return isUnlocked(m, CAPTAINS_BY_ID[id]?.unlock); }
export function companionUnlocked(m: EndlessMeta, id: string) { return isUnlocked(m, COMPANIONS_BY_ID[id]?.unlock); }
/** the companion, also shown in the campaign (falls back if it got locked somehow) */
export function currentCompanion(m = loadMeta()) { return companionUnlocked(m, m.companion) ? m.companion : "gull"; }

/** evaluate every unlock condition; returns the newly unlocked keys (and stores them) */
export function checkUnlocks(m: EndlessMeta): string[] {
  const st = m.stats;
  const camp = loadSave();
  const beaten = new Set(camp?.bossesBeaten ?? []);
  const anyDanger = (n: number) => Object.values(m.captains).some((c) => c.danger >= n);
  const cond: Record<string, boolean> = {
    tide_8: (st.bestTide ?? 0) >= 8,
    tide_10: (st.bestTide ?? 0) >= 10,
    tide_16: (st.bestTide ?? 0) >= 16,
    kills_150: (st.kills ?? 0) >= 150,
    kills_300: (st.kills ?? 0) >= 300,
    net_500: (st.netFish ?? 0) >= 500,
    win_any: (st.wins ?? 0) >= 1,
    win_one_rig: (st.winOneRig ?? 0) >= 1,
    danger_2: anyDanger(2),
    danger_3: anyDanger(3),
    legend_10: (st.legendaries ?? 0) >= 10,
    boss_reef_serpent: beaten.has("reef_serpent") || (st.boss_reef_serpent ?? 0) > 0,
    boss_crab_titan: beaten.has("crab_titan") || (st.boss_crab_titan ?? 0) > 0,
    boss_storm_kraken: beaten.has("storm_kraken"),
    boss_ice_leviathan: beaten.has("ice_leviathan"),
    boss_maelstrom_eye: beaten.has("maelstrom_eye"),
  };
  const fresh: string[] = [];
  for (const [k, ok] of Object.entries(cond)) if (ok && !m.unlocks.includes(k)) { m.unlocks.push(k); fresh.push(k); }
  return fresh;
}
/** human text for what an unlock key opens */
export function unlockRewards(key: string): string[] {
  const out: string[] = [];
  for (const c of CAPTAINS) if (c.unlock === key) out.push(`Captain: ${c.icon} ${c.name}`);
  for (const c of Object.values(COMPANIONS_BY_ID)) if (c.unlock === key) out.push(`Companion: ${c.icon} ${c.name}`);
  for (const r of RIGS) if (r.unlock === key) out.push(`Rig: ${r.icon} ${r.name}`);
  for (const t of TRINKETS) if (t.unlock === key) out.push(`Trinket: ${t.icon} ${t.name}`);
  return out;
}
