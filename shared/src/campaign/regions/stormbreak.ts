/**
 * Region 3: Stormbreak Strait. Grey open water between sea stacks, a permanent strong wind with frequent gusts,
 * storms more often than not (with telegraphed lightning strikes, client/src/solo/hazards/lightning.ts) and big waves.
 * Wrecks hold storm glass; the supply ship moors in the reef for "Hold the Line"; marker buoys for "Gust Rider".
 */
import { registerRegion } from "../registry.js";

const P = (deg: number, r: number, label = "") => ({ x: Math.round(Math.cos((deg * Math.PI) / 180) * r), z: Math.round(Math.sin((deg * Math.PI) / 180) * r), label });
const xz = (deg: number, r: number) => { const p = P(deg, r); return { x: p.x, z: p.z }; };

const points: Record<string, { x: number; z: number; label: string }> = {
  dock: { x: 0, z: -6, label: "Marlow's Dock" },
  north_wreck: P(80, 228, "Gale Wreck"),
  south_wreck: P(250, 255, "Splintered Wreck"),
  east_wreck: P(335, 182, "Mast Wreck"),
  far_wreck: P(165, 330, "Drowned Brig"),
  supply_moor: P(300, 205, "Supply Ship mooring"),
  buoy_1: P(25, 176, "Marker Buoy"), buoy_2: P(118, 205, "Marker Buoy"), buoy_3: P(205, 168, "Marker Buoy"),
  // Lighthouse Down: storm glass washed up by the wrecks
  glass_1: P(74, 236, "Storm Glass"), glass_2: P(258, 262, "Storm Glass"), glass_3: P(341, 190, "Storm Glass"), glass_4: P(160, 338, "Storm Glass"), glass_5: P(244, 246, "Storm Glass"),
  kraken_deep: P(120, 360, "The Kraken's Deep"),
};

registerRegion({
  id: "stormbreak",
  act: 3,
  name: "Stormbreak Strait",
  subtitle: "Endless gales · lightning · giant waves",
  material: "stormglass",
  trophy: "kraken_beak",
  bossId: "storm_kraken",
  chart: { x: 0.64, y: 0.68 },
  biome: {
    water: { shallow: "#4d8c9c", mid: "#2b5f75", deep: "#0e2638" },
    sky: { top: "#56616d", horizon: "#a8b3bc" },
    fog: "#9aa6b0",
    fogMult: 0.85,
  },
  // storms 75 s on / 45 s off; a gust every 6–12 s (Stormscale Tuna only bites in gusts)
  weather: { windBase: 0.78, stormEveryMs: 45_000, stormDurationMs: 75_000, gustEveryMs: [6_000, 12_000] },
  hazards: { lightning: true },
  layout: "stormbreak",
  homeDock: { x: 0, z: 0 },
  landmarks: [
    { id: "north_wreck", name: "Gale Wreck", x: points.north_wreck.x, z: points.north_wreck.z, radius: 30, kind: "wreck" },
    { id: "south_wreck", name: "Splintered Wreck", x: points.south_wreck.x, z: points.south_wreck.z, radius: 30, kind: "wreck" },
    { id: "east_wreck", name: "Mast Wreck", x: points.east_wreck.x, z: points.east_wreck.z, radius: 30, kind: "wreck" },
    { id: "far_wreck", name: "Drowned Brig", x: points.far_wreck.x, z: points.far_wreck.z, radius: 32, kind: "wreck" },
  ],
  points,
  pickupSpawns: {
    stormglass: [xz(74, 236), xz(258, 262), xz(341, 190), xz(160, 338), xz(244, 246), xz(86, 220)],
    crate: [xz(84, 236), xz(240, 262), xz(330, 175)],
  },
});
