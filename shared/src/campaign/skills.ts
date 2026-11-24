/** Skill tree: 3 branches × 5 nodes, 1–3 ranks each. 1 point per level, +1 per boss. */
import type { SkillBranch, SkillNode } from "./types.js";

export const SKILL_BRANCHES: Record<SkillBranch, { name: string; color: string; icon: string }> = {
  angler: { name: "Angler", color: "#3fd0c9", icon: "🎣" },
  sailor: { name: "Sailor", color: "#3fa9ff", icon: "⛵" },
  hunter: { name: "Hunter", color: "#ff6b5a", icon: "🔱" },
};

export const SKILLS: SkillNode[] = [
  { id: "a_zone", branch: "angler", name: "Wide Net", icon: "🟩", maxRank: 3, desc: (r) => `Catch zone +${r * 4}%` },
  { id: "a_tension", branch: "angler", name: "Light Touch", icon: "🪶", maxRank: 3, desc: (r) => `Tension builds ${r * 8}% slower`, requires: "a_zone" },
  { id: "a_bite", branch: "angler", name: "Patient Hands", icon: "⏱", maxRank: 3, desc: (r) => `Bite window +${r * 150} ms`, requires: "a_zone" },
  { id: "a_perfect", branch: "angler", name: "Pearl Diver", icon: "🐚", maxRank: 2, desc: (r) => `Perfect reels give +${r} material`, requires: "a_tension" },
  { id: "a_second", branch: "angler", name: "Second Wind", icon: "💨", maxRank: 1, desc: () => "Once per fish, a snap is prevented and tension resets to 60%", requires: "a_perfect" },
  { id: "s_speed", branch: "sailor", name: "Trim the Sails", icon: "💨", maxRank: 3, desc: (r) => `Boat speed +${r * 4}%` },
  { id: "s_hull", branch: "sailor", name: "Reinforced Hull", icon: "🛡", maxRank: 3, desc: (r) => `Hull HP +${r * 10}`, requires: "s_speed" },
  { id: "s_hold", branch: "sailor", name: "Deep Hold", icon: "📦", maxRank: 3, desc: (r) => `Load capacity +${r * 15}%`, requires: "s_speed" },
  { id: "s_wind", branch: "sailor", name: "Keel Master", icon: "🧭", maxRank: 2, desc: (r) => `Wind drift −${r * 20}%`, requires: "s_hold" },
  { id: "s_repair", branch: "sailor", name: "Ship's Carpenter", icon: "🔨", maxRank: 2, desc: (r) => `Repair ${(r * 0.6).toFixed(1)} HP/s at sea`, requires: "s_hull" },
  { id: "h_dmg", branch: "hunter", name: "Sharp Barbs", icon: "🗡", maxRank: 3, desc: (r) => `Harpoon damage +${r * 10}%` },
  { id: "h_cd", branch: "hunter", name: "Quick Winch", icon: "⚙", maxRank: 3, desc: (r) => `Harpoon cooldown −${r * 8}%`, requires: "h_dmg" },
  { id: "h_crit", branch: "hunter", name: "Weak Spot", icon: "🎯", maxRank: 3, desc: (r) => `${r * 8}% chance of a ×2 critical hit`, requires: "h_dmg" },
  { id: "h_twin", branch: "hunter", name: "Twin Harpoon", icon: "🔱", maxRank: 1, desc: () => "Fires two harpoons at once", requires: "h_crit" },
  { id: "h_loot", branch: "hunter", name: "Trophy Hunter", icon: "🏆", maxRank: 2, desc: (r) => `Monster kills give +${r} material and +${r * 20}% XP`, requires: "h_cd" },
];
export const SKILLS_BY_ID: Record<string, SkillNode> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export interface SkillEffects {
  zoneBonus: number; tensionMult: number; biteWindowMs: number; perfectMats: number; secondWind: boolean;
  speedMult: number; hpBonus: number; capacityMult: number; windMult: number; repairPerSec: number;
  harpoonDmgMult: number; cooldownMult: number; critChance: number; twin: boolean; lootMats: number; lootXpMult: number;
}
export function skillEffects(ranks: Record<string, number>): SkillEffects {
  const r = (id: string) => ranks[id] ?? 0;
  return {
    zoneBonus: r("a_zone") * 0.04, tensionMult: 1 - r("a_tension") * 0.08, biteWindowMs: r("a_bite") * 150, perfectMats: r("a_perfect"), secondWind: r("a_second") > 0,
    speedMult: 1 + r("s_speed") * 0.04, hpBonus: r("s_hull") * 10, capacityMult: 1 + r("s_hold") * 0.15, windMult: 1 - r("s_wind") * 0.2, repairPerSec: r("s_repair") * 0.6,
    harpoonDmgMult: 1 + r("h_dmg") * 0.1, cooldownMult: 1 - r("h_cd") * 0.08, critChance: r("h_crit") * 0.08, twin: r("h_twin") > 0, lootMats: r("h_loot"), lootXpMult: 1 + r("h_loot") * 0.2,
  };
}
/** skill points earned: level − 1 + bosses beaten */
export function skillPointsEarned(level: number, bosses: number) { return Math.max(0, level - 1) + bosses; }
export const RESPEC_COST = 150;
