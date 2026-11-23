import { STORM_EVERY_MS, MONSTER_SPAWN_EVERY_MS } from "@freek/shared";

/** DEV_FAST=1 shortens timers for testing. */
export const DEV_FAST = process.env.DEV_FAST === "1";

export const TICK_MS = 50; // 20 Hz simulation
export const BITE_DELAY_MS: [number, number] = DEV_FAST ? [500, 1000] : [2000, 8000];
export const STORM_EVERY = DEV_FAST ? 90_000 : STORM_EVERY_MS;
export const FIRST_MONSTER_MS = DEV_FAST ? 10_000 : MONSTER_SPAWN_EVERY_MS;
export const MONSTER_EVERY = DEV_FAST ? 30_000 : MONSTER_SPAWN_EVERY_MS;
export const HOOK_SLACK_MS = 350;   // latency slack on the bite window
export const STUN_MS = 1500;
export const SAVE_EVERY_MS = 30_000;
export const DOCK_REGEN_PER_S = 6;
/** Heading convention for every angle (rot, aimRad, wind dirRad): direction = (sin a, cos a) in (x, z). */
export const dirX = (a: number) => Math.sin(a);
export const dirZ = (a: number) => Math.cos(a);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
