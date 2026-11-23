/** Fishing line (curved) + bobber for one boat. Driven by the player's fishing state. */
import * as THREE from "three";
import { waveHeight } from "../world/ocean";

const SEG = 24;
const bobberGeo = (() => {
  const g = new THREE.SphereGeometry(0.28, 8, 6);
  return g;
})();

export class FishingLine {
  private line: THREE.Line;
  private bobber = new THREE.Group();
  private target = new THREE.Vector3();
  private cur = new THREE.Vector3();
  private flightT = 1;
  private flightFrom = new THREE.Vector3();
  private tip = new THREE.Vector3();
  private visible = false;
  private biteT = 0;
  /** 'idle' | 'flying/waiting' | 'bite' | 'reel' */
  mode: "none" | "wait" | "bite" | "reel" = "none";

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: SEG }, () => new THREE.Vector3()));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#f4f1e8", transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    const top = new THREE.Mesh(bobberGeo, new THREE.MeshStandardMaterial({ color: "#e8352c", flatShading: true, roughness: 0.5 }));
    top.scale.y = 0.8; top.position.y = 0.1;
    const bot = new THREE.Mesh(bobberGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.5 }));
    bot.scale.set(0.95, 0.6, 0.95); bot.position.y = -0.1;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), new THREE.MeshStandardMaterial({ color: "#222" }));
    stick.position.y = 0.4;
    this.bobber.add(top, bot, stick);
    this.line.visible = this.bobber.visible = false;
    scene.add(this.line, this.bobber);
  }

  /** show the line with bobber at (x,z); triggers cast flight when it first appears */
  show(x: number, z: number, tipWorld: THREE.Vector3) {
    if (!this.visible) {
      this.visible = true;
      this.flightT = 0;
      this.flightFrom.copy(tipWorld);
      this.cur.copy(tipWorld);
    }
    this.target.set(x, 0, z);
  }
  hide() {
    this.visible = false;
    this.mode = "none";
    this.line.visible = this.bobber.visible = false;
  }
  bite() { this.biteT = 0; this.mode = "bite"; }
  get isVisible() { return this.visible; }
  /** true once the bobber has landed (for splash) */
  onLand: (() => void) | null = null;

  update(dt: number, t: number, tipWorld: THREE.Vector3) {
    if (!this.visible) return;
    this.tip.copy(tipWorld);
    this.line.visible = this.bobber.visible = true;
    let tx = this.target.x, tz = this.target.z;
    if (this.mode === "reel") {
      tx += Math.sin(t * 3.1) * 1.2 + Math.sin(t * 7.3) * 0.4;
      tz += Math.cos(t * 2.7) * 1.2;
    }
    const wy = waveHeight(tx, tz);
    let ty = wy + 0.05;
    if (this.mode === "bite") {
      this.biteT += dt;
      ty -= 0.45 + Math.abs(Math.sin(this.biteT * 22)) * 0.25;
    } else if (this.mode === "reel") {
      ty -= 0.3 + Math.abs(Math.sin(t * 15)) * 0.2;
    }
    if (this.flightT < 1) {
      const wasFlying = this.flightT < 1;
      this.flightT = Math.min(1, this.flightT + dt / 0.75);
      const k = this.flightT;
      this.cur.lerpVectors(this.flightFrom, new THREE.Vector3(tx, ty, tz), k);
      this.cur.y += Math.sin(k * Math.PI) * (4 + this.flightFrom.distanceTo(this.target) * 0.15);
      if (wasFlying && this.flightT >= 1) this.onLand?.();
    } else {
      this.cur.set(tx, ty, tz);
    }
    this.bobber.position.copy(this.cur);
    this.bobber.rotation.z = Math.sin(t * 2) * 0.15;
    // curve: quadratic bezier with sag (less when reeling = taut)
    const sag = this.mode === "reel" ? 0.3 : this.flightT < 1 ? 0.5 : 2.2;
    const mid = new THREE.Vector3().lerpVectors(this.tip, this.cur, 0.5);
    mid.y -= sag;
    const attr = this.line.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < SEG; i++) {
      const u = i / (SEG - 1);
      const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      let y = a * this.tip.y + b * mid.y + c * this.cur.y;
      const x = a * this.tip.x + b * mid.x + c * this.cur.x;
      const z = a * this.tip.z + b * mid.z + c * this.cur.z;
      if (this.mode === "reel") y += Math.sin(u * Math.PI) * Math.sin(t * 40) * 0.04;
      attr.setXYZ(i, x, Math.max(y, u > 0.9 ? y : waveHeight(x, z) + 0.05), z);
    }
    attr.needsUpdate = true;
  }

  dispose() { this.scene.remove(this.line, this.bobber); this.line.geometry.dispose(); }
}
