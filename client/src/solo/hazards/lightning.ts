/**
 * Lightning strikes (Stormbreak Strait; any region with `hazards.lightning`). While a storm rages — or while a boss or
 * chapter script forces it — bolts fall every few seconds: a yellow circle telegraph (≥0.8 s, usually 1.4 s) marks
 * the spot, then the bolt hits. Inside the circle: hull damage, knockback and a `{ t: "lightning_hit" }` objective
 * event (breaks `no_lightning_hits`). NPC boats inside take damage too.
 * API: `activeHazard<LightningHazard>("lightning")?.force(on, opts)` / `.strikeAt(x, z)`.
 */
import * as THREE from "three";
import { sfx } from "../../audio";
import { registerHazard, type Hazard, type HazardEnv } from "./registry";

export interface LightningOpts {
  /** seconds between strikes [min, max] */
  every: [number, number];
  /** telegraph seconds (clamped to ≥ 0.8) */
  warn: number;
  radius: number;
  damage: number;
  /** share of strikes aimed at (just ahead of) the player */
  aimed: number;
}
const STORM: LightningOpts = { every: [2.6, 5.2], warn: 1.4, radius: 7, damage: 16, aimed: 0.55 };

interface Bolt { mesh: THREE.Group; t: number }

export class LightningHazard implements Hazard {
  opts: LightningOpts = { ...STORM };
  private forced: Partial<LightningOpts> | null = null;
  private next = 3;
  private pending: { x: number; z: number; t: number; dur: number; r: number; dmg: number }[] = [];
  private bolts: Bolt[] = [];
  private mat = new THREE.MeshBasicMaterial({ color: "#e8f4ff", transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private glow = new THREE.MeshBasicMaterial({ color: "#7fb8ff", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private light = new THREE.PointLight("#bcd8ff", 0, 120, 1.2);
  /** strikes so far (dev / tests) */
  strikes = 0;
  hits = 0;
  constructor(private env: HazardEnv) { env.scene.add(this.light); }

  /** bosses / scripts: keep lightning on regardless of the storm (null/false = back to storm-only) */
  force(on: boolean, o: Partial<LightningOpts> = {}) { this.forced = on ? o : null; if (on) this.next = Math.min(this.next, 2); }
  get active() { return !!this.forced || this.env.net.state.storm; }

  /** telegraph and strike one spot */
  strikeAt(x: number, z: number, r = this.cur.radius, warn = this.cur.warn, dmg = this.cur.damage) {
    const dur = Math.max(0.8, warn);
    this.pending.push({ x, z, t: 0, dur, r, dmg });
    this.env.tele.circle(x, z, r, dur, undefined, "#ffe14d");
  }
  private get cur(): LightningOpts { return { ...this.opts, ...(this.forced ?? {}) }; }

  update(dt: number) {
    const env = this.env;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      b.mesh.visible = b.t < 0.32 && (b.t < 0.08 || b.t > 0.14);
      if (b.t > 0.4) { env.scene.remove(b.mesh); b.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); this.bolts.splice(i, 1); }
    }
    this.light.intensity = Math.max(0, this.light.intensity - dt * 120);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t += dt;
      if (p.t >= p.dur) { this.pending.splice(i, 1); this.fire(p.x, p.z, p.r, p.dmg); }
    }
    if (!env.live() || !this.active) { this.next = Math.max(this.next, 1.5); return; }
    this.next -= dt;
    if (this.next > 0) return;
    const c = this.cur;
    this.next = c.every[0] + Math.random() * (c.every[1] - c.every[0]);
    const b = env.boat(), me = env.net.me;
    if (me.sunk) return;
    const npcs = env.npcs().filter((n) => n.alive);
    let x: number, z: number;
    const roll = Math.random();
    if (npcs.length && roll < 0.2) { const n = npcs[Math.floor(Math.random() * npcs.length)]; x = n.x + (Math.random() - 0.5) * 8; z = n.z + (Math.random() - 0.5) * 8; }
    else if (roll < c.aimed) {
      // lead the boat a little so standing still is not the only answer
      const lead = Math.min(10, Math.abs(me.speed) * c.warn * 0.5);
      x = b.x + Math.sin(me.rot) * lead + (Math.random() - 0.5) * 5;
      z = b.z + Math.cos(me.rot) * lead + (Math.random() - 0.5) * 5;
    } else { const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 35; x = b.x + Math.cos(a) * d; z = b.z + Math.sin(a) * d; }
    if (Math.hypot(x, z) < 36) return; // never inside the harbour
    this.strikeAt(x, z, c.radius, c.warn, c.damage);
  }

  private fire(x: number, z: number, r: number, dmg: number) {
    const env = this.env;
    this.strikes++;
    this.spawnBolt(x, z);
    env.sky.flash = 1;
    this.light.position.set(x, 12, z);
    this.light.intensity = 40;
    sfx.thunder(0);
    env.fx.splashAt(x, z, 2.2);
    env.fx.sparkAt(new THREE.Vector3(x, 1, z), "#e8f4ff", 50);
    const b = env.boat(), me = env.net.me;
    const d = Math.hypot(b.x - x, b.z - z);
    if (!me.sunk && d < r + 1.2) {
      this.hits++;
      env.net.damage(dmg, "lightning");
      env.emit({ t: "lightning_hit" });
      b.knockback(x, z, 10);
      env.shake(0.8);
      env.toast("<b>⚡ Lightning strike!</b> Watch for the yellow circles.", "bad");
    } else if (d < 40) env.shake(0.25);
    for (const n of env.npcs()) if (n.alive && Math.hypot(n.x - x, n.z - z) < r + 2) n.damage(Math.round(dmg * 0.8));
  }

  private spawnBolt(x: number, z: number) {
    const g = new THREE.Group();
    let px = x + (Math.random() - 0.5) * 6, py = 70, pz = z + (Math.random() - 0.5) * 6;
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) => {
      const a = new THREE.Vector3(ax, ay, az), bb = new THREE.Vector3(bx, by, bz);
      const len = a.distanceTo(bb);
      for (const [m, ww] of [[this.mat, w], [this.glow, w * 3.5]] as const) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(ww, len, ww), m);
        mesh.position.copy(a).add(bb).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bb.clone().sub(a).normalize());
        mesh.frustumCulled = false;
        g.add(mesh);
      }
    };
    const N = 9;
    for (let i = 1; i <= N; i++) {
      const k = i / N;
      const nx = x + (Math.random() - 0.5) * 7 * (1 - k), nz = z + (Math.random() - 0.5) * 7 * (1 - k), ny = 70 * (1 - k);
      seg(px, py, pz, nx, ny, nz, 0.35);
      if (i === 3 || i === 6) seg(nx, ny, nz, nx + (Math.random() - 0.5) * 12, ny - 10, nz + (Math.random() - 0.5) * 12, 0.2);
      px = nx; py = ny; pz = nz;
    }
    this.env.scene.add(g);
    this.bolts.push({ mesh: g, t: 0 });
  }

  reset() { this.pending = []; this.forced = null; this.next = 3; }
  dispose() {
    for (const b of this.bolts) this.env.scene.remove(b.mesh);
    this.env.scene.remove(this.light);
    this.bolts = []; this.pending = [];
  }
}

registerHazard("lightning", (env) => new LightningHazard(env));
