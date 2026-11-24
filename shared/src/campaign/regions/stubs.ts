/**
 * Placeholder entries for regions 2–5 so the Sea Chart can show them (locked). P2/P3 replace each with a
 * full file (regions/coralMaze.ts …) that calls registerRegion() with the same id; import it after this file.
 */
import { registerRegion } from "../registry.js";
import type { RegionDef, RegionId, MaterialId } from "../types.js";

function stub(id: RegionId, act: number, name: string, subtitle: string, material: MaterialId, trophy: MaterialId, bossId: string, chart: { x: number; y: number }, water: string, sky: string): RegionDef {
  return {
    id, act, name, subtitle, material, trophy, bossId, chart, stub: true,
    biome: { water: { shallow: water, mid: water, deep: "#0a1a33" }, sky: { top: sky, horizon: "#c9d6e0" }, fog: "#c9d6e0", fogMult: 1 },
    weather: { windBase: 0.35, stormEveryMs: 6 * 60_000, stormDurationMs: 60_000, gustEveryMs: [20_000, 40_000] },
    hazards: {}, layout: "shallows_bay", homeDock: { x: 0, z: 0 }, landmarks: [], points: {}, pickupSpawns: {},
  };
}

registerRegion(stub("coral_maze", 2, "Coral Maze", "Turquoise channels · coral that bites the hull", "coral", "titan_carapace", "crab_titan", { x: 0.42, y: 0.42 }, "#36e0d0", "#46b4e8"));
registerRegion(stub("stormbreak", 3, "Stormbreak Strait", "Endless gales · lightning · giant waves", "stormglass", "kraken_beak", "storm_kraken", { x: 0.64, y: 0.68 }, "#3a6f8a", "#5b6672"));
registerRegion(stub("frozen_fjord", 4, "Frozen Fjord", "Ice floes · aurora nights · bitter cold", "icepearl", "leviathan_heart", "ice_leviathan", { x: 0.7, y: 0.22 }, "#7fb7d0", "#9fc4e8"));
registerRegion(stub("abyss_trench", 5, "Abyss Trench", "Endless night · lantern fuel · deep horrors", "abyssink", "maelstrom_core", "maelstrom_eye", { x: 0.88, y: 0.5 }, "#0d1a3a", "#101a30"));

/** boss display names for locked regions on the chart */
export const BOSS_NAMES: Record<string, string> = {
  reef_serpent: "Reef Serpent", crab_titan: "Crab Titan", storm_kraken: "Storm Kraken", ice_leviathan: "Ice Leviathan", maelstrom_eye: "Maelstrom Eye",
};
