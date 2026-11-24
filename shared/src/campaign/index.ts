/** Campaign v2 entry point: types, registries and data. Data files register themselves on import. */
export * from "./types.js";
export * from "./registry.js";
export * from "./materials.js";
export * from "./gear.js";
export * from "./skills.js";
export * from "./cosmetics.js";
export * from "./achievements.js";
export * from "./grade.js";
export { BOSS_NAMES } from "./regions/stubs.js";

// ---- data registration (add one import per new region / species set / boss file / act)
import "./regions/stubs.js";
import "./regions/shallowsBay.js";
import "./species/shallowsBay.js";
import "./bosses.js";
import "./act1.js";
// P2: Acts 2–3
export { addCosmetics, addTitles, addAchievements } from "./extend.js";
import "./regions/coralMaze.js";
import "./species/coralMaze.js";
import "./bosses/crabTitan.js";
import "./act2.js";
import "./regions/stormbreak.js";
import "./species/stormbreak.js";
import "./bosses/stormKraken.js";
import "./act3.js";
