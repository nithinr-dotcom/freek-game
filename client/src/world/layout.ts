/** Deterministic world layout (same on every client): islands, rocks, buoys, obstacles. */
import { DOCK_POS, ZONES, WORLD_RADIUS } from "@freek/shared";
import { mulberry32 } from "../util";

export interface IslandDef { x: number; z: number; r: number; lagoon: number; palms: number; seed: number }
export interface RockDef { x: number; z: number; s: number; variant: number; rot: number }
export interface Obstacle { x: number; z: number; r: number }

const rng = mulberry32(20261123);

export const ISLANDS: IslandDef[] = [];
{
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.45;
    const rad = ZONES.reef.minR + 25 + rng() * (ZONES.reef.maxR - ZONES.reef.minR - 50);
    const r = 11 + rng() * 15;
    ISLANDS.push({ x: DOCK_POS.x + Math.cos(a) * rad, z: DOCK_POS.z + Math.sin(a) * rad, r, lagoon: 14 + r * 0.6, palms: 2 + Math.floor(rng() * 4), seed: Math.floor(rng() * 1e9) });
  }
}

/** lighthouse islet next to the dock */
export const LIGHTHOUSE_POS = { x: DOCK_POS.x - 30, z: DOCK_POS.z + 26, r: 7 };
/** pier: runs along +x from the dock centre */
export const PIER = { x0: DOCK_POS.x + 9, x1: DOCK_POS.x + 30, z: DOCK_POS.z, w: 4 };

export const ROCKS: RockDef[] = [];
{
  let tries = 0;
  while (ROCKS.length < 70 && tries++ < 2000) {
    const a = rng() * Math.PI * 2;
    const rad = 45 + rng() * (WORLD_RADIUS - 60);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (ISLANDS.some((i) => Math.hypot(i.x - x, i.z - z) < i.r + 10)) continue;
    const abyss = rad > ZONES.reef.maxR;
    ROCKS.push({ x, z, s: (abyss ? 2.2 : 1.2) + rng() * (abyss ? 3 : 2), variant: Math.floor(rng() * 3) + 1, rot: rng() * Math.PI * 2 });
  }
  // a few rocks around island edges
  for (const isl of ISLANDS) {
    for (let k = 0; k < 3; k++) {
      const a = rng() * Math.PI * 2;
      const d = isl.r + 3 + rng() * 6;
      ROCKS.push({ x: isl.x + Math.cos(a) * d, z: isl.z + Math.sin(a) * d, s: 0.8 + rng() * 1.4, variant: Math.floor(rng() * 3) + 1, rot: rng() * 6 });
    }
  }
}

/** buoys marking zone borders */
export const BUOYS: { x: number; z: number; zone: "reef" | "abyss" }[] = [];
for (const [zone, r, n] of [["reef", ZONES.shallows.maxR, 28], ["abyss", ZONES.reef.maxR, 44]] as const) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.05;
    BUOYS.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, zone });
  }
}

export const OBSTACLES: Obstacle[] = [
  ...ISLANDS.map((i) => ({ x: i.x, z: i.z, r: i.r + 1.5 })),
  ...ROCKS.filter((r) => r.s > 1.4).map((r) => ({ x: r.x, z: r.z, r: r.s * 1.1 })),
  { x: LIGHTHOUSE_POS.x, z: LIGHTHOUSE_POS.z, r: LIGHTHOUSE_POS.r + 1 },
];
for (let x = PIER.x0; x <= PIER.x1; x += 3) OBSTACLES.push({ x, z: PIER.z, r: 2.6 });

/** push a circle (boat) out of obstacles; returns true if collided */
export function resolveObstacles(p: { x: number; z: number }, radius = 2.2): boolean {
  let hit = false;
  for (const o of OBSTACLES) {
    const dx = p.x - o.x, dz = p.z - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + radius;
    if (d < min && d > 0.0001) {
      p.x = o.x + (dx / d) * min;
      p.z = o.z + (dz / d) * min;
      hit = true;
    }
  }
  return hit;
}

/** A full map layout. Region layout generators (client/src/solo/regions) return one. */
export interface LayoutData {
  islands: IslandDef[]; rocks: RockDef[]; buoys: { x: number; z: number; zone: "reef" | "abyss" }[]; obstacles: Obstacle[];
  lighthouse: { x: number; z: number; r: number }; pier: { x0: number; x1: number; z: number; w: number };
  /** P2: extra marks on the minimap background (coral walls, …) */
  mapDots?: MapDot[];
}
export interface MapDot { x: number; z: number; r: number; color: string }
/** minimap background marks of the active layout (empty on the original map) */
export const MAP_DOTS: MapDot[] = [];
/** the original map (Shallows Bay; also the multiplayer ocean) */
export const DEFAULT_LAYOUT: LayoutData = {
  islands: ISLANDS.slice(), rocks: ROCKS.slice(), buoys: BUOYS.slice(), obstacles: OBSTACLES.slice(),
  lighthouse: { ...LIGHTHOUSE_POS }, pier: { ...PIER },
};
/**
 * Swap the active layout in place (the exported arrays keep their identity). Call before the World is built
 * (solo region travel reloads the page with ?solo=1&region=…). Multiplayer never calls this.
 */
export function useLayout(l: LayoutData) {
  const swap = <T>(a: T[], b: T[]) => { a.length = 0; a.push(...b); };
  swap(ISLANDS, l.islands); swap(ROCKS, l.rocks); swap(BUOYS, l.buoys); swap(OBSTACLES, l.obstacles); swap(MAP_DOTS, l.mapDots ?? []);
  Object.assign(LIGHTHOUSE_POS, l.lighthouse); Object.assign(PIER, l.pier);
}
/** add a solid circle (landmarks) */
export function addObstacle(o: Obstacle) { OBSTACLES.push(o); }
