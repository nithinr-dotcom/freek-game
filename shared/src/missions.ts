import type { Tier } from "./fish.js";
import type { ZoneId } from "./constants.js";

export type MissionKind =
  | { type: "catch_count"; n: number }
  | { type: "catch_tier"; tier: Tier; n: number }          // tier or better
  | { type: "catch_zone"; zone: ZoneId; n: number }
  | { type: "catch_weight"; kg: number }                     // single fish >= kg
  | { type: "bank_points"; n: number }                       // bank n points in one trip
  | { type: "harpoon_hits"; n: number }
  | { type: "monster_kill"; n: number }
  | { type: "perfect_reel"; n: number }                      // land without tension going above 50%
  | { type: "storm_catch"; n: number };

export interface MissionTemplate { id: string; title: string; kind: MissionKind; xp: number; coins: number; squad?: boolean }

export const MISSION_POOL: MissionTemplate[] = [
  { id: "c5", title: "Catch 5 fish", kind: { type: "catch_count", n: 5 }, xp: 80, coins: 20 },
  { id: "c12", title: "Catch 12 fish", kind: { type: "catch_count", n: 12 }, xp: 200, coins: 50 },
  { id: "r3", title: "Catch 3 Rare-or-better fish", kind: { type: "catch_tier", tier: "rare", n: 3 }, xp: 150, coins: 40 },
  { id: "g1", title: "Land a Gold fish", kind: { type: "catch_tier", tier: "gold", n: 1 }, xp: 200, coins: 60 },
  { id: "e1", title: "Land an Epic fish", kind: { type: "catch_tier", tier: "epic", n: 1 }, xp: 450, coins: 120 },
  { id: "reef4", title: "Catch 4 fish at the Reef", kind: { type: "catch_zone", zone: "reef", n: 4 }, xp: 140, coins: 35 },
  { id: "abyss3", title: "Brave the Abyss: catch 3 fish", kind: { type: "catch_zone", zone: "abyss", n: 3 }, xp: 260, coins: 70 },
  { id: "heavy50", title: "Land a fish over 50 kg", kind: { type: "catch_weight", kg: 50 }, xp: 220, coins: 60 },
  { id: "bank300", title: "Bank 300 points in one trip", kind: { type: "bank_points", n: 300 }, xp: 250, coins: 80 },
  { id: "perfect3", title: "3 perfect reels (tension under 50%)", kind: { type: "perfect_reel", n: 3 }, xp: 180, coins: 45 },
  { id: "harp10", title: "Hit monsters with 10 harpoons", kind: { type: "harpoon_hits", n: 10 }, xp: 200, coins: 50 },
  { id: "storm2", title: "Catch 2 fish during a storm", kind: { type: "storm_catch", n: 2 }, xp: 220, coins: 60 },
  // squad missions: progress shared by whole squad
  { id: "sq_kill", title: "SQUAD: slay a sea monster", kind: { type: "monster_kill", n: 1 }, xp: 400, coins: 100, squad: true },
  { id: "sq_c25", title: "SQUAD: catch 25 fish together", kind: { type: "catch_count", n: 25 }, xp: 350, coins: 90, squad: true },
  { id: "sq_epic", title: "SQUAD: land 2 Epic-or-better fish", kind: { type: "catch_tier", tier: "epic", n: 2 }, xp: 600, coins: 150, squad: true },
];
export function missionTarget(k: MissionKind): number {
  switch (k.type) {
    case "catch_weight": return 1;
    case "bank_points": return k.n;
    default: return k.n;
  }
}
export const ACTIVE_MISSIONS_PER_PLAYER = 3;
export const ACTIVE_MISSIONS_PER_SQUAD = 1;
