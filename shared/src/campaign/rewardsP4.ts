/**
 * P4 rewards: the rest of the achievements list (§9), the titles and cosmetics they grant, and the Codex
 * region-completion rewards that were still missing. Appended at import time like rewardsP3.ts.
 */
import { addAchievements, addCosmetics, addTitles } from "./extend.js";
import { ACHIEVEMENTS_BY_ID } from "./achievements.js";
import { campaignSpeciesList } from "./registry.js";
import type { Achievement } from "./types.js";

addCosmetics([
  { id: "paint_abyss", kind: "paint", name: "Abyssal Ink", color: "#141a3a", color2: "#9a7bff" },
  { id: "flag_bounty", kind: "flag", name: "Wanted Poster", color: "#e8d6a8", color2: "#7a3b1d", pattern: "skull" },
  { id: "sail_myth", kind: "sail", name: "Myth Sail", color: "#ff5a1f", color2: "#ffd24a", pattern: "star" },
  { id: "paint_naturalist", kind: "paint", name: "Naturalist Green", color: "#2f8f4e", color2: "#f4ecdc" },
  { id: "sail_hard", kind: "sail", name: "Iron Sail", color: "#2a2a30", color2: "#ff7a3d", pattern: "stripe" },
  { id: "flag_hard", kind: "flag", name: "Skull and Bones", color: "#111111", color2: "#f4f4f4", pattern: "skull" },
  { id: "paint_legend", kind: "paint", name: "Legendary Rose Gold", color: "#ff4fd8", color2: "#ffd24a" },
  { id: "flag_crown", kind: "flag", name: "Crown Banner", color: "#3a1d6e", color2: "#ffd24a", pattern: "star" },
  { id: "sail_ghost", kind: "sail", name: "Ghost Sail", color: "#e8f6ff", color2: "#7fc4d8", pattern: "wave" },
  { id: "paint_virtuoso", kind: "paint", name: "Virtuoso Silver", color: "#cfd8e0", color2: "#ffd24a" },
]);
addTitles([
  { id: "bounty_hunter", name: "Bounty Hunter" },
  { id: "most_wanted", name: "Most Wanted" },
  { id: "mythkeeper", name: "Mythkeeper" },
  { id: "naturalist", name: "Naturalist of the Five Seas" },
  { id: "hardened", name: "Hardened" },
  { id: "iron_captain", name: "Iron Captain" },
  { id: "legend", name: "Legend of the Tide" },
  { id: "ghost", name: "Ghost of the Sea" },
  { id: "virtuoso", name: "Virtuoso" },
  { id: "unbreakable", name: "Unbreakable" },
]);

/** number of Legendary species in the campaign (for "every Legendary caught") */
export const LEGENDARY_SPECIES = () => campaignSpeciesList().filter((s) => s.tier === "legendary").map((s) => s.id);

const list: Achievement[] = [
  { id: "act5_done", name: "Into the Light", desc: "Finish Act 5", icon: "🌑", cond: { stat: "actDone_5", gte: 1 }, act: 5 },
  { id: "bounty_1", name: "Bounty Hunter", desc: "Complete a bounty from the Bounty Board", icon: "📜", cond: { stat: "bounties", gte: 1 }, reward: { title: "bounty_hunter", coins: 50 } },
  { id: "bounty_25", name: "Most Wanted", desc: "Complete 25 bounties", icon: "🎯", cond: { stat: "bounties", gte: 25 }, reward: { title: "most_wanted", cosmetic: "flag_bounty" } },
  { id: "legend_all", name: "Mythkeeper", desc: "Catch every Legendary fish in the five seas", icon: "🐉", cond: { stat: "legendSpecies", gte: 7 }, reward: { title: "mythkeeper", cosmetic: "sail_myth" } },
  { id: "codex_all", name: "Naturalist of the Five Seas", desc: "Complete every region's Codex", icon: "📚", cond: { stat: "codexRegionsDone", gte: 5 }, reward: { title: "naturalist", cosmetic: "paint_naturalist" } },
  { id: "streak_50", name: "Unbreakable", desc: "A streak of 50 landings", icon: "⛓", cond: { stat: "streakMax", gte: 50 }, reward: { title: "unbreakable" } },
  { id: "flawless_all", name: "Ghost of the Sea", desc: "Beat all five bosses without taking damage", icon: "👻", cond: { stat: "flawlessBosses", gte: 5 }, reward: { title: "ghost", cosmetic: "sail_ghost" } },
  { id: "s_all", name: "Virtuoso", desc: "Get an S grade on all 30 chapters", icon: "🏆", cond: { stat: "sGrades", gte: 30 }, reward: { title: "virtuoso", cosmetic: "paint_virtuoso" } },
  { id: "hard_1", name: "Hardened", desc: "Finish a chapter on Hard", icon: "💀", cond: { stat: "hardClears", gte: 1 }, reward: { title: "hardened" } },
  { id: "hard_boss", name: "Hard Target", desc: "Defeat a boss on Hard", icon: "☠", cond: { stat: "hardBosses", gte: 1 }, reward: { cosmetic: "flag_hard", coins: 300 } },
  { id: "hard_all", name: "Iron Captain", desc: "Finish all 30 chapters on Hard (Legendary counts) and unlock Legendary mode", icon: "⚔", cond: { stat: "hardAll", gte: 30 }, reward: { title: "iron_captain", cosmetic: "sail_hard", coins: 2000 } },
  { id: "legendary_1", name: "No Second Chances", desc: "Finish a chapter on Legendary", icon: "👑", cond: { stat: "legendaryClears", gte: 1 }, reward: { cosmetic: "flag_crown" } },
  { id: "legendary_all", name: "Legend of the Tide", desc: "Finish all 30 chapters on Legendary", icon: "🌟", cond: { stat: "legendaryAll", gte: 30 }, reward: { title: "legend", cosmetic: "paint_legend", coins: 5000 } },
];
addAchievements(list);

// Codex region-completion rewards: every region gives a title + a paint (the Trench had no paint yet)
const trench = ACHIEVEMENTS_BY_ID.codex_trench;
if (trench) trench.reward = { ...trench.reward, cosmetic: trench.reward?.cosmetic ?? "paint_abyss" };

/** achievement groups for the achievements screen */
export function achievementGroup(a: Achievement): "voyage" | "angler" | "hunter" | "collector" | "modes" {
  if (/^(hard|legendary)_/.test(a.id)) return "modes";
  if (/^codex|legend_|night_bite|bait_switch|pearl_moray|thunder_marlin|aurora_koi|chain_3|legend_1/.test(a.id)) return "collector";
  if (/down$|flawless|bounty|heavy_load/.test(a.id)) return "hunter";
  if (/^act|campaign|s_all|old_campaign/.test(a.id)) return "voyage";
  return "angler";
}
