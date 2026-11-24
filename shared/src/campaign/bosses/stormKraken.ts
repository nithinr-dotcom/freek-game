/** Act 3 boss: the Storm Kraken (behaviour: client/src/solo/bosses/stormKraken.ts) + Act 3 titles, cosmetics, achievements. */
import { registerBoss } from "../registry.js";
import { addAchievements, addCosmetics, addTitles } from "../extend.js";

registerBoss({
  id: "storm_kraken",
  name: "Storm Kraken",
  epithet: "Lord of the Strait",
  region: "stormbreak",
  monsterKind: "kraken",
  // the head; the four tentacles have their own HP (StormKraken.TENTACLE_HP)
  hp: 900,
  phases: [{ atPct: 1, name: "Tentacles" }, { atPct: 0.5, name: "Ink Storm" }],
  trophy: "kraken_beak",
  title: "kraken_tamer",
  cosmetic: "sail_storm",
  xp: 1800,
  intro: ["Four tentacles guard its head. Cut them down, dodge the lightning, and harpoon the head when it rises!"],
});

addTitles([
  { id: "kraken_tamer", name: "Kraken Tamer" },
  { id: "storm_chaser", name: "Storm Chaser" },
  { id: "line_breaker", name: "Line Breaker" },
]);
addCosmetics([
  { id: "sail_storm", kind: "sail", name: "Storm Sail", color: "#3b4652", color2: "#ffe14d", pattern: "stripe" },
  { id: "paint_slate", kind: "paint", name: "Slate Gale", color: "#5b6672", color2: "#8fd0ff" },
  { id: "flag_bolt", kind: "flag", name: "Thunderbolt Flag", color: "#1d2a3a", color2: "#ffe14d", pattern: "star" },
]);
addAchievements([
  { id: "kraken_down", name: "Calm After the Storm", desc: "Defeat the Storm Kraken", icon: "🦑", cond: { stat: "boss_storm_kraken", gte: 1 }, reward: { title: "kraken_tamer" }, act: 3 },
  { id: "act3_done", name: "Strait Survivor", desc: "Finish Act 3", icon: "⛈", cond: { stat: "actDone_3", gte: 1 }, reward: { cosmetic: "flag_bolt" }, act: 3 },
  { id: "act3_s", name: "Eye of the Storm", desc: "Get an S grade on every Act 3 chapter", icon: "🏅", cond: { stat: "actS_3", gte: 6 }, act: 3 },
  { id: "codex_storm", name: "Storm Naturalist", desc: "Complete the Stormbreak Strait codex", icon: "📖", cond: { stat: "codex_stormbreak", gte: 100 }, reward: { title: "storm_chaser", cosmetic: "paint_slate" }, act: 3 },
  { id: "thunder_marlin", name: "Line Breaker", desc: "Land a Thunder Marlin", icon: "🗡", cond: { stat: "species_thunder_marlin", gte: 1 }, reward: { title: "line_breaker" }, act: 3 },
]);
