/** Campaign fish roll: region species, conditions (time/weather/landmark/bait), rod bonus, chapter boosts. */
import {
  TIERS, TIER_INFO, ZONE_TIER_BONUS, SPECIES_BY_ID, tierRank, fishPoints, speciesOfRegion, getCampaignSpecies, getRegion,
  type CampaignSpecies, type RegionId, type Tier, type TimeOfDay, type WeatherTag, type ZoneId, type Species, type ChapterSetup,
} from "@freek/shared";

export interface RollCtx {
  region: RegionId;
  zone: ZoneId;
  storm: boolean;
  time: TimeOfDay;
  weather: Set<WeatherTag>;
  x: number; z: number;
  bait: string | null;
  rareBonus: number;
  level: number;
  setup?: ChapterSetup;
  forceMinTier?: Tier;
  rng?: () => number;
}
export interface CampaignRoll { species: CampaignSpecies; weightKg: number; points: number; usedBait: boolean; special: boolean }

/** species lookup for UI (multiplayer species first, then campaign-only ones) */
export function speciesInfo(id: string): Species | undefined { return getCampaignSpecies(id) ?? SPECIES_BY_ID[id]; }

export function nearLandmark(region: RegionId, id: string, x: number, z: number): boolean {
  const lm = getRegion(region)?.landmarks.find((l) => l.id === id);
  return !!lm && Math.hypot(lm.x - x, lm.z - z) <= lm.radius;
}

/** which of a species' conditions fail right now (empty = it can bite) */
export function failedConditions(s: CampaignSpecies, c: Pick<RollCtx, "region" | "zone" | "time" | "weather" | "x" | "z" | "bait">): string[] {
  const out: string[] = [];
  if (!s.zones.includes(c.zone)) out.push("zone");
  const k = s.conditions;
  if (!k) return out;
  if (k.time && !k.time.includes(c.time)) out.push("time");
  if (k.weather && !k.weather.some((w) => c.weather.has(w))) out.push("weather");
  if (k.near && !nearLandmark(c.region, k.near, c.x, c.z)) out.push("near");
  if (k.bait && c.bait !== k.bait) out.push("bait");
  return out;
}
const hasConditions = (s: CampaignSpecies) => !!s.conditions && Object.keys(s.conditions).length > 0;

export function campaignRoll(c: RollCtx): CampaignRoll {
  const rng = c.rng ?? Math.random;
  const minRank = c.forceMinTier ? tierRank(c.forceMinTier) : 0;
  const all = speciesOfRegion(c.region);
  // 1) hunt species whose conditions all hold get a chance to take the bite
  const specials = all.filter((s) => hasConditions(s) && s.specialChance && tierRank(s.tier) >= minRank && failedConditions(s, c).length === 0);
  for (const s of specials.sort(() => rng() - 0.5)) {
    if (rng() < (s.specialChance ?? 0)) return finish(s, c, rng, !!s.conditions?.bait, true);
  }
  // 2) normal roll over unconditioned species
  const entries = TIERS.filter((t) => tierRank(t) >= minRank).map((t) => {
    let w = TIER_INFO[t].weight * (ZONE_TIER_BONUS[c.zone][t] ?? 1);
    if (t !== "common") w *= 1 + c.rareBonus + 0.02 * (c.level - 1);
    if (c.storm && t !== "common") w *= 1.5;
    return [t, w] as const;
  });
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  let tier: Tier = entries[entries.length - 1][0];
  for (const [t, w] of entries) { r -= w; if (r <= 0) { tier = t; break; } }
  const plain = all.filter((s) => !hasConditions(s));
  let pool = plain.filter((s) => s.tier === tier && s.zones.includes(c.zone));
  if (!pool.length) pool = plain.filter((s) => s.tier === tier);
  if (!pool.length) pool = plain;
  const boost = c.setup?.speciesBoost ?? {};
  const wsum = pool.reduce((a, s) => a + (boost[s.id] ?? 1), 0);
  let pick = rng() * wsum;
  let species = pool[pool.length - 1];
  for (const s of pool) { pick -= boost[s.id] ?? 1; if (pick <= 0) { species = s; break; } }
  // a boosted species can also pull a bite out of a higher tier (e.g. perch hunts)
  for (const [id, b] of Object.entries(boost)) {
    const s = getCampaignSpecies(id);
    if (s && s.id !== species.id && s.zones.includes(c.zone) && !hasConditions(s) && rng() < Math.min(0.5, (b - 1) * 0.12)) { species = s; break; }
  }
  return finish(species, c, rng, false, false);
}

function finish(s: CampaignSpecies, c: RollCtx, rng: () => number, usedBait: boolean, special: boolean): CampaignRoll {
  let kg = s.minKg + (s.maxKg - s.minKg) * Math.pow(rng(), 1.8);
  const tw = c.setup?.targetWeight;
  if (tw && tw.speciesId === s.id && rng() < tw.chance) kg = tw.minKg + rng() * (tw.maxKg - tw.minKg);
  let weightKg = Math.round(kg * 10) / 10;
  if (tw && tw.speciesId === s.id) weightKg = Math.round(kg * 100) / 100;
  return { species: s, weightKg, points: fishPoints(s.tier, weightKg), usedBait, special };
}
