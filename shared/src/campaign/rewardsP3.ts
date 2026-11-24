/**
 * P3 rewards (Acts 4–5 + finale): boss titles/cosmetics, region codex rewards and achievements. Appended to the shared
 * lists at import time so cosmetics.ts / achievements.ts stay untouched (merge-friendly).
 */
import { COSMETICS, COSMETICS_BY_ID, TITLES, TITLES_BY_ID } from "./cosmetics.js";
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from "./achievements.js";
import type { Achievement, Cosmetic, TitleDef } from "./types.js";

const cosmetics: Cosmetic[] = [
  { id: "sail_aurora", kind: "sail", name: "Aurora Sail", color: "#1d3b5a", color2: "#5affc8", pattern: "wave" },
  { id: "paint_glacier", kind: "paint", name: "Glacier White", color: "#e8f6ff", color2: "#7fc4d8" },
  { id: "flag_frost", kind: "flag", name: "Frost Pennant", color: "#cdf3ff", color2: "#3f7f9e", pattern: "star" },
  { id: "paint_maelstrom", kind: "paint", name: "Maelstrom Violet", color: "#3a1d6e", color2: "#ff5ad8" },
  { id: "paint_lantern", kind: "paint", name: "Lantern Glow", color: "#1a2a44", color2: "#ffcf7a" },
  { id: "flag_eye", kind: "flag", name: "Eye Banner", color: "#1a0c33", color2: "#ff5ad8", pattern: "skull" },
  { id: "sail_tidebreaker", kind: "sail", name: "Sail of the Tidebreaker", color: "#ffd24a", color2: "#ff5ad8", pattern: "star" },
];
const titles: TitleDef[] = [
  { id: "leviathan_breaker", name: "Leviathan Breaker" },
  { id: "fjord_master", name: "Master of the Fjord" },
  { id: "aurora_chaser", name: "Aurora Chaser" },
  { id: "lamplighter", name: "Lamplighter" },
  { id: "trench_master", name: "Master of the Trench" },
  { id: "tidebreaker", name: "Tidebreaker" },
  { id: "eye_duelist", name: "Eye Duelist" },
];
const achievements: Achievement[] = [
  { id: "aurora_koi", name: "Under the Lights", desc: "Catch the Aurora Koi", icon: "🌌", cond: { stat: "species_aurora_koi", gte: 1 }, reward: { title: "aurora_chaser" }, act: 4 },
  { id: "leviathan_down", name: "Icebreaker", desc: "Defeat the Ice Leviathan", icon: "🧊", cond: { stat: "boss_ice_leviathan", gte: 1 }, reward: { title: "leviathan_breaker" }, act: 4 },
  { id: "act4_done", name: "Thaw", desc: "Finish Act 4", icon: "❄", cond: { stat: "actDone_4", gte: 1 }, act: 4 },
  { id: "act4_s", name: "Fjord Virtuoso", desc: "Get an S grade on every Act 4 chapter", icon: "🏅", cond: { stat: "actS_4", gte: 6 }, reward: { cosmetic: "flag_frost" }, act: 4 },
  { id: "codex_fjord", name: "Fjord Naturalist", desc: "Complete the Frozen Fjord codex", icon: "📖", cond: { stat: "codex_frozen_fjord", gte: 100 }, reward: { title: "fjord_master", cosmetic: "paint_glacier" }, act: 4 },
  { id: "chain_3", name: "Top of the Chain", desc: "Land an Abyssal Shark", icon: "🦈", cond: { stat: "species_abyssal_shark", gte: 1 }, reward: { title: "lamplighter" }, act: 5 },
  { id: "eye_down", name: "Eye Closed", desc: "Win the Eye Duel and defeat the Maelstrom Eye", icon: "👁", cond: { stat: "boss_maelstrom_eye", gte: 1 }, reward: { title: "eye_duelist", cosmetic: "flag_eye" }, act: 5 },
  { id: "act5_s", name: "Trench Virtuoso", desc: "Get an S grade on every Act 5 chapter", icon: "🏅", cond: { stat: "actS_5", gte: 6 }, reward: { cosmetic: "paint_lantern" }, act: 5 },
  { id: "codex_trench", name: "Trench Naturalist", desc: "Complete the Abyss Trench codex", icon: "📖", cond: { stat: "codex_abyss_trench", gte: 100 }, reward: { title: "trench_master" }, act: 5 },
  { id: "campaign_done", name: "Tidebreaker", desc: "Finish the campaign", icon: "🌅", cond: { stat: "campaignDone", gte: 1 }, reward: { cosmetic: "sail_tidebreaker", coins: 1000 } },
];

for (const c of cosmetics) if (!COSMETICS_BY_ID[c.id]) { COSMETICS.push(c); COSMETICS_BY_ID[c.id] = c; }
for (const t of titles) if (!TITLES_BY_ID[t.id]) { TITLES.push(t); TITLES_BY_ID[t.id] = t; }
for (const a of achievements) if (!ACHIEVEMENTS_BY_ID[a.id]) { ACHIEVEMENTS.push(a); ACHIEVEMENTS_BY_ID[a.id] = a; }
