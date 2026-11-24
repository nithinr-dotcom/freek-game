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
// P3: Acts 4–5 (Frozen Fjord, Abyss Trench) + finale rewards
import "./regions/frozenFjord.js";
import "./regions/abyssTrench.js";
import "./species/frozenFjord.js";
import "./species/abyssTrench.js";
import "./bosses/p3.js";
import "./rewardsP3.js";
import "./act4.js";
import "./act5.js";
// P4: modes, Bounty Board, the rest of the achievements
export * from "./modes.js";
export * from "./bounties.js";
export { LEGENDARY_SPECIES, achievementGroup } from "./rewardsP4.js";
import "./rewardsP4.js";
