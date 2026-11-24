/**
 * Endless Tide scene objects: the arena ring, fish schools (real fish models circling under a bubbling ring),
 * floating loot (coins and spilled fish) and fish that fly from a school into the boat.
 */
import * as THREE from "three";
import { TIER_INFO, type FishCardS, type Tier } from "@freek/shared";
import { surfaceRing, makeDiscMaterial } from "../world/decals";
import { waveHeight } from "../world/ocean";
import { createFish } from "../entities/fishFactory";
import { animateFish } from "../entities/fishModels";

export const ARENA = { x: 0, z: -110, r: 64 };

export class ArenaRing {
  private ring: THREE.Mesh;
  private inner: THREE.Mesh;
  private posts: THREE.Group;
  constructor(private scene: THREE.Scene) {
    this.ring = surfaceRing(ARENA.r, "#5fe0ff", 0.85, 160, 0.35);
    this.ring.position.set(ARENA.x, 0, ARENA.z);
    this.inner = surfaceRing(ARENA.r - 3, "#2a7fff", 0.35, 160, 0.1);
    this.inner.position.set(ARENA.x, 0, ARENA.z);
    this.posts = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 6);
    const mat = new THREE.MeshStandardMaterial({ color: "#163448", emissive: "#3fd0ff", emissiveIntensity: 0.9, flatShading: true });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(ARENA.x + Math.cos(a) * (ARENA.r + 1.5), 0.6, ARENA.z + Math.sin(a) * (ARENA.r + 1.5));
      m.userData.a = a;
      this.posts.add(m);
    }
    scene.add(this.ring, this.inner, this.posts);
  }
  setColor(c: string) {
    (this.ring.material as THREE.ShaderMaterial).uniforms.uColor.value.set(c);
    ((this.posts.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.set(c);
  }
  update(t: number) {
    for (const p of this.posts.children) { p.position.y = waveHeight(p.position.x, p.position.z) + 0.6 + Math.sin(t * 2 + p.userData.a * 3) * 0.15; }
  }
  dispose() { this.scene.remove(this.ring, this.inner, this.posts); }
}

// ------------------------------------------------------------------------------------------------ schools
export interface School {
  id: number; x: number; z: number; r: number;
  count: number; max: number;
  /** tier quality bonus (0 normal, 1 rich) */
  quality: number;
  golden: boolean; bounty: boolean;
  species: string[];
  vx: number; vz: number;
  group: THREE.Group; ring: THREE.Mesh; fish: THREE.Object3D[];
  t: number; splashT: number; dying: number;
}

export class Schools {
  list: School[] = [];
  private seq = 0;
  constructor(private scene: THREE.Scene, private splash: (x: number, z: number, s: number) => void) {}

  spawn(o: { x: number; z: number; count: number; species: string[]; quality?: number; golden?: boolean; bounty?: boolean }): School {
    const group = new THREE.Group();
    const color = o.bounty ? "#ff4fd8" : o.golden ? "#ffd24a" : o.quality ? "#7fffd0" : "#bff4ff";
    const r = 5.5 + Math.min(3, o.count * 0.25);
    const ring = surfaceRing(r, color, o.golden || o.bounty ? 0.95 : 0.6, 64, o.golden || o.bounty ? 0.5 : 0.25);
    group.add(ring);
    const fish: THREE.Object3D[] = [];
    const n = Math.min(6, Math.max(3, Math.ceil(o.count / 2)));
    for (let i = 0; i < n; i++) {
      const id = o.species[i % o.species.length];
      const f = createFish(id);
      const box = new THREE.Box3().setFromObject(f);
      const size = box.getSize(new THREE.Vector3());
      f.scale.multiplyScalar(1.3 / Math.max(size.x, size.y, size.z, 0.001));
      f.userData.phase = (i / n) * Math.PI * 2;
      f.userData.rad = r * (0.35 + (i % 3) * 0.18);
      f.userData.jump = -1;
      group.add(f);
      fish.push(f);
    }
    group.position.set(o.x, 0, o.z);
    this.scene.add(group);
    const s: School = {
      id: ++this.seq, x: o.x, z: o.z, r, count: o.count, max: o.count, quality: o.quality ?? 0, golden: !!o.golden, bounty: !!o.bounty,
      species: o.species, vx: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2, group, ring, fish, t: Math.random() * 10, splashT: Math.random() * 2, dying: 0,
    };
    this.list.push(s);
    this.splash(o.x, o.z, 1.2);
    return s;
  }
  /** take n fish out of a school; returns how many were there */
  take(s: School, n: number): number {
    const k = Math.min(n, s.count);
    s.count -= k;
    if (s.count <= 0 && !s.dying) { s.dying = 0.001; this.splash(s.x, s.z, 1.5); }
    // hide fish models as the school thins out
    const visible = Math.ceil((s.count / Math.max(1, s.max)) * s.fish.length);
    s.fish.forEach((f, i) => { f.visible = i < visible; });
    return k;
  }
  nearest(x: number, z: number, maxD: number, filter?: (s: School) => boolean): School | null {
    let best: School | null = null, bd = maxD;
    for (const s of this.list) {
      if (s.count <= 0 || s.dying || (filter && !filter(s))) continue;
      const d = Math.hypot(s.x - x, s.z - z) - s.r * 0.5;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  at(x: number, z: number): School | null {
    for (const s of this.list) if (s.count > 0 && !s.dying && Math.hypot(s.x - x, s.z - z) < s.r + 2.5) return s;
    return null;
  }
  get alive() { return this.list.filter((s) => s.count > 0 && !s.dying).length; }

  update(dt: number, time: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      if (s.dying) {
        s.dying += dt;
        s.group.position.y = -s.dying * 2;
        (s.ring.material as THREE.ShaderMaterial).uniforms.uOpacity.value = Math.max(0, 0.6 - s.dying);
        if (s.dying > 1) { this.scene.remove(s.group); this.list.splice(i, 1); }
        continue;
      }
      // drift, stay in the arena
      s.x += s.vx * dt; s.z += s.vz * dt;
      const dx = s.x - ARENA.x, dz = s.z - ARENA.z, d = Math.hypot(dx, dz);
      if (d > ARENA.r * 0.85) { s.vx -= (dx / d) * dt * 2; s.vz -= (dz / d) * dt * 2; }
      s.group.position.set(s.x, 0, s.z);
      const sp = 1.1 + s.quality * 0.3;
      for (const f of s.fish) {
        if (!f.visible) continue;
        const a = f.userData.phase + s.t * sp;
        const rad = f.userData.rad;
        const lx = Math.cos(a) * rad, lz = Math.sin(a) * rad;
        let y = waveHeight(s.x + lx, s.z + lz) - 0.15 + Math.sin(s.t * 3 + f.userData.phase) * 0.1;
        let pitch = 0;
        if (f.userData.jump >= 0) {
          f.userData.jump += dt;
          const k = f.userData.jump / 0.8;
          y += Math.sin(Math.min(1, k) * Math.PI) * 2.2;
          pitch = (0.5 - Math.min(1, k)) * 1.6;
          if (k >= 1) { f.userData.jump = -1; this.splash(s.x + lx, s.z + lz, 0.4); }
        }
        f.position.set(lx, y, lz);
        // tangent heading (fish models face +z)
        f.rotation.set(pitch, Math.atan2(-Math.sin(a), Math.cos(a)), 0);
        animateFish(f, time, 1.4);
      }
      s.splashT -= dt;
      if (s.splashT <= 0) {
        s.splashT = 1.2 + Math.random() * 1.8;
        const f = s.fish.filter((x) => x.visible && x.userData.jump < 0)[Math.floor(Math.random() * s.fish.length)];
        if (f) { f.userData.jump = 0; this.splash(s.x + f.position.x, s.z + f.position.z, 0.35); }
      }
    }
  }
  clear() { for (const s of this.list) this.scene.remove(s.group); this.list = []; }
}

// ------------------------------------------------------------------------------------------------ loot
export interface Loot { kind: "coin" | "fish"; x: number; z: number; value: number; card?: FishCardS; life: number; maxLife: number; mesh: THREE.Object3D; vy: number; y: number }

const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.14, 14);
const coinMat = new THREE.MeshStandardMaterial({ color: "#ffd24a", emissive: "#a87400", emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.3 });
const orbGeo = new THREE.IcosahedronGeometry(0.55, 1);

export class LootField {
  list: Loot[] = [];
  constructor(private scene: THREE.Scene) {}
  drop(kind: "coin" | "fish", x: number, z: number, value: number, card?: FishCardS, life = kind === "coin" ? 14 : 5.5) {
    let mesh: THREE.Object3D;
    if (kind === "coin") { mesh = new THREE.Mesh(coinGeo, coinMat); mesh.rotation.x = Math.PI / 2; }
    else {
      const c = TIER_INFO[(card?.tier ?? "common") as Tier].color;
      mesh = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, transparent: true, opacity: 0.95 }));
    }
    const a = Math.random() * Math.PI * 2, d = Math.random() * 3;
    const l: Loot = { kind, x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, value, card, life, maxLife: life, mesh, vy: 5 + Math.random() * 3, y: 1.5 };
    mesh.position.set(l.x, l.y, l.z);
    this.scene.add(mesh);
    this.list.push(l);
    return l;
  }
  /** move loot toward the boat inside the magnet radius; returns the picked-up ones */
  update(dt: number, time: number, bx: number, bz: number, magnet: number, pull: number): Loot[] {
    const got: Loot[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const l = this.list[i];
      l.life -= dt;
      const dx = bx - l.x, dz = bz - l.z, d = Math.hypot(dx, dz);
      if (d < magnet) { const sp = Math.min(d, (10 + (magnet - d) * 2.5) * pull * dt); l.x += (dx / (d || 1)) * sp; l.z += (dz / (d || 1)) * sp; }
      const wy = waveHeight(l.x, l.z) + 0.5;
      l.vy -= 18 * dt; l.y += l.vy * dt;
      if (l.y < wy) { l.y = wy; l.vy = 0; }
      l.mesh.position.set(l.x, l.y + Math.sin(time * 3 + i) * 0.12, l.z);
      l.mesh.rotation.z = time * 3;
      l.mesh.visible = l.life > 1.5 || Math.sin(time * 18) > 0;
      if (d < 2.6) { got.push(l); this.remove(i); continue; }
      if (l.life <= 0) this.remove(i);
    }
    return got;
  }
  private remove(i: number) { const l = this.list[i]; this.scene.remove(l.mesh); if (l.kind === "fish") ((l.mesh as THREE.Mesh).material as THREE.Material).dispose(); this.list.splice(i, 1); }
  takeAll(): Loot[] { const all = this.list.slice(); while (this.list.length) this.remove(this.list.length - 1); return all; }
}

// ------------------------------------------------------------------------------------------------ flying fish (school → boat)
interface Flyer { obj: THREE.Object3D; sx: number; sz: number; t: number; dur: number; to: () => THREE.Vector3 | null; done: () => void }
export class Flyers {
  private list: Flyer[] = [];
  constructor(private scene: THREE.Scene) {}
  launch(speciesId: string, sx: number, sz: number, to: () => THREE.Vector3 | null, done: () => void) {
    if (this.list.length > 24) { done(); return; }
    const obj = createFish(speciesId);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(1.1 / Math.max(size.x, size.y, size.z, 0.001));
    obj.position.set(sx, 0.5, sz);
    this.scene.add(obj);
    this.list.push({ obj, sx, sz, t: 0, dur: 0.55 + Math.random() * 0.2, to, done });
  }
  update(dt: number, time: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const end = f.to();
      if (!end) { this.scene.remove(f.obj); this.list.splice(i, 1); f.done(); continue; }
      const x = f.sx + (end.x - f.sx) * k, z = f.sz + (end.z - f.sz) * k;
      const y = 0.5 + (end.y + 1.5 - 0.5) * k + Math.sin(k * Math.PI) * 5;
      f.obj.rotation.set(-(0.5 - k) * 2.2, Math.atan2(end.x - f.sx, end.z - f.sz), time * 8);
      f.obj.position.set(x, y, z);
      animateFish(f.obj, time, 3);
      if (k >= 1) { this.scene.remove(f.obj); this.list.splice(i, 1); f.done(); }
    }
  }
  clear() { for (const f of this.list) { this.scene.remove(f.obj); f.done(); } this.list = []; }
}

/** a persistent hazard patch on the water (fire coral, frost fog) */
export function hazardPatch(r: number, color: string, opacity = 0.55): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(r * 2, r * 2, 20, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = makeDiscMaterial(color);
  mat.uniforms.uFill.value = 1;
  mat.uniforms.uOpacity.value = opacity;
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}
