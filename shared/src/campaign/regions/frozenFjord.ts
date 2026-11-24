/** Region 4: Frozen Fjord (P3). Snow, aurora nights, drifting ice floes and the cold meter. */
import { registerRegion } from "../registry.js";

const ring = (n: number, r0: number, r1: number, seed: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + seed;
    const r = r0 + ((i * 53 + seed * 100) % 100) / 100 * (r1 - r0);
    return { x: Math.round(Math.cos(a) * r), z: Math.round(Math.sin(a) * r) };
  });

registerRegion({
  id: "frozen_fjord",
  act: 4,
  name: "Frozen Fjord",
  subtitle: "Ice floes · aurora nights · bitter cold",
  material: "icepearl",
  trophy: "leviathan_heart",
  bossId: "ice_leviathan",
  chart: { x: 0.7, y: 0.22 },
  biome: {
    water: { shallow: "#7fc4d8", mid: "#3f7f9e", deep: "#0c2a44" },
    sky: { top: "#7fa8d8", horizon: "#e4f0fa" },
    fog: "#e4f0fa",
    fogMult: 0.8,
  },
  // storms here are blizzards (snow, faster cold drain)
  weather: { windBase: 0.45, stormEveryMs: 5 * 60_000, stormDurationMs: 90_000, gustEveryMs: [18_000, 36_000], aurora: true },
  hazards: { iceFloes: true, cold: true },
  layout: "frozen_fjord",
  homeDock: { x: 0, z: 0 },
  landmarks: [
    { id: "lighthouse", name: "Marlow's Lighthouse", x: -30, z: 26, radius: 30, kind: "lighthouse" },
    { id: "ice_cracks", name: "The Ice Cracks", x: 150, z: 110, radius: 46, kind: "other" },
  ],
  points: {
    dock: { x: 0, z: -6, label: "Fjord Dock" },
    heater_1: { x: 70, z: -95, label: "Heater Buoy I" },
    heater_2: { x: -60, z: -190, label: "Heater Buoy II" },
    heater_3: { x: 95, z: -250, label: "Heater Buoy III" },
    heater_4: { x: 190, z: 30, label: "Heater Buoy IV" },
    heater_5: { x: -170, z: 70, label: "Heater Buoy V" },
    heater_6: { x: -120, z: 240, label: "Heater Buoy VI" },
    ice_cracks: { x: 150, z: 110, label: "The Ice Cracks" },
    north_camp: { x: -40, z: -330, label: "Northern Camp" },
    ice_sheet: { x: 0, z: -175, label: "The Ice Sheet" },
  },
  pickupSpawns: {
    pearl: ring(12, 60, 260, 0.4),
    fuel: ring(8, 50, 200, 1.7),
  },
});
