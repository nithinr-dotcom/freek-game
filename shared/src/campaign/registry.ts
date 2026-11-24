/**
 * Campaign registries. Later phases add a region/act/boss/species set by writing a new data file that
 * calls one register function, then importing that file once from ./index.ts.
 */
import type { ActDef, BossDef, CampaignChapter, CampaignSpecies, RegionDef, RegionId } from "./types.js";

const regions = new Map<RegionId, RegionDef>();
const acts = new Map<number, ActDef>();
const bosses = new Map<string, BossDef>();
const species = new Map<string, CampaignSpecies>();

/** register (or replace a stub of) a region */
export function registerRegion(def: RegionDef) { regions.set(def.id, def); }
export function registerAct(def: ActDef) { acts.set(def.act, def); }
export function registerBoss(def: BossDef) { bosses.set(def.id, def); }
export function registerSpecies(list: CampaignSpecies[]) { for (const s of list) species.set(s.id, s); }

export function getRegion(id: RegionId): RegionDef | undefined { return regions.get(id); }
export function regionList(): RegionDef[] { return [...regions.values()].sort((a, b) => a.act - b.act); }
export function getBoss(id: string): BossDef | undefined { return bosses.get(id); }
export function bossList(): BossDef[] { return [...bosses.values()]; }
export function getAct(n: number): ActDef | undefined { return acts.get(n); }
export function actList(): ActDef[] { return [...acts.values()].sort((a, b) => a.act - b.act); }
export function allChapters(): CampaignChapter[] { return actList().flatMap((a) => a.chapters); }
export function getChapter(id: number): CampaignChapter | undefined { return allChapters().find((c) => c.id === id); }
export function chaptersOfRegion(r: RegionId): CampaignChapter[] { return allChapters().filter((c) => c.region === r); }

export function getCampaignSpecies(id: string): CampaignSpecies | undefined { return species.get(id); }
export function campaignSpeciesList(): CampaignSpecies[] { return [...species.values()]; }
export function speciesOfRegion(r: RegionId): CampaignSpecies[] { return campaignSpeciesList().filter((s) => s.region === r); }

/** 30 chapters in total once every act is registered (6 per act) */
export const CHAPTERS_PER_ACT = 6;
export const TOTAL_ACTS = 5;
