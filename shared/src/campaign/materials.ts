/** Materials (one per region) and boss trophies. */
import type { MaterialId, RegionId } from "./types.js";

export interface MaterialInfo { id: MaterialId; name: string; icon: string; color: string; region: RegionId; trophy?: boolean }

export const MATERIALS: Record<MaterialId, MaterialInfo> = {
  shell: { id: "shell", name: "Shell Fragments", icon: "🐚", color: "#ffd7b0", region: "shallows_bay" },
  coral: { id: "coral", name: "Coral Shards", icon: "🪸", color: "#ff7a8a", region: "coral_maze" },
  stormglass: { id: "stormglass", name: "Storm Glass", icon: "🔷", color: "#8fd0ff", region: "stormbreak" },
  icepearl: { id: "icepearl", name: "Ice Pearls", icon: "❄", color: "#cdf3ff", region: "frozen_fjord" },
  abyssink: { id: "abyssink", name: "Abyssal Ink", icon: "🫧", color: "#9a7bff", region: "abyss_trench" },
  serpent_fang: { id: "serpent_fang", name: "Serpent Fang", icon: "🦷", color: "#e8f5d0", region: "shallows_bay", trophy: true },
  titan_carapace: { id: "titan_carapace", name: "Titan Carapace", icon: "🦀", color: "#ff9a5a", region: "coral_maze", trophy: true },
  kraken_beak: { id: "kraken_beak", name: "Kraken Beak", icon: "🦑", color: "#c79cff", region: "stormbreak", trophy: true },
  leviathan_heart: { id: "leviathan_heart", name: "Leviathan Heart", icon: "💠", color: "#9ff0ff", region: "frozen_fjord", trophy: true },
  maelstrom_core: { id: "maelstrom_core", name: "Maelstrom Core", icon: "🌀", color: "#ff5ad8", region: "abyss_trench", trophy: true },
};
export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

/** chance a catch drops the region's material, by tier rank 0..4, and the amount */
export const MATERIAL_DROP = [
  { chance: 0.12, n: 1 },
  { chance: 0.25, n: 1 },
  { chance: 0.45, n: 2 },
  { chance: 0.7, n: 3 },
  { chance: 1, n: 5 },
];
