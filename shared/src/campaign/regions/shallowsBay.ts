/** Region 1: Shallows Bay (the original map). */
import { registerRegion } from "../registry.js";

const ring = (n: number, r0: number, r1: number, seed: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + seed;
    const r = r0 + ((i * 37 + seed * 100) % 100) / 100 * (r1 - r0);
    return { x: Math.round(Math.cos(a) * r), z: Math.round(Math.sin(a) * r) };
  });

registerRegion({
  id: "shallows_bay",
  act: 1,
  name: "Shallows Bay",
  subtitle: "Sunny and calm · the old wreck and the lighthouse",
  material: "shell",
  trophy: "serpent_fang",
  bossId: "reef_serpent",
  chart: { x: 0.2, y: 0.72 },
  biome: {
    water: { shallow: "#3fd0c9", mid: "#2a8fbf", deep: "#0d2a5a" },
    sky: { top: "#3a86d8", horizon: "#bfe4f5" },
    fog: "#bfe4f5",
    fogMult: 1,
  },
  weather: { windBase: 0.35, stormEveryMs: 6 * 60_000, stormDurationMs: 60_000, gustEveryMs: [20_000, 40_000] },
  hazards: {},
  layout: "shallows_bay",
  homeDock: { x: 0, z: 0 },
  landmarks: [
    { id: "lighthouse", name: "Marlow's Lighthouse", x: -30, z: 26, radius: 30, kind: "lighthouse" },
    { id: "old_wreck", name: "The Old Wreck", x: 88, z: -64, radius: 34, kind: "wreck" },
  ],
  points: {
    dock: { x: 0, z: -6, label: "Marlow's Dock" },
    old_wreck: { x: 88, z: -64, label: "The Old Wreck" },
    lighthouse: { x: -30, z: 26, label: "The Lighthouse" },
    north_buoy: { x: 0, z: -118, label: "North Buoy" },
    east_shoal: { x: 118, z: 24, label: "East Shoal" },
    west_cove: { x: -112, z: -20, label: "West Cove" },
  },
  pickupSpawns: {
    pearl: ring(12, 55, 125, 0.3),
    crate: ring(8, 60, 120, 1.1),
    fuel: ring(8, 50, 120, 2.2),
  },
});
