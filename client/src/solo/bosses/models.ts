/**
 * Procedural rigs for the Act 2–3 bosses (used through BossFx.dress). Each rig reads a small mutable `vis` object the
 * boss behaviour writes every frame (shell open, claws raised, latched, slam …), so animation follows the AI state.
 */
import * as THREE from "three";
import type { MonsterRig } from "../../entities/monsterModels";
import { jitter } from "../../world/models";

const M = (color: string, emissive = "#000000", ei = 0) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, emissive, emissiveIntensity: ei });
const shadow = (g: THREE.Object3D) => g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });

export interface TitanVis { open: number; raise: number; walk: number }

/** Crab Titan: plated carapace whose two shell halves swing open to show a glowing heart; huge claws; six legs */
export function buildCrabTitan(vis: TitanVis): MonsterRig {
  const root = new THREE.Group();
  const shellM = M("#d9532c"), shellDark = M("#9a3218"), belly = M("#f2c18a"), legM = M("#b84424"), eyeM = M("#111"), clawTip = M("#3a1a10");
  const core = M("#ffd24a", "#ffb000", 0.2);
  const body = new THREE.Group();
  body.position.y = 1.2;
  root.add(body);
  const base = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(1, 1), 0.08, 4), belly);
  base.scale.set(4.4, 1.3, 3.4);
  body.add(base);
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), core);
  heart.position.y = 1;
  body.add(heart);
  // two shell halves hinged at the sides
  const halves: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * 3.8, 0.9, 0);
    const geo = jitter(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.06, s > 0 ? 7 : 8);
    geo.scale(2.2, 1.7, 3.6);
    const half = new THREE.Mesh(geo, s > 0 ? shellM : shellDark);
    half.position.set(-s * 2.0, 0, 0);
    hinge.add(half);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + (i % 3) * 0.15, 0), M(["#ff7a8a", "#c46bff", "#4fe0c0", "#ffd24a", "#f4f0ff"][i]));
      b.position.set(-s * (1.2 + (i % 3) * 0.7), 1.2 + (i % 2) * 0.3, -2.4 + i * 1.2);
      hinge.add(b);
    }
    body.add(hinge);
    halves.push(hinge);
  }
  // eye stalks
  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 5), legM);
    stalk.position.set(s * 0.9, 1.6, 3.1);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 7, 5), eyeM);
    eye.position.set(s * 0.9, 2.5, 3.1);
    body.add(stalk, eye);
  }
  // claws on arms
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 3.2, 0.6, 2.6);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 3.4, 6), legM);
    upper.rotation.x = Math.PI / 2; upper.position.z = 1.7;
    const claw = new THREE.Group();
    claw.position.z = 3.6;
    const palm = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(1, 1), 0.08, s > 0 ? 2 : 3), shellM);
    palm.scale.set(1.3, 1.1, 1.8);
    const finA = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 5), clawTip); finA.rotation.x = Math.PI / 2; finA.position.set(0.45 * s, 0.35, 2);
    const finB = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.0, 5), clawTip); finB.rotation.x = Math.PI / 2; finB.position.set(-0.25 * s, -0.35, 1.8);
    claw.add(palm, finA, finB);
    arm.add(upper, claw);
    body.add(arm);
    arms.push(arm);
  }
  // legs
  const legs: { g: THREE.Group; s: number; i: number }[] = [];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.position.set(s * 3.6, 0.2, -1.6 + i * 1.5);
    const l1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 3, 5), legM);
    l1.position.set(s * 1.4, 0.4, 0); l1.rotation.z = s * 1.1;
    const l2 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.6, 5), legM);
    l2.position.set(s * 2.8, -0.9, 0); l2.rotation.z = Math.PI + s * 0.4;
    g.add(l1, l2);
    body.add(g);
    legs.push({ g, s, i });
  }
  shadow(root);
  const animate = (t: number, _dt: number, attack: number) => {
    const open = vis.open, raise = Math.max(vis.raise, attack > 0 ? Math.sin(attack * Math.PI) : 0);
    halves.forEach((hg, k) => { hg.rotation.z = (k === 0 ? 1 : -1) * open * 1.05; });
    core.emissiveIntensity = 0.2 + open * (2.2 + Math.sin(t * 12) * 0.6);
    heart.scale.setScalar(1 + open * 0.15 * Math.sin(t * 10));
    arms.forEach((a, k) => { a.rotation.x = -raise * 1.0 + Math.sin(t * 1.3 + k) * 0.05; a.rotation.y = (k === 0 ? 1 : -1) * (0.2 - raise * 0.25); });
    body.position.y = 1.2 + Math.sin(t * 1.1) * 0.15 + raise * 0.6;
    for (const L of legs) L.g.rotation.y = Math.sin(t * 9 * Math.max(0.15, vis.walk) + L.i * 2 + (L.s > 0 ? 0 : Math.PI)) * 0.35 * vis.walk;
  };
  animate(0, 0, 0);
  return { root, animate };
}

export interface CrabVis { latched: boolean }
/** small brood crab (P2 minion) */
export function buildCrabling(vis: CrabVis, color = "#ff7a3d"): MonsterRig {
  const root = new THREE.Group();
  const shell = M(color), dark = M("#7a2a10");
  const body = new THREE.Group();
  root.add(body);
  const b = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(1, 1), 0.08, 11), shell);
  b.scale.set(1.2, 0.55, 0.95);
  body.add(b);
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 5), dark);
    c.rotation.x = Math.PI / 2; c.position.set(s * 0.8, 0.1, 1.1);
    body.add(c);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 4), dark);
      l.position.set(s * 1.25, -0.2, -0.5 + i * 0.5); l.rotation.z = s * 1.0;
      body.add(l);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 5, 4), M("#111"));
    eye.position.set(s * 0.3, 0.55, 0.85);
    body.add(eye);
  }
  shadow(root);
  return {
    root,
    animate(t) {
      body.position.y = (vis.latched ? 1.5 : 0.3) + Math.abs(Math.sin(t * 14)) * 0.12;
      body.rotation.z = Math.sin(t * 16) * (vis.latched ? 0.2 : 0.08);
    },
  };
}

export interface TentacleVis { slam: number; hurt: number; phase: number }
/** Storm Kraken tentacle: a tapering, sucker-lined column rising from the water; slams toward its facing (+z) */
export function buildTentacle(vis: TentacleVis): MonsterRig {
  const root = new THREE.Group();
  const skin = M("#5a3a9a"), skin2 = M("#3c2470"), sucker = M("#f0a6c8"), glow = M("#8fd0ff", "#4fa0ff", 1.2);
  const segs: THREE.Group[] = [];
  const N = 10;
  let parent: THREE.Object3D = root;
  for (let i = 0; i < N; i++) {
    const r0 = 1.15 * (1 - i / N) + 0.12, r1 = 1.15 * (1 - (i + 1) / N) + 0.1;
    const seg = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1.5, 7), i % 2 ? skin : skin2);
    cyl.position.y = 0.75;
    const s = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.4, 5, 3), sucker);
    s.position.set(0, 0.75, r0 * 0.8);
    seg.add(cyl, s);
    if (i % 3 === 1) { const g = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.25, 5, 3), glow); g.position.set(0, 0.75, -r0 * 0.85); seg.add(g); }
    seg.position.y = i === 0 ? -1 : 1.5;
    parent.add(seg);
    segs.push(seg);
    parent = seg;
  }
  shadow(root);
  return {
    root,
    animate(t) {
      const sl = vis.slam;
      for (let i = 0; i < N; i++) {
        const k = i / N;
        segs[i].rotation.x = Math.sin(t * 1.8 + vis.phase - i * 0.5) * 0.12 + sl * (i < 3 ? 0.28 : 0.12) - (1 - sl) * 0.02 * i * (vis.hurt > 0 ? -2 : 1);
        segs[i].rotation.z = Math.cos(t * 1.3 + vis.phase - i * 0.4) * 0.1 * (1 - k * 0.5);
      }
      root.position.y = vis.hurt > 0 ? -vis.hurt * 0.6 : 0;
    },
  };
}
