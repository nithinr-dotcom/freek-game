/** Single-player save v2 (localStorage, versioned key) with migration from v1, plus client settings. */
import {
  TIER_INFO, tierRank, GEAR_SLOTS, DEFAULT_COSMETICS, levelFromXp,
  type FishCardS, type MissionS, type MaterialId, type GearSlot, type CosmeticKind, type RegionId, type Grade, type CampaignMode, type BountyDef,
} from "@freek/shared";

export const SAVE_KEY = "tidebreakers.solo.v2";
export const SAVE_KEY_V1 = "tidebreakers.solo.v1";
const SETTINGS_KEY = "tidebreakers.settings.v1";

export interface ChapterRecord { done: boolean; stars: number; grade?: Grade; bestTime?: number; fails: number; assistOffered?: boolean }
export interface BountyBoardSave { list: BountyDef[]; active: string | null; seq: number; done: number }
export interface CodexEntry { n: number; recordKg: number; first: number }

export interface SoloSave {
  v: 2;
  name: string;
  level: number; xp: number; coins: number;
  catches: number; bankedPoints: number;
  trophies: FishCardS[];
  hof: FishCardS[];
  missions: MissionS[];
  materials: Partial<Record<MaterialId, number>>;
  gear: Record<GearSlot, number>;
  skills: Record<string, number>;
  bait: Record<string, number>;
  baitEquipped: string | null;
  codex: Record<string, CodexEntry>;
  achievements: Record<string, number>;
  stats: Record<string, number>;
  titles: string[];
  title: string;
  cosmetics: string[];
  equipped: Record<CosmeticKind, string>;
  bossesBeaten: string[];
  campaign: {
    region: RegionId;
    unlockedRegions: RegionId[];
    chapters: Record<number, ChapterRecord>;
    /** chapter being played (restarts from its start, or the boss checkpoint, on reload) */
    current: { chapterId: number; introSeen: boolean; checkpointPhase: number } | null;
    /** P4: difficulty the chapters are played on (Sea Chart selector); records above are Normal */
    mode?: CampaignMode;
    /** P4: best grade/stars/time per chapter on Hard and Legendary */
    modeRecords?: Partial<Record<"hard" | "legendary", Record<number, ChapterRecord>>>;
  };
  /** P4 Bounty Board, per region: the 3 posted bounties, the accepted one, a sequence for ids */
  bounties?: Partial<Record<RegionId, BountyBoardSave>>;
  /** solo clock, hour 0..24 */
  clockHour: number;
  flags: {
    migratedFromV1?: boolean; oldCampaign?: boolean; seenWorkshop?: boolean;
    /** P3 finale (chapter 30 beaten): campaign done, Free Play in every region, Hard mode unlocked (P4 implements Hard) */
    campaignDone?: boolean; freePlayAll?: boolean; hardUnlocked?: boolean;
    /** P4: every chapter cleared on Hard (or Legendary); the ending has been seen (credits replay) */
    legendaryUnlocked?: boolean; creditsSeen?: boolean;
  };
  createdAt: number; updatedAt: number;
}

export function newSave(name: string): SoloSave {
  return {
    v: 2, name: name || "Captain", level: 1, xp: 0, coins: 0, catches: 0, bankedPoints: 0,
    trophies: [], hof: [], missions: [],
    materials: {}, gear: Object.fromEntries(GEAR_SLOTS.map((s) => [s, 1])) as Record<GearSlot, number>,
    skills: {}, bait: {}, baitEquipped: null, codex: {}, achievements: {}, stats: {},
    titles: ["deckhand"], title: "deckhand",
    cosmetics: Object.values(DEFAULT_COSMETICS), equipped: { ...DEFAULT_COSMETICS },
    bossesBeaten: [],
    campaign: { region: "shallows_bay", unlockedRegions: ["shallows_bay"], chapters: {}, current: null },
    clockHour: 10,
    flags: {},
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

/** v1 shape (only the fields we carry over) */
interface SaveV1 { v: 1; name: string; xp: number; level: number; coins: number; catches: number; bankedPoints: number; trophies: FishCardS[]; hof: FishCardS[]; missions: MissionS[]; finished: boolean; chapter: number; createdAt: number }

/** v1 -> v2: keep level, xp, coins, trophies, catches; restart at Act 1; old-campaign achievement if v1 was finished */
export function migrateV1(o: SaveV1): SoloSave {
  const s = newSave(o.name);
  s.xp = o.xp ?? 0; s.level = levelFromXp(s.xp).level; s.coins = o.coins ?? 0;
  s.catches = o.catches ?? 0; s.bankedPoints = o.bankedPoints ?? 0;
  s.trophies = o.trophies ?? []; s.hof = o.hof ?? []; s.missions = o.missions ?? [];
  s.stats.fish = s.catches;
  for (const c of [...s.trophies, ...s.hof]) {
    const e = s.codex[c.speciesId] ?? { n: 0, recordKg: 0, first: c.at };
    e.n = Math.max(e.n, 1); e.recordKg = Math.max(e.recordKg, c.weightKg);
    s.codex[c.speciesId] = e;
  }
  s.flags.migratedFromV1 = true;
  if (o.finished || (o.chapter ?? 1) > 6) { s.flags.oldCampaign = true; s.stats.oldCampaign = 1; }
  s.createdAt = o.createdAt ?? Date.now();
  return s;
}

function fill(s: SoloSave): SoloSave {
  const base = newSave(s.name);
  return {
    ...base, ...s,
    gear: { ...base.gear, ...s.gear }, equipped: { ...base.equipped, ...s.equipped },
    campaign: { ...base.campaign, ...s.campaign }, flags: { ...s.flags }, stats: { ...s.stats },
  };
}

export function loadSave(): SoloSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as SoloSave;
      if (s && s.v === 2) return fill(s);
    }
    const raw1 = localStorage.getItem(SAVE_KEY_V1);
    if (raw1) {
      const o = JSON.parse(raw1);
      if (o && o.v === 1) {
        const s = migrateV1(o as SaveV1);
        writeSave(s);
        return s;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSave(s: SoloSave) {
  s.updatedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

/** New Game: erase v2 (the v1 save is left untouched but no longer migrated) */
export function clearSave() { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY_V1); }

export function sortCards(cards: FishCardS[]): FishCardS[] {
  return cards.slice().sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || b.weightKg - a.weightKg);
}
export function tierColor(c: FishCardS) { return TIER_INFO[c.tier].color; }

// ------------------------------------------------------------------ settings (both modes)
export type GraphicsSetting = "auto" | "low" | "high";
export interface Settings { volume: number; camSensitivity: number; graphics: GraphicsSetting }
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return {
      volume: typeof s.volume === "number" ? s.volume : 0.8,
      camSensitivity: typeof s.camSensitivity === "number" ? s.camSensitivity : 1,
      graphics: s.graphics === "low" || s.graphics === "high" ? s.graphics : "auto",
    };
  } catch {
    return { volume: 0.8, camSensitivity: 1, graphics: "auto" };
  }
}
export function saveSettings(s: Settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
