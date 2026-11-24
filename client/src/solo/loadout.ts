/** Effective stats from gear tiers + skills + assist. Everything that reads gear goes through here. */
import { GEAR, skillEffects, type GearSlot, type SkillEffects, type GearStats } from "@freek/shared";
import type { SoloSave } from "./save";

export interface Loadout {
  castMult: number; biteSpeed: number; rareBonus: number;
  fillMult: number; liftMult: number; ratingKg: number;
  maxHp: number; capacityKg: number;
  harpoonDamage: number; harpoonCooldownMs: number;
  lightRadius: number; warmthDrain: number;
  skills: SkillEffects;
  assist: boolean;
}

export function gearStats(slot: GearSlot, tier: number): GearStats {
  return GEAR[slot][Math.max(1, Math.min(5, tier)) - 1].stats;
}

export function computeLoadout(save: SoloSave, assist = false): Loadout {
  const g = (s: GearSlot) => gearStats(s, save.gear[s] ?? 1);
  const sk = skillEffects(save.skills);
  if (assist) sk.zoneBonus += 0.15;
  return {
    castMult: g("rod").castMult!, biteSpeed: g("rod").biteSpeed!, rareBonus: g("rod").rareBonus!,
    fillMult: g("reel").fillMult!, liftMult: g("reel").liftMult!, ratingKg: g("line").ratingKg!,
    maxHp: g("hull").hp! + sk.hpBonus, capacityKg: Math.round(g("hull").capacityKg! * sk.capacityMult),
    harpoonDamage: Math.round(g("harpoon").damage! * sk.harpoonDmgMult), harpoonCooldownMs: Math.round(g("harpoon").cooldownMs! * sk.cooldownMult),
    lightRadius: g("lantern").lightRadius!, warmthDrain: g("heater").warmthDrain!,
    skills: sk, assist,
  };
}

/** load speed factor (§3): max(0.55, 1 − 0.45 · unbankedKg / capacity) */
export function loadFactor(unbankedKg: number, capacityKg: number) {
  return Math.max(0.55, 1 - 0.45 * (unbankedKg / Math.max(1, capacityKg)));
}
