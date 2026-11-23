/** Procedural sea monsters: segmented sea serpent + kraken with animated tentacles. */
import * as THREE from "three";
import { jitter } from "../world/models";

export interface MonsterRig {
  root: THREE.Group;
  /** t: seconds, attack: 0..1 attack animation phase (0 = idle) */
  animate(t: number, dt: number, attack: number): void;
}

const m = (color: string, emissive?: string, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, emissive: emissive ?? "#000", emissiveIntensity: ei });

export function buildSerpent(): MonsterRig {
  const root = new THREE.Group();
  const skin = m("#2e8f7a"), belly = m("#b8d98a"), spine = m("#e0663a"), eyeMat = m("#ffee55", "#ffcc00", 2.5);
  const N = 16, spacing = 1.35;
  const segs: THREE.Object3D[] = [];
  for (let i = 0; i < N; i++) {
    const r = 1.25 * (1 - (i / N) * 0.75);
    const seg = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(r, 0);
    geo.scale(1, 0.9, 1.3);
    const b = new THREE.Mesh(geo, i % 2 ? skin : m("#287d6b"));
    b.castShadow = true;
    const bl = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.8, 0), belly);
    bl.position.y = -r * 0.3;
    bl.scale.set(1, 0.7, 1.2);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, r * 1.1, 4), spine);
    sp.position.y = r * 0.9;
    sp.rotation.x = -0.4;
    seg.add(b, bl, sp);
    root.add(seg);
    segs.push(seg);
  }
  // head
  const head = new THREE.Group();
  const skull = new THREE.Mesh(jitter(new THREE.BoxGeometry(1.8, 1.3, 2.6, 2, 1, 2), 0.2, 5), skin);
  skull.castShadow = true;
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 2.2), belly);
  jaw.position.set(0, -0.75, 0.25);
  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, -0.3, -0.9);
  jaw.position.set(0, -0.3, 1.1);
  jawPivot.add(jaw);
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 3), m("#ffffff"));
    tooth.position.set(-0.55 + i * 0.27, -0.75, 1.15);
    tooth.rotation.x = Math.PI;
    head.add(tooth);
  }
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), eyeMat);
    eye.position.set(s * 0.8, 0.35, 0.6);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.2, 4), spine);
    horn.position.set(s * 0.6, 0.9, -0.6);
    horn.rotation.set(-0.9, 0, s * 0.3);
    const frill = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 3), spine);
    frill.position.set(s * 1.1, 0.1, -0.7);
    frill.rotation.set(0, 0, s * -1.2);
    head.add(eye, horn, frill);
  }
  head.add(skull, jawPivot);
  root.add(head);

  const animate = (t: number, _dt: number, attack: number) => {
    const lunge = Math.sin(Math.min(1, attack) * Math.PI);
    for (let i = 0; i < N; i++) {
      const s = segs[i];
      const ph = t * 2.2 - i * 0.55;
      s.position.set(Math.sin(ph) * 1.6 * (0.4 + i / N), Math.sin(t * 1.6 - i * 0.7) * 1.3 - 0.2 + (i < 4 ? lunge * (4 - i) * 0.9 : 0), -i * spacing - 1.2);
      s.rotation.y = Math.cos(ph) * 0.4;
    }
    head.position.set(Math.sin(t * 2.2) * 0.6, 1.1 + Math.sin(t * 1.6) * 0.5 + lunge * 4.5, 0.6 + lunge * 3);
    head.rotation.x = -0.15 + lunge * 0.7 - (attack > 0.5 ? lunge * 1.2 : 0);
    head.rotation.y = Math.cos(t * 2.2) * 0.25;
    jawPivot.rotation.x = 0.15 + lunge * 0.6 + Math.max(0, Math.sin(t * 3)) * 0.1;
  };
  animate(0, 0, 0);
  return { root, animate };
}

export function buildKraken(): MonsterRig {
  const root = new THREE.Group();
  const skin = m("#8a3b8f"), skinDark = m("#5e2466"), sucker = m("#f0a6c8"), eyeMat = m("#ffe14d", "#ffb300", 2.5), pupil = m("#111111");
  const body = new THREE.Group();
  const mantleGeo = new THREE.IcosahedronGeometry(3, 1);
  mantleGeo.scale(1, 1.6, 1);
  jitter(mantleGeo, 0.25, 9);
  const mantle = new THREE.Mesh(mantleGeo, skin);
  mantle.position.y = 4;
  mantle.castShadow = true;
  body.add(mantle);
  for (let i = 0; i < 7; i++) {
    const spot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + (i % 3) * 0.12, 0), skinDark);
    const a = i * 0.9;
    spot.position.set(Math.cos(a) * 2.5, 5 + (i % 3) * 1.1, Math.sin(a) * 2.5);
    body.add(spot);
  }
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), eyeMat);
    eye.position.set(s * 1.5, 2.6, 2.2);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.2), pupil);
    p.position.set(s * 1.6, 2.6, 2.9);
    body.add(eye, p);
  }
  root.add(body);
  const tentacles: { base: THREE.Group; segs: THREE.Group[]; phase: number }[] = [];
  const NT = 8, NS = 9;
  for (let k = 0; k < NT; k++) {
    const a = (k / NT) * Math.PI * 2;
    const base = new THREE.Group();
    base.position.set(Math.cos(a) * 2.4, 0.6, Math.sin(a) * 2.4);
    base.rotation.y = -a + Math.PI / 2;
    root.add(base);
    const segs: THREE.Group[] = [];
    let parent: THREE.Object3D = base;
    for (let i = 0; i < NS; i++) {
      const r0 = 0.65 * (1 - i / NS) + 0.08, r1 = 0.65 * (1 - (i + 1) / NS) + 0.06;
      const len = 1.3;
      const seg = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6), i % 2 ? skin : skinDark);
      cyl.position.y = len / 2;
      cyl.castShadow = i < 5;
      const suck = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.45, 5, 3), sucker);
      suck.position.set(0, len / 2, r0 * 0.75);
      seg.add(cyl, suck);
      if (i > 0) seg.position.y = 1.3;
      parent.add(seg);
      segs.push(seg);
      parent = seg;
    }
    segs[0].rotation.x = 1.1; // fan outward
    tentacles.push({ base, segs, phase: k * 0.8 });
  }
  const animate = (t: number, _dt: number, attack: number) => {
    // attack: 0..0.5 raise, 0.5..0.7 slam, then recover
    const raise = attack <= 0 ? 0 : attack < 0.5 ? attack / 0.5 : attack < 0.65 ? 1 - (attack - 0.5) / 0.15 : 0;
    const slam = attack >= 0.5 && attack < 1 ? Math.sin(((attack - 0.5) / 0.5) * Math.PI) : 0;
    body.position.y = Math.sin(t * 1.3) * 0.35 + raise * 1.2;
    body.rotation.z = Math.sin(t * 0.9) * 0.05;
    for (const tn of tentacles) {
      tn.segs[0].rotation.x = 1.3 + Math.sin(t * 1.4 + tn.phase) * 0.15 - raise * 1.0 + slam * 0.35;
      for (let i = 1; i < tn.segs.length; i++) {
        tn.segs[i].rotation.x = Math.sin(t * 2 + tn.phase - i * 0.6) * 0.22 - 0.09 - raise * 0.05 + slam * 0.2;
        tn.segs[i].rotation.z = Math.cos(t * 1.7 + tn.phase - i * 0.5) * 0.12;
      }
    }
  };
  animate(0, 0, 0);
  return { root, animate };
}
