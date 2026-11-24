/**
 * Endless Tide unlock progress: how far the player is towards each unlock key ({cur, need}), and the closest
 * locked unlocks for the death screen. Mirrors the conditions in meta.ts checkUnlocks (keep the two in step).
 */
import { UNLOCK_TEXT } from "@freek/shared";
import type { CaptainRecord, EndlessMeta } from "./meta";
import { unlockRewards } from "./meta";
import { loadSave } from "../solo/save";

/** the parts of the meta save progress is computed from (so a pre-run snapshot works too) */
export interface ProgressSource { stats: Record<string, number>; captains: Record<string, CaptainRecord>; unlocks: string[] }
export interface UnlockProgress { key: string; cur: number; need: number; label: string; /** what "cur" counts, for the "(312/500)" text */ unit: string }

const bestDangerWon = (s: ProgressSource) => Object.values(s.captains).reduce((a, c) => Math.max(a, c.danger ?? -1), -1);

/** progress towards one unlock key; null when the key can't be earned in Endless (campaign-only bosses) or is unknown */
export function unlockProgress(key: string, s: ProgressSource, campaignBeaten?: Set<string>): { cur: number; need: number; unit: string } | null {
  const st = s.stats;
  const n = (k: string) => st[k] ?? 0;
  switch (key) {
    case "tide_8": return { cur: n("bestTide"), need: 8, unit: "best tide" };
    case "tide_10": return { cur: n("bestTide"), need: 10, unit: "best tide" };
    case "tide_16": return { cur: n("bestTide"), need: 16, unit: "best tide" };
    case "kills_150": return { cur: n("kills"), need: 150, unit: "monsters" };
    case "kills_300": return { cur: n("kills"), need: 300, unit: "monsters" };
    case "net_500": return { cur: n("netFish"), need: 500, unit: "net fish" };
    case "win_any": return { cur: Math.min(1, n("wins")), need: 1, unit: "wins" };
    case "win_one_rig": return { cur: Math.min(1, n("winOneRig")), need: 1, unit: "wins" };
    case "danger_2": return { cur: Math.max(0, bestDangerWon(s)), need: 2, unit: "best Danger won" };
    case "danger_3": return { cur: Math.max(0, bestDangerWon(s)), need: 3, unit: "best Danger won" };
    case "legend_10": return { cur: n("legendaries"), need: 10, unit: "Legendary fish" };
    case "boss_reef_serpent": return { cur: campaignBeaten?.has("reef_serpent") || n("boss_reef_serpent") > 0 ? 1 : 0, need: 1, unit: "beaten" };
    case "boss_crab_titan": return { cur: campaignBeaten?.has("crab_titan") || n("boss_crab_titan") > 0 ? 1 : 0, need: 1, unit: "beaten" };
    default: return null;
  }
}

/**
 * The closest locked unlocks that give something, best first. `pre` (the meta as it was when the run started) adds
 * the "from" value so the bar can animate; keys unlocked during this run are left out (the summary lists those).
 */
export function closestUnlocks(meta: EndlessMeta, pre: ProgressSource | null, max = 3): (UnlockProgress & { from: number; rewards: string[] })[] {
  const beaten = new Set(loadSave()?.bossesBeaten ?? []);
  const out: (UnlockProgress & { from: number; rewards: string[]; ratio: number })[] = [];
  for (const key of Object.keys(UNLOCK_TEXT)) {
    if (meta.unlocks.includes(key)) continue;
    const rewards = unlockRewards(key);
    if (!rewards.length) continue;
    const p = unlockProgress(key, meta, beaten);
    if (!p || p.cur >= p.need) continue;
    const before = pre ? unlockProgress(key, pre, beaten) : null;
    const from = Math.min(p.cur, before?.cur ?? p.cur);
    out.push({ key, ...p, from, label: UNLOCK_TEXT[key], rewards, ratio: p.cur / p.need });
  }
  // closest first; among equals, the one that moved this run, then the cheaper goal
  out.sort((a, b) => b.ratio - a.ratio || (b.cur - b.from) - (a.cur - a.from) || a.need - b.need);
  return out.slice(0, max).map(({ ratio: _r, ...rest }) => rest);
}
