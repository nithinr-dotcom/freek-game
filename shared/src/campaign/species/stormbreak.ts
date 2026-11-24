/**
 * Stormbreak Strait species. Hunt species: the Stormscale Tuna (only bites during a wind gust) and the Static Eel
 * (storms). The Thunder Marlin (thrasher, 121–190 kg) is a normal Abyss epic, but the client gates it behind line T3
 * (client/src/solo/lineGates.ts).
 */
import { registerSpecies } from "../registry.js";
import type { CampaignSpecies } from "../types.js";

const R = "stormbreak" as const;

export const STORM_SPECIES: CampaignSpecies[] = [
  { id: "thunder_sprat", name: "Thunder Sprat", tier: "common", zones: ["shallows", "reef", "abyss"], minKg: 0.1, maxKg: 0.4, model: "fish_small", tint: "#c8d4e0",
    region: R, behaviour: "darter", baitable: true, clue: "Tiny, silver and twitchy, as if every cloud were about to bite it." },
  { id: "gale_mackerel", name: "Gale Mackerel", tier: "common", zones: ["shallows", "reef", "abyss"], minKg: 0.6, maxKg: 2.4, model: "fish_medium", tint: "#6f8fa8",
    region: R, behaviour: "steady", clue: "Grey-striped and steady, like the wind that never stops here." },
  { id: "squall_snapper", name: "Squall Snapper", tier: "rare", zones: ["shallows", "reef", "abyss"], minKg: 2, maxKg: 10, model: "fish_medium", tint: "#c94a4a",
    region: R, behaviour: "feinter", clue: "Red as a storm warning. It plays dead, then runs like a squall." },
  { id: "cloudfin_mahi", name: "Cloudfin Mahi", tier: "gold", zones: ["reef", "abyss"], minKg: 6, maxKg: 25, model: "fish_medium", tint: "#4fd0a0",
    region: R, behaviour: "darter", clue: "A green-gold flash that chases the shadows of clouds." },
  { id: "tempest_shark", name: "Tempest Shark", tier: "epic", zones: ["reef", "abyss"], minKg: 90, maxKg: 300, model: "fish_shark", tint: "#4a5a6a",
    region: R, behaviour: "thrasher", clue: "It hunts under the biggest waves, where boats fall into the troughs." },
  { id: "thunder_marlin", name: "Thunder Marlin", tier: "epic", zones: ["abyss"], minKg: 121, maxKg: 190, model: "fish_sword", tint: "#3fa9ff",
    region: R, behaviour: "thrasher", clue: "Blue lightning with a sword for a nose. Weak lines don't survive it." },
  { id: "skyfall_ray", name: "Skyfall Ray", tier: "legendary", zones: ["abyss"], minKg: 150, maxKg: 600, model: "fish_ray", tint: "#ffd24a",
    region: R, behaviour: "legend", clue: "Fishermen say a piece of the sky fell into the Strait and learned to swim." },
  // hunt species
  { id: "stormscale_tuna", name: "Stormscale Tuna", tier: "gold", zones: ["reef", "abyss"], minKg: 40, maxKg: 110, model: "fish_large", tint: "#7f9cd0",
    region: R, behaviour: "diver", conditions: { weather: ["gust"] }, specialChance: 0.65, clue: "It rides the wind itself. Strike only when the gust howls." },
  { id: "static_eel", name: "Static Eel", tier: "rare", zones: ["reef", "abyss"], minKg: 3, maxKg: 12, model: "fish_sword", tint: "#ffe14d",
    region: R, behaviour: "thrasher", conditions: { weather: ["storm"] }, specialChance: 0.3, clue: "It crackles when the thunder rolls, and hides when the sky clears." },
];

registerSpecies(STORM_SPECIES);
