/** Act 2 boss: the Crab Titan (behaviour: client/src/solo/bosses/crabTitan.ts) + Act 2 titles, cosmetics, achievements. */
import { registerBoss } from "../registry.js";
import { addAchievements, addCosmetics, addTitles } from "../extend.js";

registerBoss({
  id: "crab_titan",
  name: "Crab Titan",
  epithet: "The Living Reef",
  region: "coral_maze",
  monsterKind: "kraken",
  hp: 1000,
  phases: [{ atPct: 1, name: "Shell Guard" }, { atPct: 0.5, name: "Swarm" }],
  trophy: "titan_carapace",
  title: "titan_breaker",
  cosmetic: "paint_carapace",
  xp: 1300,
  intro: ["Its shell turns harpoons. Wait for the claws to slam, then strike the glowing heart while the shell is open!"],
});

addTitles([
  { id: "titan_breaker", name: "Titan Breaker" },
  { id: "reef_warden", name: "Warden of the Reef" },
  { id: "pearl_diver", name: "Pearl Diver" },
]);
addCosmetics([
  { id: "paint_carapace", kind: "paint", name: "Titan Carapace", color: "#e0582e", color2: "#ffd0a0" },
  { id: "paint_lagoon", kind: "paint", name: "Lagoon Turquoise", color: "#2fe0d0", color2: "#ff7a8a" },
  { id: "sail_coral", kind: "sail", name: "Coral Sail", color: "#ff7a8a", color2: "#fff0e0", pattern: "wave" },
  { id: "flag_pearl", kind: "flag", name: "Pearl Pennant", color: "#f4f0ff", color2: "#3fd0c9", pattern: "star" },
]);
addAchievements([
  { id: "titan_down", name: "Shell Shocked", desc: "Defeat the Crab Titan", icon: "🦀", cond: { stat: "boss_crab_titan", gte: 1 }, reward: { title: "titan_breaker" }, act: 2 },
  { id: "act2_done", name: "Maze Runner", desc: "Finish Act 2", icon: "🪸", cond: { stat: "actDone_2", gte: 1 }, reward: { cosmetic: "sail_coral" }, act: 2 },
  { id: "act2_s", name: "Maze Virtuoso", desc: "Get an S grade on every Act 2 chapter", icon: "🏅", cond: { stat: "actS_2", gte: 6 }, reward: { cosmetic: "flag_pearl" }, act: 2 },
  { id: "codex_coral", name: "Reef Naturalist", desc: "Complete the Coral Maze codex", icon: "📖", cond: { stat: "codex_coral_maze", gte: 100 }, reward: { title: "reef_warden", cosmetic: "paint_lagoon" }, act: 2 },
  { id: "pearl_moray", name: "Pearl Diver", desc: "Catch the Pearl Moray", icon: "🦪", cond: { stat: "species_pearl_moray", gte: 1 }, reward: { title: "pearl_diver" }, act: 2 },
]);
