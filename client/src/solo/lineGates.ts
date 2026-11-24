/**
 * Gear gates on fish (§4 "soft but real" gating): a gated species can be hooked with any line, but if the line rating
 * is below the gate the fish tears it apart (tension climbs to a snap) and a toast says which line it needs.
 * Species files register their gates here (client side, so the shared species type stays unchanged).
 */
import { getCampaignSpecies } from "@freek/shared";

const gates = new Map<string, { minRatingKg: number; need: string }>();
export function registerLineGate(speciesId: string, minRatingKg: number, need: string) { gates.set(speciesId, { minRatingKg, need }); }

/** toast text when the line can't hold this species, else null */
export function lineGate(speciesId: string, ratingKg: number): string | null {
  const g = gates.get(speciesId);
  if (!g || ratingKg >= g.minRatingKg) return null;
  const name = getCampaignSpecies(speciesId)?.name ?? speciesId;
  return `<b>⚡ The ${name} is tearing your line apart!</b> Your ${ratingKg} kg line can't hold it: craft a ${g.need} at the Workshop.`;
}
export function lineGateInfo(speciesId: string) { return gates.get(speciesId) ?? null; }

// Act 3: the Thunder Marlin (over 120 kg) needs line T3 (Sharkline, 150 kg)
registerLineGate("thunder_marlin", 150, "T3 Sharkline (150 kg)");
