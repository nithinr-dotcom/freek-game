/** Arcade physics for the locally controlled boat (client-authoritative movement). */
import { BOAT_MAX_SPEED, WORLD_RADIUS, DOCK_POS, type WindS } from "@freek/shared";
import { resolveObstacles } from "../world/layout";
import { clamp } from "../util";

export class LocalBoat {
  x = DOCK_POS.x; z = DOCK_POS.z; rot = 0; speed = 0;
  private angVel = 0;
  private kx = 0; private kz = 0;
  bumped = false;

  snap(x: number, z: number, rot: number) { this.x = x; this.z = z; this.rot = rot; this.speed = 0; this.kx = this.kz = 0; }
  knockback(fromX: number, fromZ: number, strength = 14) {
    const dx = this.x - fromX, dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.kx += (dx / d) * strength; this.kz += (dz / d) * strength;
    this.speed *= 0.3;
  }

  update(dt: number, throttle: number, steer: number, wind: WindS | undefined, enabled: boolean) {
    if (!enabled) { throttle = 0; steer = 0; }
    const accel = throttle > 0 ? 8.5 : 6;
    this.speed += throttle * accel * dt;
    const drag = throttle === 0 ? 0.9 : 0.35;
    this.speed -= this.speed * drag * dt;
    this.speed = clamp(this.speed, -BOAT_MAX_SPEED * 0.4, BOAT_MAX_SPEED * 0.98);
    const grip = 0.7 + 0.8 * Math.min(1, Math.abs(this.speed) / 6);
    const dir = this.speed < -0.2 ? -1 : 1;
    const targetAng = steer * 1.05 * grip * dir;
    this.angVel += (targetAng - this.angVel) * (1 - Math.exp(-5 * dt));
    this.rot += this.angVel * dt;
    let vx = Math.sin(this.rot) * this.speed, vz = Math.cos(this.rot) * this.speed;
    if (wind) {
      const w = wind.speed * (wind.gust ? 2.6 : 1.1);
      vx += Math.sin(wind.dirRad) * w;
      vz += Math.cos(wind.dirRad) * w;
    }
    vx += this.kx; vz += this.kz;
    this.kx *= Math.exp(-3 * dt); this.kz *= Math.exp(-3 * dt);
    this.x += vx * dt; this.z += vz * dt;
    const r = Math.hypot(this.x - DOCK_POS.x, this.z - DOCK_POS.z);
    const maxR = WORLD_RADIUS - 3;
    if (r > maxR) {
      this.x = DOCK_POS.x + ((this.x - DOCK_POS.x) / r) * maxR;
      this.z = DOCK_POS.z + ((this.z - DOCK_POS.z) / r) * maxR;
      this.speed *= 0.9;
    }
    const p = { x: this.x, z: this.z };
    this.bumped = resolveObstacles(p, 2.4);
    if (this.bumped) { this.x = p.x; this.z = p.z; this.speed *= 0.85; }
  }
}
