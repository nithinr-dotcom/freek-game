import type { ZoneId } from "./constants.js";

export type Tier = "common" | "rare" | "gold" | "epic" | "legendary";
export const TIERS: Tier[] = ["common", "rare", "gold", "epic", "legendary"];
export const TIER_INFO: Record<Tier, { label: string; color: string; weight: number; mult: number; difficulty: number }> = {
  common:    { label: "Common",    color: "#b0b8c0", weight: 60, mult: 1,  difficulty: 0.25 },
  rare:      { label: "Rare",      color: "#3fa9ff", weight: 25, mult: 2,  difficulty: 0.45 },
  gold:      { label: "Gold",      color: "#ffc93c", weight: 10, mult: 4,  difficulty: 0.6 },
  epic:      { label: "Epic",      color: "#b05cff", weight: 4,  mult: 8,  difficulty: 0.78 },
  legendary: { label: "Legendary", color: "#ff5a1f", weight: 1,  mult: 20, difficulty: 0.95 },
};
export function tierRank(t: Tier): number { return TIERS.indexOf(t); }

export interface Species {
  id: string; name: string; tier: Tier; zones: ZoneId[];
  minKg: number; maxKg: number;
  model: string;   // key in client/public/models/manifest.json "fish" group, falls back to "fish_generic"
  tint: string;    // body tint used if model is generic
}

export const SPECIES: Species[] = [
  // common
  { id: "sardine", name: "Silver Sardine", tier: "common", zones: ["shallows", "reef"], minKg: 0.1, maxKg: 0.4, model: "fish_small", tint: "#c9d6df" },
  { id: "perch", name: "Bay Perch", tier: "common", zones: ["shallows"], minKg: 0.3, maxKg: 1.5, model: "fish_small", tint: "#9bbf6a" },
  { id: "mackerel", name: "Striped Mackerel", tier: "common", zones: ["shallows", "reef", "abyss"], minKg: 0.5, maxKg: 2, model: "fish_medium", tint: "#5b8fb0" },
  { id: "cod", name: "Rock Cod", tier: "common", zones: ["reef", "abyss"], minKg: 1, maxKg: 6, model: "fish_medium", tint: "#8a7a5c" },
  // rare
  { id: "snapper", name: "Crimson Snapper", tier: "rare", zones: ["shallows", "reef"], minKg: 2, maxKg: 9, model: "fish_medium", tint: "#e0503c" },
  { id: "pufferfish", name: "Spiky Puffer", tier: "rare", zones: ["reef"], minKg: 0.5, maxKg: 3, model: "fish_puffer", tint: "#f2c14e" },
  { id: "tuna", name: "Bluefin Tuna", tier: "rare", zones: ["reef", "abyss"], minKg: 20, maxKg: 90, model: "fish_large", tint: "#2b4c7e" },
  // gold
  { id: "goldkoi", name: "Golden Koi", tier: "gold", zones: ["shallows", "reef"], minKg: 3, maxKg: 12, model: "fish_medium", tint: "#ffcf40" },
  { id: "swordfish", name: "Sunblade Swordfish", tier: "gold", zones: ["reef", "abyss"], minKg: 40, maxKg: 160, model: "fish_sword", tint: "#d9a520" },
  { id: "manta", name: "Gilded Manta", tier: "gold", zones: ["abyss"], minKg: 80, maxKg: 300, model: "fish_ray", tint: "#e8b341" },
  // epic
  { id: "ghostmarlin", name: "Ghost Marlin", tier: "epic", zones: ["reef", "abyss"], minKg: 60, maxKg: 220, model: "fish_sword", tint: "#c7b8ff" },
  { id: "voidshark", name: "Void Shark", tier: "epic", zones: ["abyss"], minKg: 150, maxKg: 600, model: "fish_shark", tint: "#5a2d8c" },
  { id: "anglerqueen", name: "Lantern Angler Queen", tier: "epic", zones: ["abyss"], minKg: 10, maxKg: 45, model: "fish_angler", tint: "#7a3cff" },
  // legendary
  { id: "leviathanfry", name: "Leviathan Hatchling", tier: "legendary", zones: ["abyss"], minKg: 300, maxKg: 1200, model: "fish_large", tint: "#ff3d00" },
  { id: "sunwhale", name: "Solar Whale", tier: "legendary", zones: ["abyss"], minKg: 800, maxKg: 3000, model: "fish_whale", tint: "#ff9d00" },
  { id: "crownkoi", name: "Crowned Rainbow Koi", tier: "legendary", zones: ["shallows", "reef"], minKg: 8, maxKg: 30, model: "fish_medium", tint: "#ff4fd8" },
];
export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export const ZONE_TIER_BONUS: Record<ZoneId, Partial<Record<Tier, number>>> = {
  shallows: { common: 1.3, epic: 0.4, legendary: 0.3 },
  reef: { rare: 1.4, gold: 1.3 },
  abyss: { common: 0.5, gold: 1.5, epic: 2.5, legendary: 3 },
};

export interface RollOpts { zone: ZoneId; rodLevel: number; storm: boolean; forceMinTier?: Tier; rng?: () => number }

export function rollTier(o: RollOpts): Tier {
  const rng = o.rng ?? Math.random;
  const minRank = o.forceMinTier ? tierRank(o.forceMinTier) : 0;
  const entries = TIERS.filter((t) => tierRank(t) >= minRank).map((t) => {
    let w = TIER_INFO[t].weight * (ZONE_TIER_BONUS[o.zone][t] ?? 1);
    if (t !== "common") w *= 1 + 0.08 * (o.rodLevel - 1);
    if (o.storm && t !== "common") w *= 1.5;
    return [t, w] as const;
  });
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [t, w] of entries) { r -= w; if (r <= 0) return t; }
  return entries[entries.length - 1][0];
}

export function rollFish(o: RollOpts): { species: Species; weightKg: number; points: number } {
  const rng = o.rng ?? Math.random;
  const tier = rollTier(o);
  let pool = SPECIES.filter((s) => s.tier === tier && s.zones.includes(o.zone));
  if (!pool.length) pool = SPECIES.filter((s) => s.tier === tier);
  const species = pool[Math.floor(rng() * pool.length)];
  // skew toward smaller sizes, rare monsters
  const t = Math.pow(rng(), 1.8);
  const weightKg = Math.round((species.minKg + (species.maxKg - species.minKg) * t) * 10) / 10;
  return { species, weightKg, points: fishPoints(tier, weightKg) };
}
export function fishPoints(tier: Tier, weightKg: number): number {
  return Math.max(1, Math.round(Math.sqrt(weightKg) * 10 * TIER_INFO[tier].mult));
}
