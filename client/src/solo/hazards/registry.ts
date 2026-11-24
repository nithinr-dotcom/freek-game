/**
 * Region hazard systems (P2+). A hazard module registers a factory under a key — normally a `RegionHazards` flag such as
 * "coralDamage" or "lightning" — and SoloMode builds one instance per flag the current region sets. Bosses and chapter
 * scripts reach a running hazard through `activeHazard(key)` (e.g. to force lightning during a boss fight).
 * Add a hazard: write solo/hazards/<name>.ts calling registerHazard(key, env => new X(env)), import it from ./index.ts.
 */
import type * as THREE from "three";
import type { RegionDef } from "@freek/shared";
import type { SoloNet } from "../SoloNet";
import type { ObjEvent } from "../objectives";
import type { NpcBoat } from "../actors";
import type { Effects } from "../../fx/effects";
import type { Labels } from "../../ui/labels";
import type { Telegraphs } from "../../fx/telegraphs";
import type { SkySystem } from "../../world/sky";

export interface HazardEnv {
  scene: THREE.Scene;
  net: SoloNet;
  fx: Effects;
  labels: Labels;
  tele: Telegraphs;
  sky: SkySystem;
  region: RegionDef;
  /** the locally simulated boat (exact position; net.me lags a little) */
  boat(): { x: number; z: number; knockback(fromX: number, fromZ: number, strength?: number): void };
  /** NPC boats of the running chapter (escort / defend) */
  npcs(): NpcBoat[];
  /** objective events (e.g. { t: "lightning_hit" }) */
  emit(ev: ObjEvent): void;
  toast(html: string, cls?: string): void;
  shake(n: number): void;
  /** hazards only act while a chapter (or free roam) is live: not during intros, cards or cinematics */
  live(): boolean;
}

export interface Hazard {
  update(dt: number, time: number): void;
  /** chapter (re)start: drop pending strikes, timers, … */
  reset?(): void;
  dispose(): void;
}

type Factory = (env: HazardEnv) => Hazard;
const factories = new Map<string, Factory>();
export function registerHazard(key: string, f: Factory) { factories.set(key, f); }

let current: HazardHost | null = null;
/** the running instance of a hazard (null when the region doesn't have it) */
export function activeHazard<T extends Hazard = Hazard>(key: string): T | null { return (current?.get(key) as T | undefined) ?? null; }

export class HazardHost {
  private list = new Map<string, Hazard>();
  constructor(private env: HazardEnv, keys: string[]) {
    for (const k of keys) { const f = factories.get(k); if (f) this.list.set(k, f(env)); }
    current = this;
  }
  get(key: string) { return this.list.get(key); }
  update(dt: number, time: number) { if (dt > 0) for (const h of this.list.values()) h.update(dt, time); }
  reset() { for (const h of this.list.values()) h.reset?.(); }
  dispose() { for (const h of this.list.values()) h.dispose(); this.list.clear(); if (current === this) current = null; }
}
