/**
 * Abyss Trench species (P3): 8 species across all tiers. Food chain: Lanternfish (baitable) -> Void Eel (bait: lanternfish,
 * baitable) -> Abyssal Shark (bait: void_eel). Lanternfish also refill the lantern when landed (client/src/solo/hazards/lantern.ts).
 */
import { registerSpecies } from "../registry.js";
import type { CampaignSpecies } from "../types.js";

const R = "abyss_trench" as const;

/** every Abyss Trench species id (chapter 26 "catch 4 Abyss fish") */
export const ABYSS_SPECIES_IDS = ["lanternfish", "hatchetfish", "gloom_angler", "void_eel", "bone_ray", "pale_gulper", "abyssal_shark", "drowned_star"];

registerSpecies([
  {
    id: "lanternfish", name: "Lanternfish", tier: "common", zones: ["shallows", "reef", "abyss"], minKg: 0.2, maxKg: 0.8, model: "fish_small", tint: "#7fe8ff",
    region: R, behaviour: "darter", baitable: true,
    clue: "A little fish carrying its own light. Land one and your lamp burns brighter.",
  },
  {
    id: "hatchetfish", name: "Silver Hatchetfish", tier: "common", zones: ["shallows", "reef", "abyss"], minKg: 0.3, maxKg: 1.4, model: "fish_small", tint: "#b8c0d8",
    region: R, behaviour: "steady",
    clue: "Thin as a blade, shiny as a coin, and never far from the dock's light.",
  },
  {
    id: "gloom_angler", name: "Gloom Angler", tier: "rare", zones: ["reef", "abyss"], minKg: 3, maxKg: 15, model: "fish_angler", tint: "#5b3cff",
    region: R, behaviour: "diver",
    clue: "Follow a small light in the dark and you'll find a big mouth.",
  },
  {
    id: "void_eel", name: "Void Eel", tier: "gold", zones: ["shallows", "reef", "abyss"], minKg: 4, maxKg: 20, model: "fish_sword", tint: "#3a1d6e",
    region: R, behaviour: "feinter", conditions: { bait: "lanternfish" }, specialChance: 0.6, baitable: true,
    clue: "It hunts by light. Offer it something that glows.",
  },
  {
    id: "bone_ray", name: "Bone Ray", tier: "gold", zones: ["reef", "abyss"], minKg: 30, maxKg: 110, model: "fish_ray", tint: "#d8d0c0",
    region: R, behaviour: "diver",
    clue: "A ray so pale you can see its skeleton. Glides past the buoys.",
  },
  {
    id: "pale_gulper", name: "Pale Gulper", tier: "epic", zones: ["reef", "abyss"], minKg: 40, maxKg: 150, model: "fish_large", tint: "#9a8cff",
    region: R, behaviour: "thrasher",
    clue: "Mostly mouth. Thrashes like it wants to swallow the boat.",
  },
  {
    id: "abyssal_shark", name: "Abyssal Shark", tier: "epic", zones: ["reef", "abyss"], minKg: 90, maxKg: 260, model: "fish_shark", tint: "#24124a",
    region: R, behaviour: "diver", conditions: { bait: "void_eel" }, specialChance: 0.6,
    clue: "The top of the trench's food chain. It only eats what eats the light.",
  },
  {
    id: "drowned_star", name: "The Drowned Star", tier: "legendary", zones: ["abyss"], minKg: 300, maxKg: 1500, model: "fish_whale", tint: "#ff5ad8",
    region: R, behaviour: "legend",
    clue: "Sailors say a star fell into the trench and learned to swim. It still glows, far out in the deepest black.",
  },
] satisfies CampaignSpecies[]);
