/** Third-person chase camera with mouse orbit, zoom, damping and trauma shake. */
import * as THREE from "three";
import { clamp, damp, dampAngle } from "../util";

export class ChaseCamera {
  yawOffset = 0;
  pitch = 0.32;
  dist = 17;
  private yaw = 0;
  private target = new THREE.Vector3();
  private trauma = 0;
  private idle = 0;
  private first = true;

  constructor(public readonly camera: THREE.PerspectiveCamera) {}

  orbit(dx: number, dy: number) {
    this.yawOffset -= dx * 0.005;
    this.pitch = clamp(this.pitch + dy * 0.004, 0.08, 1.25);
    this.idle = 0;
  }
  zoom(steps: number) { this.dist = clamp(this.dist * (1 + steps * 0.1), 8, 60); }
  shake(amount: number) { this.trauma = Math.min(1.2, this.trauma + amount); }

  update(dt: number, focus: THREE.Vector3, heading: number, moving: boolean) {
    this.idle += dt;
    if (moving && this.idle > 2.0) this.yawOffset = damp(this.yawOffset, 0, 1.2, dt);
    const desiredYaw = heading + this.yawOffset;
    if (this.first) { this.yaw = desiredYaw; this.target.copy(focus); this.first = false; }
    this.yaw = dampAngle(this.yaw, desiredYaw, 5, dt);
    this.target.x = damp(this.target.x, focus.x, 9, dt);
    this.target.z = damp(this.target.z, focus.z, 9, dt);
    this.target.y = damp(this.target.y, focus.y + 2.2, 4, dt);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const c = this.camera;
    c.position.set(
      this.target.x - Math.sin(this.yaw) * this.dist * cp,
      this.target.y + this.dist * sp + 1,
      this.target.z - Math.cos(this.yaw) * this.dist * cp,
    );
    c.position.y = Math.max(c.position.y, 1.5);
    c.lookAt(this.target);
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = performance.now() / 1000;
      c.rotation.z += Math.sin(t * 47) * 0.04 * s;
      c.position.x += Math.sin(t * 61) * 0.6 * s;
      c.position.y += Math.sin(t * 53 + 1) * 0.5 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.4);
    }
  }
  /** world heading the camera is looking at (same convention as player.rot) */
  get heading() { return this.yaw; }
  get focus() { return this.target; }
}
