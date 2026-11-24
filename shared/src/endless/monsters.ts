/**
 * Endless Tide monster roster: which monster types unlock at which tide, their spawn weights (per biome), and
 * HP / damage / reward multipliers relative to the tide's `tideSpec` (monsterHp, killCoins, killXp). Pure data + a
 * seeded-friendly picker; the behaviours live in client/src/endless/monsters/. Every type rides on the "serpent"
 * MonsterKind so the multiplayer server is untouched.
 *
 * Damages are BASE values on the serpent scale (a serpent bite is 20): SoloNet multiplies them by the run's
 * monsterDmgMult (tideSpec.monsterDmg / 20) and armour.
 */
import type { RegionId } from "../campaign/types.js";

export type EndlessMonsterType = "serpent" | "swarmer" | "spitter" | "shielded" | "splitter" | "splitling" | "bomber";

export interface EndlessMonsterDef {
  id: EndlessMonsterType;
  name: string;
  /** first tide it can appear on (Infinity: never rolled, only spawned by others) */
  unlockTide: number;
  /** base spawn weight once unlocked */
  weight: number;
  /** spawn weight multiplier per biome (missing = 1) */
  biome?: Partial<Record<RegionId, number>>;
  /** × tideSpec.monsterHp (per monster, for groups per member) */
  hpMult: number;
  /** base hit damage on the serpent scale (20) */
  dmg: number;
  /** m/s */
  speed: number;
  /** × tideSpec.killCoins / killXp on kill */
  coinMult: number;
  xpMult: number;
  /** spawned as a group of [min, max] */
  group?: [number, number];
  /** may roll as an elite (×3 HP, ×1.5 coins and xp, 25% chance of a chest) */
  canElite: boolean;
  blurb: string;
}

export const ENDLESS_MONSTERS: Record<EndlessMonsterType, EndlessMonsterDef> = {
  serpent: {
    id: "serpent", name: "Tide Serpent", unlockTide: 1, weight: 10, hpMult: 1, dmg: 20, speed: 9, coinMult: 1, xpMult: 1, canElite: true,
    blurb: "Chases the boat and bites.",
  },
  swarmer: {
    id: "swarmer", name: "Piranha Pack", unlockTide: 2, weight: 5, biome: { shallows_bay: 1.5, coral_maze: 1.2 },
    hpMult: 0.25, dmg: 5, speed: 13.5, coinMult: 0.3, xpMult: 0.35, group: [3, 5], canElite: false,
    blurb: "Fast packs of 3–5. Any hit kills one.",
  },
  spitter: {
    id: "spitter", name: "Spitter Eel", unlockTide: 3, weight: 4, biome: { stormbreak: 1.8, frozen_fjord: 1.2 },
    hpMult: 0.8, dmg: 16, speed: 8, coinMult: 1.2, xpMult: 1.2, canElite: true,
    blurb: "Keeps its distance and lobs acid: leave the circle.",
  },
  bomber: {
    id: "bomber", name: "Puffer Mine", unlockTide: 5, weight: 3.5, biome: { coral_maze: 1.8, abyss_trench: 1.2 },
    hpMult: 0.5, dmg: 30, speed: 4.5, coinMult: 0.8, xpMult: 0.8, canElite: false,
    blurb: "Drifts in and explodes. Harpoon it early: the blast hurts other monsters.",
  },
  shielded: {
    id: "shielded", name: "Armored Crab", unlockTide: 7, weight: 3, biome: { coral_maze: 1.4, frozen_fjord: 1.8 },
    hpMult: 1.1, dmg: 17, speed: 4.5, coinMult: 1.8, xpMult: 1.8, canElite: true,
    blurb: "Front shield blocks 80%. Flank it; dodge the charge.",
  },
  splitter: {
    id: "splitter", name: "Jelly Bloom", unlockTide: 9, weight: 3, biome: { abyss_trench: 2, frozen_fjord: 1.2 },
    hpMult: 1.1, dmg: 14, speed: 6, coinMult: 1, xpMult: 1, canElite: true,
    blurb: "Splits into 2–3 jellies when it dies.",
  },
  splitling: {
    id: "splitling", name: "Jellylet", unlockTide: Infinity, weight: 0,
    hpMult: 0.3, dmg: 8, speed: 9.5, coinMult: 0.4, xpMult: 0.4, canElite: false,
    blurb: "A piece of a Jelly Bloom.",
  },
};

/** children per Jelly Bloom death */
export const SPLIT_COUNT: [number, number] = [2, 3];

/** the type a tide showcases (spawn weight ×2): a type's unlock tide features it, later tides cycle through */
export function featuredMonster(tide: number): EndlessMonsterType | null {
  const unlocked = Object.values(ENDLESS_MONSTERS).filter((d) => d.weight > 0 && d.unlockTide <= tide && d.id !== "serpent");
  if (!unlocked.length) return null;
  const fresh = unlocked.find((d) => d.unlockTide === tide);
  if (fresh) return fresh.id;
  return unlocked[(tide * 7) % unlocked.length].id;
}

export function monsterWeights(tide: number, region?: RegionId): [EndlessMonsterType, number][] {
  const feat = featuredMonster(tide);
  const out: [EndlessMonsterType, number][] = [];
  for (const d of Object.values(ENDLESS_MONSTERS)) {
    if (d.weight <= 0 || d.unlockTide > tide) continue;
    let w = d.weight * ((region && d.biome?.[region]) ?? 1);
    if (d.id === feat) w *= 2;
    // serpents thin out as the roster grows (they stay the backbone)
    if (d.id === "serpent") w *= Math.max(0.45, 1 - tide * 0.03);
    out.push([d.id, w]);
  }
  return out;
}

export function pickMonsterType(tide: number, region?: RegionId, r: () => number = Math.random): EndlessMonsterType {
  const w = monsterWeights(tide, region);
  const total = w.reduce((s, [, x]) => s + x, 0);
  let x = r() * total;
  for (const [id, v] of w) { x -= v; if (x <= 0) return id; }
  return "serpent";
}
