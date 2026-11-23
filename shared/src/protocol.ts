/**
 * Network contract. Room name: ROOM_NAME ("ocean").
 * Join/create options: JoinOptions. Room metadata: RoomMeta (for lobby list).
 * State is synced via Colyseus schema (see StateShape for the client-side view).
 * Discrete events go through messages below.
 */
import type { Tier } from "./fish.js";
import type { SquadId, ZoneId } from "./constants.js";
import type { MonsterKind } from "./monsters.js";

export interface JoinOptions { name: string; code?: string; isPrivate?: boolean; squad?: SquadId }
export interface RoomMeta { code: string; isPrivate: boolean; hostName: string }

// ---------- synced state (client view, mirrors server schema) ----------
export interface FishCardS { speciesId: string; tier: Tier; weightKg: number; points: number; at: number; catcher: string }
export interface MissionS { id: string; title: string; progress: number; target: number; squad: boolean }
export interface PlayerS {
  id: string; name: string; squad: SquadId;
  x: number; z: number; rot: number; speed: number;
  hp: number; sunk: boolean;
  state: "sailing" | "casting" | "waiting" | "hooked" | "reeling" | "stunned";
  bobX: number; bobZ: number;              // bobber position when casting/waiting/reeling
  level: number; xp: number; coins: number;
  unbankedPoints: number; bankedPoints: number;
  unbanked: FishCardS[];                    // carried catch (lost on sink)
  trophies: FishCardS[];                    // top 5 catches by tier then points
  missions: MissionS[];
  catches: number;
}
export interface SquadS { id: SquadId; points: number; missions: MissionS[]; kills: number }
export interface MonsterS { id: string; kind: MonsterKind; x: number; z: number; rot: number; hp: number; maxHp: number; state: "roaming" | "chasing" | "attacking" | "submerged"; targetId: string }
export interface WindS { dirRad: number; speed: number; gust: boolean }
export interface StateShape {
  code: string;
  players: Map<string, PlayerS>;
  squads: Map<SquadId, SquadS>;
  monsters: Map<string, MonsterS>;
  wind: WindS;
  storm: boolean; stormEndsAt: number; nextStormAt: number;
  serverTime: number;
}

// ---------- client -> server ----------
export type C2S = {
  move: { x: number; z: number; rot: number; speed: number };
  setSquad: { squad: SquadId };
  cast: { power: number; aimRad: number };       // power 0..1, aimRad world heading of cast
  hook: {};                                      // press after "bite"
  reel: { tension: number; progress: number };   // client-side minigame state @5Hz (server sanity checks)
  reelResult: { success: boolean; maxTension: number }; // end of minigame
  cancelFishing: {};
  harpoon: { tx: number; tz: number };           // aim point on water
  chat: { text: string };
};

// ---------- server -> client ----------
export type S2C = {
  bite: { windowMs: number };                                      // to the fisher only
  hookResult: { ok: boolean; tier?: Tier; difficulty?: number; durationMs?: number }; // ok -> start reel minigame; client hides tier ("???") until catch, tier only tunes difficulty
  catch: { card: FishCardS; zone: ZoneId; perfect: boolean; xp: number; newBest: boolean }; // to fisher
  lineSnap: {};
  announce: { kind: "legendary" | "epic" | "monster_spawn" | "monster_kill" | "storm_start" | "storm_end" | "squad_mission" | "join" | "leave" | "sunk"; text: string; color?: string; playerId?: string; x?: number; z?: number };
  missionComplete: { title: string; xp: number; coins: number; squad: boolean };
  levelUp: { level: number };
  banked: { points: number; fish: number };
  damaged: { amount: number; hp: number; byMonster: string };
  harpoonFx: { from: string; sx: number; sz: number; tx: number; tz: number; hitMonster?: string; dmg?: number };
  monsterAttack: { monsterId: string; x: number; z: number; radius: number };
  monsterLoot: { monsterId: string; cards: FishCardS[] };          // to each contributor (their card)
  hallOfFame: { entries: FishCardS[] };                             // on join + when changed
  chat: { from: string; text: string; squad: SquadId };
  error: { message: string };
};
