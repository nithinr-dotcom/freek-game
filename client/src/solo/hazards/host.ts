/**
 * P3 region hazards (cold meter, ice floes, lantern fuel / darkness, deep horrors, whirlpool) behind one small host.
 * A hazard module calls registerHazard({ id, when(region), create(ctx) }) and is imported once from ./index.ts.
 * SoloMode owns one HazardHost per session and forwards update / chapter start / objective events / meters / map.
 * Bosses reach a hazard with hazardHost.current?.get<T>(id).
 */
import type * as THREE from "three";
import type { CampaignChapter, PlayerS, RegionDef, WeatherTag } from "@freek/shared";
import type { SoloNet } from "../SoloNet";
import type { SoloClock } from "../clock";
import type { Actors, MapExtra } from "../actors";
import type { ChapterRunner } from "../chapterRunner";
import type { ObjEvent } from "../objectives";
import type { LocalBoat } from "../../game/localBoat";
import type { Fishing } from "../../game/fishing";
import type { ChaseCamera } from "../../game/camera";
import type { World } from "../../world/world";
import type { Effects } from "../../fx/effects";
import type { Labels } from "../../ui/labels";
import type { Feed } from "../../ui/feed";
import type { Hud } from "../../ui/hud";
import type { ReelGame } from "../../ui/reel";
import type { Boat } from "../../entities/Boat";
import type { MonsterEntity } from "../../entities/Monster";
import type { BossFx } from "../bosses/registry";

export interface Meters { warmth: number; fuel: number; dark: boolean }

export interface HazardCtx {
  ui: HTMLElement; scene: THREE.Scene; net: SoloNet; region: RegionDef; clock: SoloClock; actors: Actors;
  local: LocalBoat; world: World; fx: Effects; labels: Labels; feed: Feed; hud: Hud; chase: ChaseCamera;
  fishing: Fishing; reel: ReelGame;
  /** the boss telegraph/fx set (line + circle telegraphs, roar, shake …) */
  bossFx: BossFx;
  /** cinematic camera pan to (x,z) for dur seconds; slow motion */
  cinematic(x: number, z: number, dur: number): void;
  slowmo(scale: number, seconds: number): void;
  boat(): Boat | undefined;
  monster(id: string): MonsterEntity | undefined;
  runner(): ChapterRunner;
}

export interface Hazard {
  readonly id: string;
  /** every frame, after SoloMode's own update (so it may adjust speedMult / fog / visibility) */
  update(dt: number, me: PlayerS, paused: boolean): void;
  /** a chapter (or free roam: null) starts or restarts */
  onStart?(def: CampaignChapter | null): void;
  /** every objective event (catch, bank, collect, reach, damage …) */
  onEvent?(ev: ObjEvent): void;
  meters?(): Partial<Meters>;
  mapExtras?(): MapExtra[];
  /** contextual HUD helper line ("" = none) */
  hint?(me: PlayerS, phase: string): string;
  /** adjust the solo weather tags used by the fish roll (aurora) */
  weather?(tags: Set<WeatherTag>): void;
  dispose?(): void;
}

interface HazardReg { id: string; when(region: RegionDef): boolean; create(ctx: HazardCtx): Hazard }
const regs: HazardReg[] = [];
export function registerHazard(r: HazardReg) { regs.push(r); }

export class HazardHost {
  readonly list: Hazard[];
  constructor(readonly ctx: HazardCtx) {
    this.list = regs.filter((r) => r.when(ctx.region)).map((r) => r.create(ctx));
    hazardHost.current = this;
  }
  get<T extends Hazard>(id: string): T | undefined { return this.list.find((h) => h.id === id) as T | undefined; }
  update(dt: number, me: PlayerS | undefined, paused: boolean) {
    for (const [id, apply] of looks) { const e = this.ctx.monster(id); if (e) { apply(e); looks.delete(id); } }
    if (me) for (const h of this.list) h.update(dt, me, paused);
    this.runTickers(dt, paused);
  }
  onStart(def: CampaignChapter | null) { for (const h of this.list) h.onStart?.(def); }
  onEvent(ev: ObjEvent) { for (const h of this.list) h.onEvent?.(ev); }
  meters(): Meters {
    const m: Meters = { warmth: 1, fuel: 1, dark: false };
    for (const h of this.list) Object.assign(m, h.meters?.() ?? {});
    return m;
  }
  mapExtras(): MapExtra[] { return this.list.flatMap((h) => h.mapExtras?.() ?? []); }
  hint(me: PlayerS | undefined, phase: string): string {
    if (!me) return "";
    for (const h of this.list) { const t = h.hint?.(me, phase); if (t) return t; }
    return "";
  }
  weather(tags: Set<WeatherTag>) { for (const h of this.list) h.weather?.(tags); }
  /** per-frame callbacks owned by bosses etc.; return false to stop */
  private tickers: ((dt: number, paused: boolean) => boolean)[] = [];
  addTicker(fn: (dt: number, paused: boolean) => boolean) { this.tickers.push(fn); }
  runTickers(dt: number, paused: boolean) { this.tickers = this.tickers.filter((f) => f(dt, paused)); }
}

/** custom monster visuals: applied once the Game has created the entity for that monster id */
const looks = new Map<string, (e: MonsterEntity) => void>();
export function queueLook(monsterId: string, apply: (e: MonsterEntity) => void) { looks.set(monsterId, apply); }

/** the session's host (bosses and the dev API use it) */
export const hazardHost: { current: HazardHost | null } = { current: null };
