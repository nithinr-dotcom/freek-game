/** Boss data. Behaviour classes live in client/src/solo/bosses (same id). */
import { registerBoss } from "./registry.js";

registerBoss({
  id: "reef_serpent",
  name: "Reef Serpent",
  epithet: "The Coil of the Shallows",
  region: "shallows_bay",
  monsterKind: "serpent",
  hp: 800,
  phases: [{ atPct: 1, name: "Circling" }, { atPct: 0.5, name: "Frenzy" }],
  trophy: "serpent_fang",
  title: "serpent_slayer",
  cosmetic: "flag_fang",
  xp: 900,
  intro: ["It's here. Watch for the red line, sailor: when it lunges, steer out of the way!"],
});
