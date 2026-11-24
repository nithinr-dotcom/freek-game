/** Region 5: Abyss Trench (P3). Endless night; lantern fuel sets how far you can see; deep horrors; the Maelstrom. */
import { registerRegion } from "../registry.js";

const ring = (n: number, r0: number, r1: number, seed: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + seed;
    const r = r0 + ((i * 41 + seed * 100) % 100) / 100 * (r1 - r0);
    return { x: Math.round(Math.cos(a) * r), z: Math.round(Math.sin(a) * r) };
  });

registerRegion({
  id: "abyss_trench",
  act: 5,
  name: "Abyss Trench",
  subtitle: "Endless night · lantern fuel · deep horrors",
  material: "abyssink",
  trophy: "maelstrom_core",
  bossId: "maelstrom_eye",
  chart: { x: 0.88, y: 0.5 },
  biome: {
    water: { shallow: "#1a3a5a", mid: "#0c1f3a", deep: "#03081a" },
    sky: { top: "#05081a", horizon: "#0d1430" },
    fog: "#050914",
    fogMult: 0.5,
  },
  weather: { windBase: 0.25, stormEveryMs: 7 * 60_000, stormDurationMs: 50_000, gustEveryMs: [25_000, 50_000], endlessNight: true },
  hazards: { darkness: true },
  layout: "abyss_trench",
  homeDock: { x: 0, z: 0 },
  landmarks: [
    { id: "lighthouse", name: "Marlow's Lighthouse", x: -30, z: 26, radius: 30, kind: "lighthouse" },
    { id: "glow_reef", name: "The Glow Reef", x: -150, z: -170, radius: 46, kind: "reef" },
  ],
  points: {
    dock: { x: 0, z: -6, label: "Trench Dock" },
    // the reach marker sits on the reef's rim (its coral heart is solid)
    glow_reef: { x: -150, z: -152, label: "The Glow Reef" },
    maelstrom_edge: { x: 120, z: -300, label: "The Maelstrom's Edge" },
    maelstrom: { x: 70, z: -215, label: "The Maelstrom" },
  },
  pickupSpawns: {
    // lantern fuel along the way to the Glow Reef (chapter 25) and scattered elsewhere
    fuel: [
      { x: -20, z: -55 }, { x: -55, z: -80 }, { x: -40, z: -125 }, { x: -95, z: -110 }, { x: -115, z: -140 },
      { x: -85, z: -195 }, { x: 40, z: -90 }, { x: 70, z: 60 }, ...ring(6, 150, 260, 0.9),
    ],
    pearl: ring(10, 60, 260, 2.1),
  },
});
