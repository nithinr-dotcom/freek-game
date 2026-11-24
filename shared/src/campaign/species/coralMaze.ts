/**
 * Coral Maze species: one or two unconditioned species per tier (so the normal roll never falls back to another
 * region) plus two hunt species: the Arch Angelfish (near the Sunken Arch) and the Pearl Moray (night, Brine Wreck).
 */
import { registerSpecies } from "../registry.js";
import type { CampaignSpecies } from "../types.js";

const R = "coral_maze" as const;

export const CORAL_SPECIES: CampaignSpecies[] = [
  { id: "ember_clownfish", name: "Ember Clownfish", tier: "common", zones: ["shallows", "reef"], minKg: 0.1, maxKg: 0.5, model: "fish_small", tint: "#ff7a2a",
    region: R, behaviour: "darter", baitable: true, clue: "Orange with white bands. It sleeps in a garden that stings everyone else." },
  { id: "sapphire_tang", name: "Sapphire Tang", tier: "common", zones: ["shallows", "reef", "abyss"], minKg: 0.3, maxKg: 1.4, model: "fish_small", tint: "#3f6bff",
    region: R, behaviour: "steady", clue: "A blue flag of a fish that grazes the coral walls." },
  { id: "rainbow_parrotfish", name: "Rainbow Parrotfish", tier: "rare", zones: ["shallows", "reef"], minKg: 1.5, maxKg: 7, model: "fish_medium", tint: "#3fd0a0",
    region: R, behaviour: "feinter", clue: "It eats the reef and turns it into sand. Every colour at once." },
  { id: "crimson_lionfish", name: "Crimson Lionfish", tier: "rare", zones: ["reef", "abyss"], minKg: 0.5, maxKg: 2.5, model: "fish_puffer", tint: "#e0403c",
    region: R, behaviour: "thrasher", clue: "A mane of poisoned feathers in the maze's red channels." },
  { id: "maze_grouper", name: "Maze Grouper", tier: "gold", zones: ["shallows", "reef", "abyss"], minKg: 8, maxKg: 40, model: "fish_large", tint: "#c08a3a",
    region: R, behaviour: "diver", clue: "The maze's landlord: big, brown and sulking in the deepest corners." },
  { id: "lagoon_eagle_ray", name: "Spotted Eagle Ray", tier: "epic", zones: ["reef", "abyss"], minKg: 30, maxKg: 120, model: "fish_ray", tint: "#4a5a8a",
    region: R, behaviour: "diver", clue: "Starry wings fly the channels where the maze opens to the deep." },
  { id: "coral_empress", name: "Coral Empress", tier: "legendary", zones: ["reef", "abyss"], minKg: 12, maxKg: 45, model: "fish_medium", tint: "#ff5ad8",
    region: R, behaviour: "legend", clue: "The maze was grown as her palace. She rarely leaves the throne room." },
  // hunt species
  { id: "arch_angelfish", name: "Arch Angelfish", tier: "gold", zones: ["reef"], minKg: 1, maxKg: 4, model: "fish_medium", tint: "#ffd24a",
    region: R, behaviour: "feinter", conditions: { near: "sunken_arch" }, specialChance: 0.4, clue: "It swims only through the stone gate the sea swallowed." },
  { id: "pearl_moray", name: "Pearl Moray", tier: "rare", zones: ["shallows", "reef"], minKg: 2, maxKg: 9, model: "fish_sword", tint: "#e8e0c8",
    region: R, behaviour: "diver", conditions: { time: ["night"], near: "maze_wreck" }, specialChance: 0.45, clue: "Pale as a pearl, it leaves the Brine Wreck only under the moon." },
];

registerSpecies(CORAL_SPECIES);
