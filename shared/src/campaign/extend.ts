/**
 * Helpers for later acts to add rewards without editing the Act 1 lists (cosmetics.ts, achievements.ts):
 * they append to the exported arrays and keep the *_BY_ID maps in sync. Call them from the act's own data files.
 */
import { COSMETICS, COSMETICS_BY_ID, TITLES, TITLES_BY_ID } from "./cosmetics.js";
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from "./achievements.js";
import type { Achievement, Cosmetic, TitleDef } from "./types.js";

export function addCosmetics(list: Cosmetic[]) { for (const c of list) if (!COSMETICS_BY_ID[c.id]) { COSMETICS.push(c); COSMETICS_BY_ID[c.id] = c; } }
export function addTitles(list: TitleDef[]) { for (const t of list) if (!TITLES_BY_ID[t.id]) { TITLES.push(t); TITLES_BY_ID[t.id] = t; } }
export function addAchievements(list: Achievement[]) { for (const a of list) if (!ACHIEVEMENTS_BY_ID[a.id]) { ACHIEVEMENTS.push(a); ACHIEVEMENTS_BY_ID[a.id] = a; } }
