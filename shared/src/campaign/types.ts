/**
 * Campaign v2 data types (single player only; the server never reads these).
 * Everything here is plain data so later acts/regions can be added as new files.
 */
import type { Species, Tier } from "../fish.js";
import type { ZoneId } from "../constants.js";
import type { MonsterKind } from "../monsters.js";

export type RegionId = "shallows_bay" | "coral_maze" | "stormbreak" | "frozen_fjord" | "abyss_trench";
export type TimeOfDay = "day" | "dusk" | "night";
export type WeatherTag = "clear" | "rain" | "storm" | "gust" | "aurora";
export type Behaviour = "steady" | "darter" | "feinter" | "diver" | "thrasher" | "legend";
export type MaterialId =
  | "shell" | "coral" | "stormglass" | "icepearl" | "abyssink"
  | "serpent_fang" | "titan_carapace" | "kraken_beak" | "leviathan_heart" | "maelstrom_core";

// ------------------------------------------------------------------ species
export interface SpeciesConditions {
  time?: TimeOfDay[];
  weather?: WeatherTag[];
  /** landmark id (radius comes from the landmark) */
  near?: string;
  /** species id that must be equipped as bait; it is used up on the bite */
  bait?: string;
}
export interface CampaignSpecies extends Species {
  region: RegionId;
  behaviour: Behaviour;
  conditions?: SpeciesConditions;
  /** when all conditions hold, chance that a bite is this species (special/hunt species) */
  specialChance?: number;
  /** can be kept as bait instead of banked */
  baitable?: boolean;
  /** riddle shown until first caught */
  clue: string;
}

// ------------------------------------------------------------------ objectives
export type ObjectiveKind =
  | { type: "catch_count"; n: number }
  | { type: "catch_tier"; tier: Tier; n: number }                                   // tier or better
  | { type: "catch_species"; ids: string[]; n: number; distinct?: boolean }
  | { type: "catch_weight_range"; speciesId?: string; minKg: number; maxKg: number; n: number }
  | { type: "bank_points_trip"; n: number }
  | { type: "bank_any"; n?: number }
  | { type: "bank_fish"; n: number }                                                 // bank n fish in total
  | { type: "bank_species"; ids: string[]; noDamage?: boolean }                      // bank a trip that holds one of ids (optionally with no damage since it was caught)
  | { type: "perfect_reel"; n: number }
  | { type: "streak"; n: number }                                                    // consecutive landings with no snap
  | { type: "harpoon_hits"; n: number }
  | { type: "kill"; target: "monster" | "boss" | MonsterKind; n: number }
  | { type: "reach"; pointId: string }
  | { type: "collect"; itemKind: string; n: number }
  | { type: "escort"; npcId: string; toPointId: string; minHpPct?: number }
  | { type: "defend"; npcId: string; seconds: number; minHpPct?: number }
  | { type: "survive"; seconds: number; condition?: "storm" | "night" | "monsters" }
  // constraints: hold from the start, break on violation, judged at the end
  | { type: "no_damage" }
  | { type: "no_snap" }
  | { type: "no_sink" }
  | { type: "no_lightning_hits" }
  | { type: "under_time"; seconds: number }
  | { type: "warmth_above"; pct: number };

export type ObjectiveType = ObjectiveKind["type"];
export const CONSTRAINT_TYPES: ObjectiveType[] = ["no_damage", "no_snap", "no_sink", "no_lightning_hits", "under_time", "warmth_above"];

export interface ObjectiveDef { id: string; title: string; kind: ObjectiveKind }

// ------------------------------------------------------------------ chapters
export interface NpcSpawn { id: string; name: string; hp: number; mode: "tow" | "moored"; at: string /* pointId */; color?: string }
export interface PickupSpawn { kind: string; points: string[] /* pointIds or "random:N" */ }

export interface ChapterSetup {
  /** zones the boat may enter (shallows/reef/abyss rings of the region map) */
  zones?: ZoneId[];
  /** solo clock at chapter start (hour 0..24); omitted = keep the current clock */
  startHour?: number;
  weather?: "clear" | "storm";
  monsters?: "none" | "random";
  tutorial?: boolean;
  npcs?: NpcSpawn[];
  pickups?: PickupSpawn[];
  /** extra roll weight for some species in this chapter */
  speciesBoost?: Record<string, number>;
  /** when this species is rolled, chance its weight lands inside [minKg,maxKg] */
  targetWeight?: { speciesId: string; minKg: number; maxKg: number; chance: number };
  /** give the player some bait at chapter start */
  startBait?: Record<string, number>;
}

export interface ChapterFail {
  timeLimit?: number;   // seconds, HUD countdown
  ironman?: boolean;    // sinking fails the chapter
}

export interface ChapterRewards {
  xp: number; coins: number;
  materials?: Partial<Record<MaterialId, number>>;
  unlockRegion?: RegionId;
  text?: string;
}

export interface CampaignChapter {
  /** global id 1..30 */
  id: number;
  act: number;
  /** index inside the act, 1..6 */
  index: number;
  region: RegionId;
  title: string;
  /** boss registry id (boss chapters) */
  boss?: string;
  intro: string[];
  outro?: string[];
  hint: string;
  main: ObjectiveDef;
  optional: [ObjectiveDef, ObjectiveDef];
  fail?: ChapterFail;
  parSeconds: number;
  rewards: ChapterRewards;
  setup?: ChapterSetup;
  /** HUD helper lines keyed by situation (tutorials) */
  tips?: Partial<Record<"start" | "bait" | "night" | "rest" | "boss", string>>;
}

export interface ActDef { act: number; region: RegionId; title: string; chapters: CampaignChapter[] }

// ------------------------------------------------------------------ regions
export interface Landmark { id: string; name: string; x: number; z: number; radius: number; kind: "wreck" | "lighthouse" | "arch" | "reef" | "other" }
export interface MapPoint { x: number; z: number; label: string }
export interface Biome {
  water: { shallow: string; mid: string; deep: string };
  sky: { top: string; horizon: string };
  fog: string;
  fogMult: number;
}
export interface RegionWeather { windBase: number; stormEveryMs: number; stormDurationMs: number; gustEveryMs: [number, number]; aurora?: boolean; endlessNight?: boolean }
export interface RegionHazards { coralDamage?: boolean; lightning?: boolean; iceFloes?: boolean; cold?: boolean; darkness?: boolean }

export interface RegionDef {
  id: RegionId;
  act: number;
  name: string;
  subtitle: string;
  material: MaterialId;
  trophy: MaterialId;
  bossId: string;
  /** position on the Sea Chart, 0..1 */
  chart: { x: number; y: number };
  biome: Biome;
  weather: RegionWeather;
  hazards: RegionHazards;
  /** client layout generator id (client/src/solo/regions) */
  layout: string;
  homeDock: { x: number; z: number };
  landmarks: Landmark[];
  points: Record<string, MapPoint>;
  /** pickups spawn points by item kind */
  pickupSpawns: Record<string, { x: number; z: number }[]>;
  /** registered as a placeholder (data comes in a later phase) */
  stub?: boolean;
}

// ------------------------------------------------------------------ bosses
export interface BossPhase { atPct: number; name: string }
export interface BossDef {
  id: string; name: string; epithet: string;
  region: RegionId;
  monsterKind: MonsterKind;
  hp: number;
  /** phase starts; the first one has atPct 1 */
  phases: BossPhase[];
  trophy: MaterialId;
  title: string;      // title id rewarded
  cosmetic: string;   // cosmetic id rewarded
  xp: number;
  intro: string[];
}

// ------------------------------------------------------------------ gear / skills
export type GearSlot = "rod" | "reel" | "line" | "hull" | "harpoon" | "lantern" | "heater";
export interface GearStats {
  castMult?: number; biteSpeed?: number; rareBonus?: number;      // rod
  fillMult?: number; liftMult?: number;                            // reel
  ratingKg?: number;                                               // line
  hp?: number; capacityKg?: number;                                // hull
  damage?: number; cooldownMs?: number;                            // harpoon
  lightRadius?: number;                                            // lantern
  warmthDrain?: number;                                            // heater (multiplier, lower is better)
}
export interface GearTier { tier: number; name: string; stats: GearStats; cost: { coins: number; mats: Partial<Record<MaterialId, number>> } }

export type SkillBranch = "angler" | "sailor" | "hunter";
export interface SkillNode { id: string; branch: SkillBranch; name: string; icon: string; maxRank: number; desc: (rank: number) => string; requires?: string }

// ------------------------------------------------------------------ rewards / collection
export type CosmeticKind = "paint" | "sail" | "flag";
export interface Cosmetic { id: string; kind: CosmeticKind; name: string; color: string; color2?: string; pattern?: "solid" | "stripe" | "skull" | "star" | "wave" }
export interface TitleDef { id: string; name: string }
export interface Achievement {
  id: string; name: string; desc: string; icon: string;
  /** unlocked when save.stats[stat] >= gte */
  cond: { stat: string; gte: number };
  reward?: { title?: string; cosmetic?: string; coins?: number };
  act?: number;
  hidden?: boolean;
}
