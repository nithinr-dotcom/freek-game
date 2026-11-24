/** Single-player save (localStorage, versioned key) + client settings. */
import { TIER_INFO, tierRank, type FishCardS, type MissionS } from "@freek/shared";

export const SAVE_KEY = "tidebreakers.solo.v1";
const SETTINGS_KEY = "tidebreakers.settings.v1";

export interface ChapterProgress {
  /** progress per objective (same order as ChapterDef.objectives) */
  progress: number[];
  elapsed: number;   // seconds of play in this chapter
  sank: boolean;
  introSeen: boolean;
}

export interface SoloSave {
  v: 1;
  name: string;
  level: number; xp: number; coins: number;
  catches: number; bankedPoints: number;
  trophies: FishCardS[];
  hof: FishCardS[];
  missions: MissionS[];
  /** current campaign chapter (1..6), 7 = free play */
  chapter: number;
  /** best stars per chapter id */
  stars: Record<number, number>;
  bestTimes: Record<number, number>;
  unlocks: { reef: boolean; abyss: boolean; harpoonUpgrade: boolean; legendaryRod: boolean };
  current: ChapterProgress;
  finished: boolean;
  createdAt: number; updatedAt: number;
}

export function newSave(name: string): SoloSave {
  return {
    v: 1, name: name || "Captain", level: 1, xp: 0, coins: 0, catches: 0, bankedPoints: 0,
    trophies: [], hof: [], missions: [], chapter: 1, stars: {}, bestTimes: {},
    unlocks: { reef: false, abyss: false, harpoonUpgrade: false, legendaryRod: false },
    current: { progress: [], elapsed: 0, sank: false, introSeen: false },
    finished: false, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

export function loadSave(): SoloSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SoloSave;
    if (!s || s.v !== 1) return null;
    // fill fields added later
    const base = newSave(s.name);
    return { ...base, ...s, unlocks: { ...base.unlocks, ...s.unlocks }, current: { ...base.current, ...s.current } };
  } catch {
    return null;
  }
}

export function writeSave(s: SoloSave) {
  s.updatedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

export function clearSave() { localStorage.removeItem(SAVE_KEY); }

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
