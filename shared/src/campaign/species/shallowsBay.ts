/** Shallows Bay species: the original 16 (with campaign behaviours) plus the bay's hunt species. */
import { SPECIES } from "../../fish.js";
import { registerSpecies } from "../registry.js";
import type { Behaviour, CampaignSpecies } from "../types.js";

const base: Record<string, { behaviour: Behaviour; clue: string; baitable?: boolean; conditions?: CampaignSpecies["conditions"]; specialChance?: number }> = {
  sardine: { behaviour: "darter", clue: "Small, silver and everywhere. Bigger fish think it's delicious.", baitable: true },
  perch: { behaviour: "steady", clue: "A calm green fish of the bay. Weighs about as much as a loaf of bread." },
  mackerel: { behaviour: "steady", clue: "Striped like a sailor's shirt. Swims in every water." },
  cod: { behaviour: "diver", clue: "Hugs the rocks past the shallows and pulls for the bottom." },
  snapper: { behaviour: "feinter", clue: "Red as a sunset. Pretends to tire, then bolts." },
  pufferfish: { behaviour: "thrasher", clue: "Spiky and furious around the reef islands." },
  tuna: { behaviour: "diver", clue: "A blue torpedo in deep water. It turns up its nose at a bare hook.", conditions: { bait: "sardine" }, specialChance: 0.6 },
  goldkoi: { behaviour: "darter", clue: "A flash of gold in the shallows and the reef." },
  swordfish: { behaviour: "thrasher", clue: "A blade of a fish, out where the water darkens." },
  manta: { behaviour: "diver", clue: "Gilded wings glide only in the Abyss." },
  ghostmarlin: { behaviour: "feinter", clue: "Pale and quiet past the reef. You'll think it gave up. It didn't." },
  voidshark: { behaviour: "thrasher", clue: "The Abyss has teeth." },
  anglerqueen: { behaviour: "diver", clue: "A little light in the black water, and a big mouth behind it." },
  leviathanfry: { behaviour: "legend", clue: "Something very young and very large stirs in the Abyss." },
  sunwhale: { behaviour: "legend", clue: "Sailors swear the sun once dived into the Abyss and never came up." },
  crownkoi: { behaviour: "legend", clue: "A crowned rainbow in calm water. A legend of the bay." },
};

const existing: CampaignSpecies[] = SPECIES.map((s) => ({ ...s, region: "shallows_bay", ...base[s.id] } as CampaignSpecies));

const added: CampaignSpecies[] = [
  {
    id: "moonlit_eel", name: "Moonlit Eel", tier: "gold", zones: ["shallows"], minKg: 2, maxKg: 6.5, model: "fish_sword", tint: "#6f7dff",
    region: "shallows_bay", behaviour: "feinter", conditions: { time: ["night"], near: "old_wreck" }, specialChance: 0.5,
    clue: "It glows where the old ship sleeps, but only when the moon is up.",
  },
  {
    id: "dusk_flyer", name: "Dusk Flyingfish", tier: "rare", zones: ["shallows", "reef"], minKg: 0.4, maxKg: 1.8, model: "fish_small", tint: "#ff9a5a",
    region: "shallows_bay", behaviour: "darter", conditions: { time: ["dusk"] }, specialChance: 0.3,
    clue: "Leaps when the sky turns orange.",
  },
  {
    id: "storm_herring", name: "Storm Herring", tier: "common", zones: ["shallows", "reef", "abyss"], minKg: 0.2, maxKg: 0.9, model: "fish_small", tint: "#9aa7c7",
    region: "shallows_bay", behaviour: "darter", conditions: { weather: ["storm", "rain"] }, specialChance: 0.35, baitable: true,
    clue: "Shoals up when thunder rolls.",
  },
  {
    id: "wreck_grouper", name: "Wreck Grouper", tier: "rare", zones: ["shallows"], minKg: 4, maxKg: 18, model: "fish_large", tint: "#7a6a4a",
    region: "shallows_bay", behaviour: "diver", conditions: { near: "old_wreck" }, specialChance: 0.25,
    clue: "Lives in a house with no roof and a broken mast.",
  },
];

registerSpecies([...existing, ...added]);
