/** Gear: 7 slots × T1–T5. T1 is owned from the start; T4 and T5 need boss trophies. */
import type { GearSlot, GearTier, MaterialId } from "./types.js";

export const GEAR_SLOTS: GearSlot[] = ["rod", "reel", "line", "hull", "harpoon", "lantern", "heater"];
export const GEAR_SLOT_INFO: Record<GearSlot, { name: string; icon: string; blurb: string }> = {
  rod: { name: "Rod", icon: "🎣", blurb: "Cast distance, bite speed and rare-fish odds" },
  reel: { name: "Reel", icon: "🌀", blurb: "Progress fill rate and how fast the catch zone rises" },
  line: { name: "Line", icon: "🧵", blurb: "Fish heavier than the rating build tension faster" },
  hull: { name: "Hull", icon: "🛶", blurb: "Boat HP and how much catch you can carry" },
  harpoon: { name: "Harpoon", icon: "🔱", blurb: "Harpoon damage and cooldown" },
  lantern: { name: "Lantern", icon: "🏮", blurb: "Light radius at night and in the dark" },
  heater: { name: "Heater", icon: "🔥", blurb: "Slows the cold meter (Frozen Fjord)" },
};

type Cost = Partial<Record<MaterialId, number>>;
// P4 balance: coins scaled up (banking big fish made coins meaningless by Act 3) and one trophy per T4/T5 craft,
// spread over the slots (see slotTrophy), instead of two of the same trophies for every slot.
const costs: { coins: number; mats: Cost }[] = [
  { coins: 0, mats: {} },
  { coins: 150, mats: { shell: 6 } },
  { coins: 800, mats: { shell: 10, coral: 8 } },
  { coins: 2600, mats: { coral: 8, stormglass: 10 } },
  { coins: 6500, mats: { stormglass: 8, icepearl: 12, abyssink: 6 } },
];
/** the boss trophy each slot's T4 / T5 needs */
const slotTrophy: Record<GearSlot, [MaterialId, MaterialId]> = {
  rod: ["serpent_fang", "kraken_beak"], reel: ["titan_carapace", "leviathan_heart"], line: ["serpent_fang", "leviathan_heart"],
  hull: ["titan_carapace", "kraken_beak"], harpoon: ["kraken_beak", "maelstrom_core"], lantern: ["titan_carapace", "leviathan_heart"],
  heater: ["kraken_beak", "leviathan_heart"],
};
const slotCoinMult: Record<GearSlot, number> = { rod: 1, reel: 1, line: 0.8, hull: 1.3, harpoon: 1.1, lantern: 0.7, heater: 0.7 };
const slotMatExtra: Partial<Record<GearSlot, Cost[]>> = {
  lantern: [{}, {}, {}, {}, { abyssink: 4 }],
  heater: [{}, {}, {}, { icepearl: 4 }, {}],
};
function cost(slot: GearSlot, t: number) {
  const c = costs[t - 1];
  const mats: Cost = { ...c.mats };
  if (t >= 4) mats[slotTrophy[slot][t - 4]] = 1;
  for (const [k, v] of Object.entries(slotMatExtra[slot]?.[t - 1] ?? {})) mats[k as MaterialId] = (mats[k as MaterialId] ?? 0) + (v as number);
  return { coins: Math.round(c.coins * slotCoinMult[slot]), mats };
}

const names: Record<GearSlot, string[]> = {
  rod: ["Driftwood Rod", "Bamboo Rod", "Coral-Spine Rod", "Stormcaller Rod", "Leviathan Rod"],
  reel: ["Tin Reel", "Brass Reel", "Tidewheel", "Thunder Reel", "Abyss Winch"],
  line: ["Hemp Line", "Braided Line", "Sharkline", "Storm Cable", "Kraken Silk"],
  hull: ["Patchwork Hull", "Oak Hull", "Ironbound Hull", "Glacier Keel", "Abyssal Hull"],
  harpoon: ["Rusty Harpoon", "Barbed Harpoon", "Serrated Harpoon", "Storm Lance", "Maelstrom Spear"],
  lantern: ["Candle Lamp", "Oil Lantern", "Glowshell Lamp", "Storm Lantern", "Abyss Beacon"],
  heater: ["Hand Warmer", "Coal Stove", "Ember Box", "Frost Furnace", "Heart of Fire"],
};

export const GEAR: Record<GearSlot, GearTier[]> = {
  rod: [1, 2, 3, 4, 5].map((t, i) => ({ tier: t, name: names.rod[i], cost: cost("rod", t), stats: { castMult: [1, 1.1, 1.2, 1.32, 1.45][i], biteSpeed: [1, 0.88, 0.78, 0.68, 0.58][i], rareBonus: [0, 0.08, 0.16, 0.26, 0.4][i] } })),
  reel: [1, 2, 3, 4, 5].map((t, i) => ({ tier: t, name: names.reel[i], cost: cost("reel", t), stats: { fillMult: [1, 1.12, 1.25, 1.4, 1.6][i], liftMult: [1, 1.08, 1.16, 1.25, 1.35][i] } })),
  line: [1, 2, 3, 4, 5].map((t, i) => ({ tier: t, name: names.line[i], cost: cost("line", t), stats: { ratingKg: [20, 60, 150, 400, 1500][i] } })),
  hull: [1, 2, 3, 4, 5].map((t, i) => ({ tier: t, name: names.hull[i], cost: cost("hull", t), stats: { hp: [100, 125, 150, 180, 220][i], capacityKg: [60, 120, 250, 500, 1200][i] } })),
  harpoon: [1, 2, 3, 4, 5].map((t, i) => ({ tier: t, name: names.harpoon[i], cost: cost("harpoon", t), stats: { damage: [25, 35, 45, 60, 80][i], cooldownMs: [1200, 1100, 1000, 900, 800][i] } })),
  lantern: [1, 2, 3, 4, 5].map((t, i) => ({ tier: t, name: names.lantern[i], cost: cost("lantern", t), stats: { lightRadius: [18, 26, 36, 50, 70][i] } })),
  heater: [1, 2, 3, 4, 5].map((t, i) => ({ tier: t, name: names.heater[i], cost: cost("heater", t), stats: { warmthDrain: [1, 0.8, 0.62, 0.48, 0.35][i] } })),
};

export const STAT_LABELS: Record<string, { label: string; fmt: (v: number) => string }> = {
  castMult: { label: "Cast distance", fmt: (v) => `×${v.toFixed(2)}` },
  biteSpeed: { label: "Bite wait", fmt: (v) => `×${v.toFixed(2)}` },
  rareBonus: { label: "Rare odds", fmt: (v) => `+${Math.round(v * 100)}%` },
  fillMult: { label: "Reel speed", fmt: (v) => `×${v.toFixed(2)}` },
  liftMult: { label: "Zone lift", fmt: (v) => `×${v.toFixed(2)}` },
  ratingKg: { label: "Line rating", fmt: (v) => `${v} kg` },
  hp: { label: "Hull HP", fmt: (v) => `${v}` },
  capacityKg: { label: "Hold", fmt: (v) => `${v} kg` },
  damage: { label: "Damage", fmt: (v) => `${v}` },
  cooldownMs: { label: "Cooldown", fmt: (v) => `${(v / 1000).toFixed(1)} s` },
  lightRadius: { label: "Light radius", fmt: (v) => `${v} m` },
  warmthDrain: { label: "Cold drain", fmt: (v) => `×${v.toFixed(2)}` },
};
