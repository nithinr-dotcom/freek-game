/**
 * Client-side region registry: layout generator + landmark decorations per region id.
 * P2/P3: add solo/regions/<region>.ts that calls registerRegionClient(), import it from ./index.ts.
 * Biome colours, weather, hazards, points and landmarks themselves are data in shared/src/campaign/regions.
 */
import type * as THREE from "three";
import type { RegionDef, RegionId } from "@freek/shared";
import type { LayoutData } from "../../world/layout";

export interface RegionDecor { update(dt: number, time: number, night: number): void; dispose(): void }
export interface RegionClient {
  id: RegionId;
  /** map layout (islands, rocks, …); omitted = the original map */
  layout?: () => LayoutData;
  /** landmarks / props added to the scene when the solo game starts */
  decorate?: (scene: THREE.Scene, def: RegionDef) => RegionDecor;
}

const clients = new Map<string, RegionClient>();
export function registerRegionClient(c: RegionClient) { clients.set(c.id, c); }
export function regionClient(id: RegionId): RegionClient | undefined { return clients.get(id); }
