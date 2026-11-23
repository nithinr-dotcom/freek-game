/** Transient world effects: splashes, sparks, wake, rain, light beams, harpoons, attack warnings. */
import * as THREE from "three";
import { Particles, type BurstOpts } from "./particles";
import { Wake } from "./wake";
import { Rain } from "./rain";
import { waveHeight } from "../world/ocean";
import { surfaceDisc } from "../world/decals";

interface Beam { mesh: THREE.Mesh; follow: () => THREE.Vector3 | null; t: number; life: number }
interface Harpoon { group: THREE.Group; rope: THREE.Line; from: () => THREE.Vector3 | null; s: THREE.Vector3; e: THREE.Vector3; t: number; dur: number; hit: boolean; done: boolean; onArrive: () => void; arrived: boolean }
interface Warning { mesh: THREE.Mesh; t: number; dur: number; onSlam: () => void; slammed: boolean }

export class Effects {
  readonly splash = new Particles(1400, false);
  readonly sparks = new Particles(600, true);
  readonly wake = new Wake(800);
  readonly rain = new Rain(4000);
  private beams: Beam[] = [];
  private harpoons: Harpoon[] = [];
  private warnings: Warning[] = [];
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    scene.add(this.splash.points, this.sparks.points, this.wake.mesh, this.rain.mesh);
  }

  splashAt(x: number, z: number, scale = 1, extra: BurstOpts = {}) {
    const p = this.tmp.set(x, waveHeight(x, z) + 0.2, z);
    this.splash.burst(p, { count: Math.round(28 * scale), color: "#ffffff", color2: "#a8e4ff", speed: 3.5 * scale, up: 6 * Math.sqrt(scale), size: 0.7 * Math.sqrt(scale), life: 0.9, ...extra });
    for (let i = 0; i < 3; i++) this.wake.spawn(x + (Math.random() - 0.5) * scale, z + (Math.random() - 0.5) * scale, 1.2 * scale, 1.6, 3 * scale);
  }
  sparkAt(p: THREE.Vector3, color = "#ffd36a", count = 30) {
    this.sparks.burst(p, { count, color, color2: "#ffffff", speed: 9, up: 7, gravity: 10, size: 0.5, life: 0.6 });
  }
  confettiAt(p: THREE.Vector3) {
    const cols = ["#ff4fd8", "#ffd24a", "#3fd0ff", "#7dff6a", "#ff5a1f", "#b05cff"];
    for (const c of cols) this.sparks.burst(p, { count: 25, color: c, speed: 7, up: 14, gravity: 9, size: 0.7, life: 2 });
  }

  /** tall light beam that follows a target (legendary catch) */
  beam(follow: () => THREE.Vector3 | null, color = "#ffcf6a", life = 10) {
    const geo = new THREE.CylinderGeometry(0.8, 1.6, 140, 16, 6, true);
    geo.translate(0, 70, 0);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = Math.pow(1 - pos.getY(i) / 140, 1.5); cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = k; }
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    this.beams.push({ mesh, follow, t: 0, life });
  }

  harpoon(from: () => THREE.Vector3 | null, sx: number, sz: number, tx: number, tz: number, hit: boolean, onArrive: () => void) {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), new THREE.MeshStandardMaterial({ color: "#6e4426", flatShading: true }));
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 4), new THREE.MeshStandardMaterial({ color: "#c9d2dc", metalness: 0.7, roughness: 0.3, flatShading: true }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 1.3;
    group.add(shaft, tip);
    const ropeGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 16 }, () => new THREE.Vector3()));
    const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: "#e6d3a3" }));
    rope.frustumCulled = false;
    this.scene.add(group, rope);
    const s = new THREE.Vector3(sx, waveHeight(sx, sz) + 2, sz);
    const e = new THREE.Vector3(tx, waveHeight(tx, tz) + (hit ? 1.5 : 0), tz);
    const dur = Math.max(0.18, s.distanceTo(e) / 70);
    this.harpoons.push({ group, rope, from, s, e, t: 0, dur, hit, done: false, onArrive, arrived: false });
  }

  /** red telegraph circle that fills, then calls onSlam */
  warning(x: number, z: number, radius: number, dur: number, onSlam: () => void) {
    const mesh = surfaceDisc(radius, "#ff3030");
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.warnings.push({ mesh, t: 0, dur, onSlam, slammed: false });
  }

  update(dt: number, time: number, cam: THREE.Vector3, windDir: number, windSpeed: number, storm: number) {
    this.splash.update(dt);
    this.sparks.update(dt);
    this.wake.update(dt);
    this.rain.update(time, cam, windDir, windSpeed, storm);

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const p = b.follow();
      if (p) b.mesh.position.set(p.x, 0, p.z);
      const fadeIn = Math.min(1, b.t / 0.6), fadeOut = Math.min(1, (b.life - b.t) / 2);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.22 * fadeIn * Math.max(0, fadeOut) * (0.85 + 0.15 * Math.sin(time * 8));
      b.mesh.rotation.y += dt;
      b.mesh.scale.set(1 + 0.1 * Math.sin(time * 5), 1, 1 + 0.1 * Math.sin(time * 5));
      if (b.t >= b.life) { this.scene.remove(b.mesh); b.mesh.geometry.dispose(); (b.mesh.material as THREE.Material).dispose(); this.beams.splice(i, 1); }
    }

    for (let i = this.harpoons.length - 1; i >= 0; i--) {
      const h = this.harpoons[i];
      h.t += dt;
      const k = Math.min(1, h.t / h.dur);
      const origin = h.from() ?? h.s;
      const pos = this.tmp.copy(h.s).lerp(h.e, k);
      pos.y += Math.sin(k * Math.PI) * h.s.distanceTo(h.e) * 0.12;
      if (k < 1) {
        h.group.position.copy(pos);
        const next = h.s.clone().lerp(h.e, Math.min(1, k + 0.05));
        next.y += Math.sin(Math.min(1, k + 0.05) * Math.PI) * h.s.distanceTo(h.e) * 0.12;
        h.group.lookAt(next);
      } else if (!h.arrived) {
        h.arrived = true;
        h.group.position.copy(h.e);
        h.onArrive();
      }
      // rope sags from boat to harpoon; retracts after arrival
      const retract = h.arrived ? Math.min(1, (h.t - h.dur) / 0.5) : 0;
      const end = h.group.position.clone().lerp(origin, retract);
      if (h.arrived) h.group.position.copy(end);
      const attr = h.rope.geometry.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < 16; j++) {
        const u = j / 15;
        const x = origin.x + (end.x - origin.x) * u, z = origin.z + (end.z - origin.z) * u;
        const y = origin.y + (end.y - origin.y) * u - Math.sin(u * Math.PI) * 0.8;
        attr.setXYZ(j, x, y, z);
      }
      attr.needsUpdate = true;
      if (h.arrived && retract >= 1) {
        this.scene.remove(h.group, h.rope);
        h.rope.geometry.dispose();
        this.harpoons.splice(i, 1);
      }
    }

    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.t += dt;
      const u = (w.mesh.material as THREE.ShaderMaterial).uniforms;
      u.uFill.value = Math.min(1, w.t / w.dur);
      u.uTime.value = time;
      u.uOpacity.value = w.t < w.dur ? 0.6 + 0.4 * Math.sin(time * 18) : Math.max(0, 1 - (w.t - w.dur) / 0.5);
      if (!w.slammed && w.t >= w.dur) { w.slammed = true; w.onSlam(); }
      if (w.t > w.dur + 0.5) { this.scene.remove(w.mesh); w.mesh.geometry.dispose(); (w.mesh.material as THREE.Material).dispose(); this.warnings.splice(i, 1); }
    }
  }
}
