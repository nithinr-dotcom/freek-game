import {
  CAST_MAX_DIST, BITE_WINDOW_MS, WORLD_RADIUS, TIER_INFO, rollFish, zoneAt, type C2S,
} from "@freek/shared";
import type { Player } from "../schema/State.js";
import type { OceanRoom } from "../rooms/OceanRoom.js";
import type { PlayerRuntime } from "../rooms/types.js";
import { BITE_DELAY_MS, HOOK_SLACK_MS, DEV_FAST, dirX, dirZ, rand, clamp, num } from "../config.js";

const CAST_FLIGHT_MS = 600;
const MAX_BOBBER_DRIFT = CAST_MAX_DIST + 14; // line breaks / reels in if the boat sails too far

/** Expected minigame length for a difficulty (sent to the client as durationMs). */
export function reelDurationMs(difficulty: number) {
  return Math.round(3500 + difficulty * 6500);
}
/** Fastest plausible landing: anything quicker is rejected as impossible. */
export function minReelMs(difficulty: number) {
  return Math.round(reelDurationMs(difficulty) * 0.55);
}

export class FishingSystem {
  constructor(private room: OceanRoom) {}

  cast(p: Player, rt: PlayerRuntime, msg: C2S["cast"]) {
    if (p.sunk || p.state !== "sailing" || rt.fishing) return;
    const power = clamp(num(msg?.power, 0.5), 0, 1);
    const aim = num(msg?.aimRad, p.rot);
    const dist = Math.max(3, power * CAST_MAX_DIST);
    // wind pushes the bobber off target (server-side)
    const w = this.room.state.wind;
    const windOff = this.room.wind.strength() * 4 * (0.6 + Math.random() * 0.4);
    let bx = p.x + dirX(aim) * dist + dirX(w.dirRad) * windOff;
    let bz = p.z + dirZ(aim) * dist + dirZ(w.dirRad) * windOff;
    // validate: never further than CAST_MAX_DIST (+ wind) and inside the world
    const dx = bx - p.x, dz = bz - p.z, d = Math.hypot(dx, dz);
    const maxD = CAST_MAX_DIST + 6;
    if (d > maxD) { bx = p.x + (dx / d) * maxD; bz = p.z + (dz / d) * maxD; }
    const r = Math.hypot(bx, bz);
    if (r > WORLD_RADIUS) { bx *= WORLD_RADIUS / r; bz *= WORLD_RADIUS / r; }

    const now = Date.now();
    const zone = zoneAt(bx, bz);
    const storm = this.room.state.storm;
    let delay = rand(BITE_DELAY_MS[0], BITE_DELAY_MS[1]);
    if (!DEV_FAST) {
      if (storm) delay *= 0.7;
      if (zone === "abyss") delay *= 0.75;
    }
    p.bobX = Math.round(bx * 100) / 100;
    p.bobZ = Math.round(bz * 100) / 100;
    p.state = "casting";
    rt.fishing = {
      phase: "casting", landAt: now + CAST_FLIGHT_MS, biteAt: now + CAST_FLIGHT_MS + delay,
      hookDeadline: 0, zone, storm, difficulty: 0, durationMs: 0, reelStartAt: 0, reelDeadline: 0, maxTension: 0,
    };
  }

  hook(p: Player, rt: PlayerRuntime) {
    const f = rt.fishing;
    if (!f) return;
    const now = Date.now();
    if (f.phase !== "bite" || now > f.hookDeadline) {
      // too early (before bite) or too late: fish spooked
      this.room.sendTo(p.id, "hookResult", { ok: false });
      this.clear(p, rt);
      return;
    }
    const storm = this.room.state.storm || f.storm;
    const rolled = rollFish({ zone: f.zone, rodLevel: Math.min(10, p.level), storm });
    const tier = rolled.species.tier;
    let difficulty = TIER_INFO[tier].difficulty;
    if (this.room.state.wind.gust) difficulty += 0.05;
    if (this.room.state.storm) difficulty += 0.03;
    difficulty = Math.round(clamp(difficulty, 0, 1) * 100) / 100;
    f.fish = { ...rolled, tier };
    f.difficulty = difficulty;
    f.durationMs = reelDurationMs(difficulty);
    f.reelStartAt = now;
    f.reelDeadline = now + f.durationMs * 4 + 20_000;
    f.phase = "reeling";
    p.state = "reeling";
    this.room.sendTo(p.id, "hookResult", { ok: true, tier, difficulty, durationMs: f.durationMs });
  }

  reel(rt: PlayerRuntime, msg: C2S["reel"]) {
    const f = rt.fishing;
    if (!f || f.phase !== "reeling") return;
    f.maxTension = Math.max(f.maxTension, clamp(num(msg?.tension), 0, 1));
  }

  reelResult(p: Player, rt: PlayerRuntime, msg: C2S["reelResult"]) {
    const f = rt.fishing;
    if (!f || f.phase !== "reeling" || !f.fish) return;
    const elapsed = Date.now() - f.reelStartAt;
    const success = !!msg?.success && elapsed >= minReelMs(f.difficulty);
    if (msg?.success && !success) console.warn(`[fishing] rejected too-fast reel from ${p.name}: ${elapsed}ms < ${minReelMs(f.difficulty)}ms`);
    if (!success) {
      this.room.sendTo(p.id, "lineSnap", {});
      this.clear(p, rt);
      return;
    }
    const maxTension = Math.max(clamp(num(msg?.maxTension, 1), 0, 1), f.maxTension);
    const perfect = maxTension < 0.5;
    const fish = f.fish;
    const zone = f.zone;
    const storm = f.storm || this.room.state.storm;
    this.clear(p, rt);
    this.room.landFish(p, fish, zone, perfect, storm);
  }

  cancel(p: Player, rt: PlayerRuntime) {
    if (!rt.fishing) return;
    this.clear(p, rt);
  }

  /** Abort fishing because of an external event (stun, sink): reeling snaps the line. */
  interrupt(p: Player, rt: PlayerRuntime) {
    if (!rt.fishing) return;
    if (rt.fishing.phase === "reeling" || rt.fishing.phase === "bite") this.room.sendTo(p.id, "lineSnap", {});
    this.clear(p, rt);
  }

  clear(p: Player, rt: PlayerRuntime) {
    rt.fishing = undefined;
    if (p.state !== "stunned") p.state = "sailing";
  }

  update(now: number) {
    for (const [id, rt] of this.room.runtime) {
      const f = rt.fishing;
      if (!f) continue;
      const p = this.room.state.players.get(id);
      if (!p) continue;
      // boat sailed away from the bobber
      if (f.phase !== "reeling" && Math.hypot(p.x - p.bobX, p.z - p.bobZ) > MAX_BOBBER_DRIFT) {
        if (f.phase === "bite") this.room.sendTo(id, "hookResult", { ok: false });
        this.clear(p, rt);
        continue;
      }
      if (f.phase === "casting" && now >= f.landAt) {
        f.phase = "waiting";
        p.state = "waiting";
      }
      if (f.phase === "waiting" && now >= f.biteAt) {
        f.phase = "bite";
        f.hookDeadline = now + BITE_WINDOW_MS + HOOK_SLACK_MS;
        p.state = "hooked";
        this.room.sendTo(id, "bite", { windowMs: BITE_WINDOW_MS });
      } else if (f.phase === "bite" && now > f.hookDeadline) {
        this.room.sendTo(id, "hookResult", { ok: false });
        this.clear(p, rt);
      } else if (f.phase === "reeling" && now > f.reelDeadline) {
        this.room.sendTo(id, "lineSnap", {});
        this.clear(p, rt);
      }
    }
  }
}
