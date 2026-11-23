export const SERVER_PORT = 2567;
export const ROOM_NAME = "ocean";
export const MAX_PLAYERS = 12;
export const MAX_PER_SQUAD = 4;
export const WORLD_RADIUS = 450;          // playable circle, metres
export const DOCK_POS = { x: 0, z: 0 };   // dock / spawn
export const DOCK_RADIUS = 18;            // bank catch inside this ring
export const BOAT_MAX_SPEED = 14;         // m/s
export const BOAT_MAX_HP = 100;
export const RESPAWN_MS = 5000;
export const MOVE_SEND_HZ = 15;
export const HARPOON_COOLDOWN_MS = 1200;
export const HARPOON_RANGE = 60;
export const CAST_MAX_DIST = 28;
export const BITE_WINDOW_MS = 900;        // time to press hook after bite
export const STORM_EVERY_MS = 6 * 60_000;
export const STORM_DURATION_MS = 60_000;

export type ZoneId = "shallows" | "reef" | "abyss";
export const ZONES: Record<ZoneId, { name: string; minR: number; maxR: number; color: string }> = {
  shallows: { name: "Shallows", minR: 0, maxR: 140, color: "#3fd0c9" },
  reef: { name: "Reef", minR: 140, maxR: 300, color: "#2a8fbf" },
  abyss: { name: "Abyss", minR: 300, maxR: WORLD_RADIUS, color: "#0d2a5a" },
};
export function zoneAt(x: number, z: number): ZoneId {
  const r = Math.hypot(x - DOCK_POS.x, z - DOCK_POS.z);
  return r < ZONES.shallows.maxR ? "shallows" : r < ZONES.reef.maxR ? "reef" : "abyss";
}

export type SquadId = "coral" | "tide" | "kelp" | "sun";
export const SQUADS: Record<SquadId, { name: string; color: string }> = {
  coral: { name: "Coral", color: "#ff5d5d" },
  tide: { name: "Tide", color: "#3f8cff" },
  kelp: { name: "Kelp", color: "#3fcf6a" },
  sun: { name: "Sun", color: "#ffcc33" },
};
export const SQUAD_IDS = Object.keys(SQUADS) as SquadId[];

export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5));
}
/** level from total xp (level 1 at 0 xp) */
export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = xp;
  while (rest >= xpForLevel(level)) { rest -= xpForLevel(level); level++; }
  return { level, into: rest, need: xpForLevel(level) };
}
