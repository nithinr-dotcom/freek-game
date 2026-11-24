/** P3 boss data: Ice Leviathan (Act 4) and Maelstrom Eye (Act 5). Behaviours: client/src/solo/bosses/iceLeviathan.ts, maelstromEye.ts. */
import { registerBoss } from "../registry.js";

registerBoss({
  id: "ice_leviathan",
  name: "Ice Leviathan",
  epithet: "The Heart Beneath the Ice",
  region: "frozen_fjord",
  monsterKind: "serpent",
  hp: 1500, // P4 balance (was 1000)
  phases: [{ atPct: 1, name: "Under the Ice" }, { atPct: 0.5, name: "Floe Breaker" }],
  trophy: "leviathan_heart",
  title: "leviathan_breaker",
  cosmetic: "sail_aurora",
  xp: 1600,
  intro: ["The ice is moving. Crack the plates with your harpoon and hit it when it shows itself!"],
});

registerBoss({
  id: "maelstrom_eye",
  name: "Maelstrom Eye",
  epithet: "The Hunger at the Bottom of the World",
  region: "abyss_trench",
  monsterKind: "kraken",
  hp: 2600, // P4 balance (was 1800)
  phases: [{ atPct: 1, name: "The Whirlpool" }, { atPct: 0.6, name: "Abyssal Tide" }, { atPct: 0.25, name: "The Eye Duel" }],
  trophy: "maelstrom_core",
  title: "tidebreaker",
  cosmetic: "paint_maelstrom",
  xp: 2500,
  intro: ["Sail against the pull! When the Eye opens, harpoon it!"],
});
