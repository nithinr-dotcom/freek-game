/**
 * Region 2: Coral Maze. A calm turquoise lagoon around Marlow's floating dock, ringed by a maze of coral channels
 * (the Reef band, r 150–285) whose walls scrape the hull; open deep water with a wreck beyond. The wall geometry
 * lives in client/src/solo/regions/coralMaze.ts (CORAL_MAZE); points here are polar (deg, r) from the dock.
 */
import { registerRegion } from "../registry.js";

const P = (deg: number, r: number, label = "") => ({ x: Math.round(Math.cos((deg * Math.PI) / 180) * r), z: Math.round(Math.sin((deg * Math.PI) / 180) * r), label });
const xz = (deg: number, r: number) => { const p = P(deg, r, ""); return { x: p.x, z: p.z }; };

const points = {
  dock: { x: 0, z: -6, label: "Marlow's Dock" },
  sunken_arch: P(215, 262, "The Sunken Arch"),
  diver_grotto: P(278, 262, "Diver's Grotto"),
  lagoon_mouth: P(330, 112, "The Lagoon"),
  maze_wreck: P(60, 174, "Brine Wreck"),
  coral_wreck: P(255, 218, "Coral Wreck"),
  deep_wreck: P(150, 345, "Deep Wreck"),
  // Into the Maze: pearls strung along the route to the arch (+ one off the path)
  pearl_1: P(110, 132, "Pearl"), pearl_2: P(140, 172), pearl_3: P(176, 178), pearl_4: P(160, 218), pearl_5: P(142, 226),
  pearl_6: P(180, 262), pearl_7: P(200, 256), pearl_8: P(95, 218),
  // Salvage Run: two crates by each wreck
  crate_1: P(54, 170), crate_2: P(68, 182), crate_3: P(249, 214), crate_4: P(262, 224), crate_5: P(146, 338), crate_6: P(156, 352),
} as Record<string, { x: number; z: number; label: string }>;
for (const k of Object.keys(points)) if (!points[k].label) points[k].label = k.startsWith("pearl") ? "Pearl" : "Crate";

registerRegion({
  id: "coral_maze",
  act: 2,
  name: "Coral Maze",
  subtitle: "Turquoise channels · coral that bites the hull",
  material: "coral",
  trophy: "titan_carapace",
  bossId: "crab_titan",
  chart: { x: 0.42, y: 0.42 },
  biome: {
    water: { shallow: "#4ff0dc", mid: "#18b6c8", deep: "#0b4a7a" },
    sky: { top: "#3fb0ec", horizon: "#d4f6ff" },
    fog: "#cdf2ff",
    fogMult: 1.1,
  },
  weather: { windBase: 0.3, stormEveryMs: 8 * 60_000, stormDurationMs: 50_000, gustEveryMs: [18_000, 36_000] },
  hazards: { coralDamage: true },
  layout: "coral_maze",
  homeDock: { x: 0, z: 0 },
  landmarks: [
    { id: "sunken_arch", name: "The Sunken Arch", x: points.sunken_arch.x, z: points.sunken_arch.z, radius: 34, kind: "arch" },
    { id: "maze_wreck", name: "Brine Wreck", x: points.maze_wreck.x, z: points.maze_wreck.z, radius: 28, kind: "wreck" },
    { id: "coral_wreck", name: "Coral Wreck", x: points.coral_wreck.x, z: points.coral_wreck.z, radius: 28, kind: "wreck" },
    { id: "deep_wreck", name: "Deep Wreck", x: points.deep_wreck.x, z: points.deep_wreck.z, radius: 30, kind: "wreck" },
  ],
  points,
  pickupSpawns: {
    pearl: [xz(20, 80), xz(70, 100), xz(160, 70), xz(230, 100), xz(300, 90), xz(10, 120), xz(250, 60), xz(120, 110), xz(195, 120), xz(350, 75)],
    crate: [xz(54, 170), xz(68, 182), xz(249, 214), xz(262, 224), xz(146, 338), xz(156, 352)],
  },
});
