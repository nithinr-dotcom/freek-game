/** Fish Codex bookkeeping: first catches, records, completion per region. */
import { speciesOfRegion, regionList, type FishCardS, type RegionId } from "@freek/shared";
import type { SoloSave } from "./save";

/** returns true when this is the species' first catch */
export function recordCatch(save: SoloSave, card: FishCardS): boolean {
  const e = save.codex[card.speciesId];
  if (!e) { save.codex[card.speciesId] = { n: 1, recordKg: card.weightKg, first: Date.now() }; return true; }
  e.n++;
  e.recordKg = Math.max(e.recordKg, card.weightKg);
  return false;
}
export function regionCompletion(save: SoloSave, region: RegionId): { caught: number; total: number; pct: number } {
  const list = speciesOfRegion(region);
  const caught = list.filter((s) => save.codex[s.id]).length;
  return { caught, total: list.length, pct: list.length ? Math.round((caught / list.length) * 100) : 0 };
}
export function totalCompletion(save: SoloSave) {
  let caught = 0, total = 0;
  for (const r of regionList()) { const c = regionCompletion(save, r.id); caught += c.caught; total += c.total; }
  return { caught, total, pct: total ? Math.round((caught / total) * 100) : 0 };
}
