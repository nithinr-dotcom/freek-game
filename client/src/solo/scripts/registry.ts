/**
 * Chapter scripts (P2+): optional per-chapter logic that plain data can't express — monster waves, "do X before Y"
 * rules, contextual hints. A script is created when its chapter starts and disposed when it ends (complete, fail,
 * retry or leaving). It sees objective events before the objective engine does, so it can break or force objectives.
 * Add: solo/scripts/<act>.ts calling registerChapterScript(chapterId, env => ({ … })), import it from ./index.ts.
 */
import type { PlayerS, RegionDef } from "@freek/shared";
import type { SoloNet } from "../SoloNet";
import type { Actors } from "../actors";
import type { SoloClock } from "../clock";
import type { ObjectiveEngine, ObjEvent } from "../objectives";

export interface ScriptEnv {
  net: SoloNet;
  actors: Actors;
  clock: SoloClock;
  region: RegionDef;
  /** the running chapter's objectives */
  obj(): ObjectiveEngine | null;
  /** seconds since the chapter started (pauses with the game) */
  elapsed(): number;
  emit(ev: ObjEvent): void;
  toast(html: string, cls?: string): void;
}

export interface ChapterScript {
  update?(dt: number): void;
  /** every objective event, before the engine sees it */
  event?(ev: ObjEvent): void;
  /** contextual helper line (HUD), "" = none */
  hint?(me: PlayerS, fishingPhase: string): string;
  dispose?(): void;
}

type Factory = (env: ScriptEnv) => ChapterScript;
const scripts = new Map<number, Factory>();
export function registerChapterScript(chapterId: number, f: Factory) { scripts.set(chapterId, f); }
export function createChapterScript(chapterId: number, env: ScriptEnv): ChapterScript | null { return scripts.get(chapterId)?.(env) ?? null; }
