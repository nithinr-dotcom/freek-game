import type { Client } from "colyseus";
import type { Tier, ZoneId, Species } from "@freek/shared";

export interface FishingSession {
  phase: "casting" | "waiting" | "bite" | "reeling";
  landAt: number;       // bobber hits the water
  biteAt: number;       // when the bite fires
  hookDeadline: number; // bite window end (incl. slack)
  zone: ZoneId;
  storm: boolean;
  fish?: { species: Species; weightKg: number; points: number; tier: Tier };
  difficulty: number;
  durationMs: number;
  reelStartAt: number;
  reelDeadline: number;
  maxTension: number;   // max tension reported via `reel`
}

export interface PlayerRuntime {
  client: Client;
  slot: number;
  fishing?: FishingSession;
  lastMoveAt: number;
  lastHarpoonAt: number;
  stunnedUntil: number;
  respawnAt: number;
}
