/**
 * Casual persistence (no auth): player profiles keyed by lowercase name and a
 * global hall of fame, stored as JSON in server/data/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tierRank, type FishCardS, type Tier } from "@freek/shared";

const DATA_DIR = process.env.FREEK_DATA_DIR ? path.resolve(process.env.FREEK_DATA_DIR) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");
const PROFILES_FILE = path.join(DATA_DIR, "profiles.json");
const HOF_FILE = path.join(DATA_DIR, "halloffame.json");
export const HOF_SIZE = 20;

export interface Profile { name: string; xp: number; coins: number; level: number; trophies: FishCardS[]; updatedAt: number }

let profiles: Record<string, Profile> = {};
let hallOfFame: FishCardS[] = [];
let profilesDirty = false;
const hofListeners = new Set<(entries: FishCardS[]) => void>();

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

export function loadAll() {
  profiles = readJson<Record<string, Profile>>(PROFILES_FILE, {});
  hallOfFame = readJson<FishCardS[]>(HOF_FILE, []);
  if (!Array.isArray(hallOfFame)) hallOfFame = [];
}

export const profileKey = (name: string) => name.trim().toLowerCase();

export function getProfile(name: string): Profile | undefined { return profiles[profileKey(name)]; }

export function putProfile(p: Omit<Profile, "updatedAt">) {
  profiles[profileKey(p.name)] = { ...p, trophies: p.trophies.map((c) => ({ ...c })), updatedAt: Date.now() };
  profilesDirty = true;
}

export function saveProfiles(force = false) {
  if (!profilesDirty && !force) return;
  try { writeJson(PROFILES_FILE, profiles); profilesDirty = false; } catch (e) { console.error("[persistence] save profiles failed", e); }
}

/** Sort by tier rank desc, then points desc. */
export function compareCards(a: { tier: string; points: number }, b: { tier: string; points: number }) {
  return tierRank(b.tier as Tier) - tierRank(a.tier as Tier) || b.points - a.points;
}

export function getHallOfFame(): FishCardS[] { return hallOfFame; }

/** Offer a card to the hall of fame; returns true (and notifies all rooms) if it entered. */
export function offerHallOfFame(card: FishCardS): boolean {
  if (hallOfFame.length >= HOF_SIZE && compareCards(card, hallOfFame[hallOfFame.length - 1]) >= 0) return false;
  hallOfFame = [...hallOfFame, { ...card }].sort(compareCards).slice(0, HOF_SIZE);
  if (!hallOfFame.some((c) => c.at === card.at && c.catcher === card.catcher && c.speciesId === card.speciesId)) return false;
  try { writeJson(HOF_FILE, hallOfFame); } catch (e) { console.error("[persistence] save hof failed", e); }
  for (const l of hofListeners) l(hallOfFame);
  return true;
}

export function onHallOfFameChange(fn: (entries: FishCardS[]) => void) {
  hofListeners.add(fn);
  return () => hofListeners.delete(fn);
}
