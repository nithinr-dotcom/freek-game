/** Boat cosmetics (paint, sail, flag) and titles. */
import type { Cosmetic, CosmeticKind, TitleDef } from "./types.js";

export const COSMETICS: Cosmetic[] = [
  { id: "paint_harbour", kind: "paint", name: "Harbour Blue", color: "#3f8cff" },
  { id: "paint_shell", kind: "paint", name: "Shell White", color: "#f4ecdc", color2: "#e0b08a" },
  { id: "paint_bay", kind: "paint", name: "Bay Teal", color: "#2fbfae", color2: "#f2c14e" },
  { id: "paint_serpent", kind: "paint", name: "Serpent Scale", color: "#2e8f7a", color2: "#e0663a" },
  { id: "paint_gold", kind: "paint", name: "Sunset Gold", color: "#ffbe2e", color2: "#b05cff" },
  { id: "sail_canvas", kind: "sail", name: "Canvas", color: "#f3ead2" },
  { id: "sail_moon", kind: "sail", name: "Moonlit Sail", color: "#3b4f9a", color2: "#cfe0ff", pattern: "star" },
  { id: "sail_tide", kind: "sail", name: "Tidebreaker Sail", color: "#ffd24a", color2: "#0b2240", pattern: "wave" },
  { id: "sail_crimson", kind: "sail", name: "Crimson Sail", color: "#d9433b", color2: "#ffd24a", pattern: "stripe" },
  { id: "flag_tide", kind: "flag", name: "Tide Pennant", color: "#3f8cff" },
  { id: "flag_fang", kind: "flag", name: "Fang Banner", color: "#1d3b2f", color2: "#e8f5d0", pattern: "skull" },
  { id: "flag_star", kind: "flag", name: "Star Flag", color: "#b05cff", color2: "#ffd24a", pattern: "star" },
  { id: "flag_bait", kind: "flag", name: "Wriggler Flag", color: "#ff7a3d", color2: "#ffe7a0", pattern: "stripe" },
];
export const COSMETICS_BY_ID: Record<string, Cosmetic> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const DEFAULT_COSMETICS: Record<CosmeticKind, string> = { paint: "paint_harbour", sail: "sail_canvas", flag: "flag_tide" };

export const TITLES: TitleDef[] = [
  { id: "deckhand", name: "Deckhand" },
  { id: "angler", name: "Angler" },
  { id: "night_fisher", name: "Night Fisher" },
  { id: "baitmaster", name: "Baitmaster" },
  { id: "shipwright", name: "Shipwright" },
  { id: "serpent_slayer", name: "Serpent Slayer" },
  { id: "untouchable", name: "Untouchable" },
  { id: "bay_master", name: "Master of the Bay" },
  { id: "old_salt", name: "Old Salt" },
  { id: "streaker", name: "Steady Streak" },
  { id: "perfectionist", name: "Perfectionist" },
];
export const TITLES_BY_ID: Record<string, TitleDef> = Object.fromEntries(TITLES.map((t) => [t.id, t]));
