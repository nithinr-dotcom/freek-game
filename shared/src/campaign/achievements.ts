/**
 * Achievements: unlocked when a save stat reaches a threshold. The client increments stats on events
 * (client/src/solo/achievements.ts); P4 adds the rest of the ~30 list here.
 */
import type { Achievement } from "./types.js";

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_catch", name: "First Catch", desc: "Land your first fish", icon: "🐟", cond: { stat: "fish", gte: 1 }, reward: { coins: 20 } },
  { id: "hooked", name: "Hooked", desc: "Land 25 fish", icon: "🎣", cond: { stat: "fish", gte: 25 }, reward: { title: "angler" } },
  { id: "hundred", name: "Full Nets", desc: "Land 100 fish", icon: "🧺", cond: { stat: "fish", gte: 100 }, reward: { coins: 200 } },
  { id: "thousand", name: "Ocean Harvest", desc: "Land 1000 fish", icon: "🌊", cond: { stat: "fish", gte: 1000 }, reward: { cosmetic: "paint_gold" } },
  { id: "perfect_1", name: "Smooth Operator", desc: "Land a perfect reel", icon: "✨", cond: { stat: "perfect", gte: 1 } },
  { id: "perfect_25", name: "Perfectionist", desc: "Land 25 perfect reels", icon: "💎", cond: { stat: "perfect", gte: 25 }, reward: { title: "perfectionist" } },
  { id: "streak_5", name: "On a Roll", desc: "Land 5 fish in a row without a snap", icon: "🔥", cond: { stat: "streakMax", gte: 5 } },
  { id: "streak_20", name: "Unbroken", desc: "A streak of 20 landings", icon: "⛓", cond: { stat: "streakMax", gte: 20 }, reward: { title: "streaker" } },
  { id: "night_bite", name: "Night Bite", desc: "Catch the Moonlit Eel", icon: "🌙", cond: { stat: "species_moonlit_eel", gte: 1 }, reward: { title: "night_fisher", cosmetic: "sail_moon" }, act: 1 },
  { id: "bait_switch", name: "Food Chain", desc: "Land a fish that only bites on bait", icon: "🪱", cond: { stat: "baitCatches", gte: 1 }, reward: { title: "baitmaster", cosmetic: "flag_bait" }, act: 1 },
  { id: "craft_1", name: "Shipwright", desc: "Craft your first piece of gear", icon: "🔨", cond: { stat: "crafts", gte: 1 }, reward: { title: "shipwright" } },
  { id: "skill_1", name: "Learning the Ropes", desc: "Spend a skill point", icon: "📘", cond: { stat: "skillPicks", gte: 1 } },
  { id: "heavy_load", name: "Greedy Gull", desc: "Carry 50 kg of unbanked catch", icon: "⚖", cond: { stat: "heavyLoadKg", gte: 50 } },
  { id: "big_bank", name: "Big Banker", desc: "Bank 400 points in one trip", icon: "💰", cond: { stat: "bankTripMax", gte: 400 }, reward: { coins: 100 } },
  { id: "serpent_down", name: "Serpent Slayer", desc: "Defeat the Reef Serpent", icon: "🐍", cond: { stat: "boss_reef_serpent", gte: 1 }, reward: { title: "serpent_slayer" }, act: 1 },
  { id: "boss_flawless", name: "Untouchable", desc: "Beat a boss without taking damage", icon: "🛡", cond: { stat: "bossNoDamage", gte: 1 }, reward: { title: "untouchable" } },
  { id: "act1_s", name: "Bay Virtuoso", desc: "Get an S grade on every Act 1 chapter", icon: "🏅", cond: { stat: "actS_1", gte: 6 }, reward: { cosmetic: "sail_crimson" }, act: 1 },
  { id: "act1_done", name: "Shallows Cleared", desc: "Finish Act 1", icon: "⚓", cond: { stat: "actDone_1", gte: 1 }, act: 1 },
  { id: "codex_bay", name: "Bay Naturalist", desc: "Complete the Shallows Bay codex", icon: "📖", cond: { stat: "codex_shallows_bay", gte: 100 }, reward: { title: "bay_master", cosmetic: "paint_bay" }, act: 1 },
  { id: "legend_1", name: "Myth Made Real", desc: "Land a Legendary fish", icon: "🌟", cond: { stat: "legendaries", gte: 1 }, reward: { cosmetic: "flag_star" } },
  { id: "old_campaign", name: "Old Campaign Completed", desc: "Finished the original six-chapter campaign", icon: "📜", cond: { stat: "oldCampaign", gte: 1 }, reward: { title: "old_salt", cosmetic: "sail_tide" }, hidden: true },
];
export const ACHIEVEMENTS_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
