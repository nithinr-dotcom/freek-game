/** Frozen Fjord species (P3): 8 species across all tiers; hunts: Glacier Char (dusk + the Ice Cracks), Aurora Koi (night + aurora). */
import { registerSpecies } from "../registry.js";
import type { CampaignSpecies } from "../types.js";

const R = "frozen_fjord" as const;

registerSpecies([
  {
    id: "frost_smelt", name: "Frost Smelt", tier: "common", zones: ["shallows", "reef"], minKg: 0.1, maxKg: 0.5, model: "fish_small", tint: "#d6eef6",
    region: R, behaviour: "darter", baitable: true,
    clue: "A sliver of ice that swims. Every fish in the fjord would like a bite.",
  },
  {
    id: "snow_cod", name: "Snow Cod", tier: "common", zones: ["shallows", "reef", "abyss"], minKg: 1, maxKg: 7, model: "fish_medium", tint: "#a9b8c6",
    region: R, behaviour: "diver",
    clue: "Grey as a winter sky and stubborn as a mule. Pulls for the bottom.",
  },
  {
    id: "icefin_salmon", name: "Icefin Salmon", tier: "rare", zones: ["shallows", "reef"], minKg: 3, maxKg: 14, model: "fish_medium", tint: "#ff9a7a",
    region: R, behaviour: "darter",
    clue: "Pink flesh, frosted fins, and a habit of sprinting.",
  },
  {
    id: "glacier_char", name: "Glacier Char", tier: "gold", zones: ["shallows", "reef"], minKg: 4, maxKg: 11, model: "fish_medium", tint: "#e8624e",
    region: R, behaviour: "feinter", conditions: { time: ["dusk"], near: "ice_cracks" }, specialChance: 0.55,
    clue: "Its belly burns like the sunset on the ice. Look where the ice is broken, when the sky turns orange.",
  },
  {
    id: "tusk_pike", name: "Tusked Pike", tier: "gold", zones: ["reef", "abyss"], minKg: 8, maxKg: 32, model: "fish_sword", tint: "#e3ebf2",
    region: R, behaviour: "thrasher",
    clue: "A pike with a narwhal's horn. It does not like being pulled.",
  },
  {
    id: "berg_halibut", name: "Berg Halibut", tier: "epic", zones: ["reef", "abyss"], minKg: 40, maxKg: 140, model: "fish_ray", tint: "#9fb4c4",
    region: R, behaviour: "diver",
    clue: "Flat as an ice floe and almost as big. Lies under the bergs past the buoys.",
  },
  {
    id: "aurora_koi", name: "Aurora Koi", tier: "epic", zones: ["shallows", "reef", "abyss"], minKg: 4, maxKg: 16, model: "fish_medium", tint: "#5affc8",
    region: R, behaviour: "darter", conditions: { time: ["night"], weather: ["aurora"] }, specialChance: 0.45,
    clue: "It only rises to see the sky dance. A dark night is not enough.",
  },
  {
    id: "frostcrown", name: "Frostcrown Sturgeon", tier: "legendary", zones: ["abyss"], minKg: 200, maxKg: 700, model: "fish_shark", tint: "#e8fbff",
    region: R, behaviour: "legend",
    clue: "An ancient fish wearing a crown of ice, older than the glacier itself. The far, deep water keeps it.",
  },
] satisfies CampaignSpecies[]);
