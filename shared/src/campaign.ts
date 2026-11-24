/**
 * Single-player campaign data (client-only mode; the server does not use this).
 * Six chapters narrated by Old Marlow, the lighthouse keeper.
 */
import type { ZoneId } from "./constants.js";
import type { MissionKind } from "./missions.js";
import type { MonsterKind } from "./monsters.js";

export const CAMPAIGN_NPC = { name: "Old Marlow", title: "the lighthouse keeper" };

/** Objective kinds: every MissionKind plus banking a catch at the dock. */
export type CampaignObjectiveKind = MissionKind | { type: "bank_any"; n: number };

export interface CampaignObjective { id: string; title: string; kind: CampaignObjectiveKind }

/** Permanent unlocks. Zones open when the chapter that needs them begins; items are chapter rewards. */
export type CampaignUnlock = "reef" | "abyss" | "harpoon_upgrade" | "legendary_rod";

export interface ChapterDef {
  id: number;
  title: string;
  zone: ZoneId;
  intro: string[];
  objectives: CampaignObjective[];
  /** zone that opens when this chapter starts */
  opensZone?: "reef" | "abyss";
  reward: { xp: number; coins: number; unlock?: CampaignUnlock; unlockText?: string };
  /** scripted events */
  script?: { monster?: MonsterKind; boss?: boolean; forceStormAfterMs?: number; legendaryBoost?: number };
  /** finish under this many seconds of play for the speed star */
  parSeconds: number;
  tutorial?: boolean;
}

export const CHAPTERS: ChapterDef[] = [
  {
    id: 1, title: "First Cast", zone: "shallows", tutorial: true, parSeconds: 420,
    intro: [
      "Ahoy there, young sailor! Name's Marlow. I've kept this lighthouse lit for forty years.",
      "The Shallows are calm. Hold SPACE to charge your cast, then let go.",
      "When the bobber dips, strike fast! Then keep that fish in the green zone.",
      "Bring three fish home and bank them in the golden ring at my dock.",
    ],
    objectives: [
      { id: "c3", title: "Catch 3 fish", kind: { type: "catch_count", n: 3 } },
      { id: "bank", title: "Bank your catch at the dock", kind: { type: "bank_any", n: 1 } },
    ],
    reward: { xp: 150, coins: 50, unlockText: "The Reef opens next chapter" },
  },
  {
    id: 2, title: "Reef Runner", zone: "reef", opensZone: "reef", parSeconds: 720,
    intro: [
      "Not bad for a landlubber! I've lifted the chain at the Reef for you.",
      "Coral islands mean colourful fish. Rare ones, even a Golden Koi if you're lucky.",
      "Show me two Rare fish and a Gold one, and I'll believe you've got the knack.",
    ],
    objectives: [
      { id: "r2", title: "Catch 2 Rare-or-better fish", kind: { type: "catch_tier", tier: "rare", n: 2 } },
      { id: "g1", title: "Land a Gold fish", kind: { type: "catch_tier", tier: "gold", n: 1 } },
    ],
    reward: { xp: 300, coins: 90 },
  },
  {
    id: 3, title: "Serpent's Wake", zone: "reef", parSeconds: 720,
    script: { monster: "serpent" },
    intro: [
      "Trouble, sailor. A Reef Serpent's been snapping at my nets.",
      "Right-click or press F to fire your harpoon where you aim. Keep moving!",
      "Drive it off for good. And keep that reel steady: two perfect reels, no slack.",
    ],
    objectives: [
      { id: "kill", title: "Slay the Reef Serpent", kind: { type: "monster_kill", n: 1 } },
      { id: "p2", title: "Land 2 perfect reels", kind: { type: "perfect_reel", n: 2 } },
    ],
    reward: { xp: 450, coins: 140, unlock: "harpoon_upgrade", unlockText: "Harpoon upgrade: +10 damage" },
  },
  {
    id: 4, title: "Into the Abyss", zone: "abyss", opensZone: "abyss", parSeconds: 900,
    script: { forceStormAfterMs: 45_000 },
    intro: [
      "Past the Reef the water turns black. That's the Abyss, and I've opened the way.",
      "The best fish live down there, and so do the worst things.",
      "Catch three fish in the Abyss. And I smell a storm coming: fish bite strange in the rain.",
    ],
    objectives: [
      { id: "a3", title: "Catch 3 fish in the Abyss", kind: { type: "catch_zone", zone: "abyss", n: 3 } },
      { id: "s1", title: "Catch a fish during a storm", kind: { type: "storm_catch", n: 1 } },
    ],
    reward: { xp: 600, coins: 180 },
  },
  {
    id: 5, title: "The Kraken", zone: "abyss", parSeconds: 1080,
    script: { monster: "kraken", boss: true },
    intro: [
      "I didn't want to believe it. The Abyss Kraken is awake.",
      "It sank my brother's boat when we were young. Its tentacles slam the water: watch for the red rings!",
      "Bring it down, and land an Epic catch while you're out there. Then you'll be a true Tidebreaker.",
    ],
    objectives: [
      { id: "kraken", title: "Slay the Abyss Kraken", kind: { type: "monster_kill", n: 1 } },
      { id: "e1", title: "Land an Epic-or-better fish", kind: { type: "catch_tier", tier: "epic", n: 1 } },
    ],
    reward: { xp: 900, coins: 300, unlock: "legendary_rod", unlockText: "Legendary rod: legendary fish bite more often" },
  },
  {
    id: 6, title: "Legend of the Tide", zone: "abyss", parSeconds: 900,
    script: { legendaryBoost: 4 },
    intro: [
      "That rod was my father's. They say it calls to the old ones.",
      "One last thing, sailor. Land a Legendary fish.",
      "Do that, and this ocean is yours.",
    ],
    objectives: [
      { id: "l1", title: "Land a Legendary fish", kind: { type: "catch_tier", tier: "legendary", n: 1 } },
    ],
    reward: { xp: 1500, coins: 500, unlockText: "Free Play: all zones open, endless fishing" },
  },
];

export const CAMPAIGN_ENDING: string[] = [
  "You did it. The legends were true, and you're one of them now.",
  "The lighthouse will keep burning for you, Tidebreaker. The whole ocean is yours.",
];

export const FREE_PLAY_CHAPTER = CHAPTERS.length + 1;

/** zones open when chapter `ch` is being played (ch > CHAPTERS.length = free play) */
export function zonesOpenAt(ch: number): Record<ZoneId, boolean> {
  return { shallows: true, reef: ch >= 2, abyss: ch >= 4 };
}

/** stars: 1 for finishing, +1 under par time, +1 without sinking */
export function chapterStars(elapsedSec: number, parSeconds: number, sank: boolean): number {
  return 1 + (elapsedSec <= parSeconds ? 1 : 0) + (sank ? 0 : 1);
}

export function objectiveTarget(k: CampaignObjectiveKind): number {
  if (k.type === "catch_weight") return 1;
  return k.n;
}
