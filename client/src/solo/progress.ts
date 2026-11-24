/** Shared progress rules for solo missions and campaign objectives, plus the solo fish roll. */
import {
  TIERS, TIER_INFO, SPECIES, ZONE_TIER_BONUS, tierRank, fishPoints,
  type CampaignObjectiveKind, type FishCardS, type MonsterKind, type Species, type Tier, type ZoneId,
} from "@freek/shared";

export type ProgressEvent =
  | { t: "catch"; card: FishCardS; zone: ZoneId; perfect: boolean; storm: boolean }
  | { t: "bank"; points: number; fish: number }
  | { t: "hit" }
  | { t: "kill"; kind: MonsterKind };

/** returns the new progress value for `kind` after `ev` */
export function applyEvent(kind: CampaignObjectiveKind, progress: number, ev: ProgressEvent): number {
  switch (kind.type) {
    case "catch_count": return ev.t === "catch" ? progress + 1 : progress;
    case "catch_tier": return ev.t === "catch" && tierRank(ev.card.tier) >= tierRank(kind.tier) ? progress + 1 : progress;
    case "catch_zone": return ev.t === "catch" && ev.zone === kind.zone ? progress + 1 : progress;
    case "catch_weight": return ev.t === "catch" && ev.card.weightKg >= kind.kg ? 1 : progress;
    case "perfect_reel": return ev.t === "catch" && ev.perfect ? progress + 1 : progress;
    case "storm_catch": return ev.t === "catch" && ev.storm ? progress + 1 : progress;
    case "bank_points": return ev.t === "bank" ? Math.max(progress, Math.min(kind.n, ev.points)) : progress;
    case "bank_any": return ev.t === "bank" && ev.fish > 0 ? progress + 1 : progress;
    case "harpoon_hits": return ev.t === "hit" ? progress + 1 : progress;
    case "monster_kill": return ev.t === "kill" ? progress + 1 : progress;
  }
  return progress;
}

export interface SoloRollOpts { zone: ZoneId; rodLevel: number; storm: boolean; legendaryMult: number; forceMinTier?: Tier }

/** Same rules as shared rollFish(), plus a legendary multiplier (legendary rod, chapter 6 boost). */
export function soloRollFish(o: SoloRollOpts): { species: Species; weightKg: number; points: number } {
  const minRank = o.forceMinTier ? tierRank(o.forceMinTier) : 0;
  const entries = TIERS.filter((t) => tierRank(t) >= minRank).map((t) => {
    let w = TIER_INFO[t].weight * (ZONE_TIER_BONUS[o.zone][t] ?? 1);
    if (t !== "common") w *= 1 + 0.08 * (o.rodLevel - 1);
    if (o.storm && t !== "common") w *= 1.5;
    if (t === "legendary") w *= o.legendaryMult;
    if (t === "epic") w *= Math.sqrt(o.legendaryMult);
    return [t, w] as const;
  });
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  let tier: Tier = entries[entries.length - 1][0];
  for (const [t, w] of entries) { r -= w; if (r <= 0) { tier = t; break; } }
  let pool = SPECIES.filter((s) => s.tier === tier && s.zones.includes(o.zone));
  if (!pool.length) pool = SPECIES.filter((s) => s.tier === tier);
  const species = pool[Math.floor(Math.random() * pool.length)];
  const k = Math.pow(Math.random(), 1.8);
  const weightKg = Math.round((species.minKg + (species.maxKg - species.minKg) * k) * 10) / 10;
  return { species, weightKg, points: fishPoints(tier, weightKg) };
}
