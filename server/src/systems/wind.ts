import { STORM_DURATION_MS } from "@freek/shared";
import type { OceanRoom } from "../rooms/OceanRoom.js";
import { STORM_EVERY, rand, clamp } from "../config.js";

/** Slow wind drift, gusts every 20-40 s, and the storm cycle. */
export class WindSystem {
  private baseSpeed = 0.3;
  private targetDir = Math.random() * Math.PI * 2;
  private nextGustAt: number;
  private gustEndsAt = 0;
  private nextRetargetAt = 0;

  constructor(private room: OceanRoom) {
    const now = Date.now();
    this.nextGustAt = now + rand(20_000, 40_000);
    const s = room.state;
    s.wind.dirRad = this.targetDir;
    s.nextStormAt = now + STORM_EVERY;
  }

  update(dtMs: number, now: number) {
    const s = this.room.state;
    const w = s.wind;
    const dt = dtMs / 1000;

    // storm cycle
    if (!s.storm && now >= s.nextStormAt) {
      s.storm = true;
      s.stormEndsAt = now + STORM_DURATION_MS;
      this.room.announce({ kind: "storm_start", text: "A storm is rolling in! Rare fish are biting.", color: "#8fa3ff" });
    } else if (s.storm && now >= s.stormEndsAt) {
      s.storm = false;
      s.nextStormAt = now + STORM_EVERY;
      this.room.announce({ kind: "storm_end", text: "The storm has passed.", color: "#bfe3ff" });
    }

    // slow drift of direction + base speed
    if (now >= this.nextRetargetAt) {
      this.nextRetargetAt = now + rand(8_000, 16_000);
      this.targetDir = w.dirRad + rand(-0.8, 0.8);
      this.baseSpeed = rand(0.15, 0.5);
    }
    let dd = this.targetDir - w.dirRad;
    dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    w.dirRad = (w.dirRad + clamp(dd, -0.05 * dt, 0.05 * dt) + Math.PI * 2) % (Math.PI * 2);

    // gusts
    if (!w.gust && now >= this.nextGustAt) {
      w.gust = true;
      this.gustEndsAt = now + rand(3_000, 6_000);
    } else if (w.gust && now >= this.gustEndsAt) {
      w.gust = false;
      this.nextGustAt = now + rand(20_000, 40_000);
    }

    let target = this.baseSpeed;
    if (w.gust) target += 0.35;
    if (s.storm) target = Math.max(target, 0.8) + (w.gust ? 0.15 : 0);
    target = clamp(target, 0, 1);
    w.speed = Math.round((w.speed + (target - w.speed) * Math.min(1, dt * 0.8)) * 1000) / 1000;
  }

  /** Effective wind strength 0..1.5 (gusts count extra). */
  strength() {
    const w = this.room.state.wind;
    return w.speed * (w.gust ? 1.3 : 1);
  }
}
