/**
 * Frozen Fjord client (P3): an island-free layout of rocks and icebergs, snowy mountain walls past the map edge and the
 * Ice Cracks landmark (an ice shelf whose cracks glow at dusk and night). Snow, aurora, cold and floes are hazards
 * (client/src/solo/hazards).
 */
import * as THREE from "three";
import { registerRegionClient } from "./registry";
import { addObstacle, DEFAULT_LAYOUT, type LayoutData, type RockDef } from "../../world/layout";
import { waveHeight } from "../../world/ocean";
import { mulberry32 } from "../../util";
import { envHost } from "../hazards/host";

const ICEBERGS = [
  { x: -95, z: -60, r: 9 }, { x: 120, z: -150, r: 11 }, { x: -210, z: -120, r: 13 }, { x: 230, z: 170, r: 12 },
  { x: -60, z: 170, r: 10 }, { x: 60, z: 300, r: 14 }, { x: -300, z: 60, r: 12 }, { x: 300, z: -60, r: 13 },
];

function layout(): LayoutData {
  const rng = mulberry32(4044);
  const rocks: RockDef[] = [];
  let tries = 0;
  while (rocks.length < 46 && tries++ < 1500) {
    const a = rng() * Math.PI * 2, rad = 55 + rng() * 380;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (ICEBERGS.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 10)) continue;
    if (Math.hypot(x - 150, z - 110) < 60) continue; // the Ice Cracks
    if (Math.hypot(x, z + 175) < 45) continue; // the boss ice sheet
    rocks.push({ x, z, s: 1 + rng() * 2.6, variant: 1 + Math.floor(rng() * 3), rot: rng() * 6.28 });
  }
  const obstacles = [...rocks.filter((r) => r.s > 1.4).map((r) => ({ x: r.x, z: r.z, r: r.s * 1.1 })), { ...DEFAULT_LAYOUT.lighthouse, r: DEFAULT_LAYOUT.lighthouse.r + 1 }];
  for (let x = DEFAULT_LAYOUT.pier.x0; x <= DEFAULT_LAYOUT.pier.x1; x += 3) obstacles.push({ x, z: DEFAULT_LAYOUT.pier.z, r: 2.6 });
  return { islands: [], rocks, buoys: DEFAULT_LAYOUT.buoys.slice(), obstacles, lighthouse: { ...DEFAULT_LAYOUT.lighthouse }, pier: { ...DEFAULT_LAYOUT.pier } };
}

function iceMat(color = "#eef8ff", emissive = "#6fb8e0", ei = 0.08) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, flatShading: true, roughness: 0.45 });
}

function buildIceberg(r: number, seed: number): THREE.Group {
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, 3, 7), iceMat("#dff2fb"));
  base.position.y = -0.5;
  g.add(base);
  for (let i = 0; i < 3; i++) {
    const h = r * (0.9 + rng() * 1.3);
    const c = new THREE.Mesh(new THREE.ConeGeometry(r * (0.45 + rng() * 0.3), h, 5 + Math.floor(rng() * 3)), iceMat(i ? "#f6fcff" : "#cfeaf7"));
    c.position.set((rng() - 0.5) * r * 0.8, h / 2, (rng() - 0.5) * r * 0.8);
    c.rotation.y = rng() * 6;
    g.add(c);
  }
  return g;
}

registerRegionClient({
  id: "frozen_fjord",
  layout,
  decorate(scene, def) {
    const objs: THREE.Object3D[] = [];
    // icebergs (solid)
    ICEBERGS.forEach((b, i) => {
      const o = buildIceberg(b.r, 90 + i * 17);
      o.position.set(b.x, 0, b.z);
      scene.add(o); objs.push(o);
      addObstacle({ x: b.x, z: b.z, r: b.r + 1 });
    });
    // snowy mountain walls beyond the map edge (the fjord)
    const rng = mulberry32(777);
    const mtn = new THREE.Group();
    const rockM = new THREE.MeshStandardMaterial({ color: "#56626e", flatShading: true, roughness: 0.95 });
    const snowM = new THREE.MeshStandardMaterial({ color: "#f4f9ff", flatShading: true, roughness: 0.8 });
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rng() * 0.1, d = 560 + rng() * 140;
      const h = 90 + rng() * 140, w = 70 + rng() * 60;
      const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6), rockM);
      m.position.set(Math.cos(a) * d, h / 2 - 8, Math.sin(a) * d);
      m.rotation.y = rng() * 6;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.42, h * 0.42, 6), snowM);
      cap.position.y = h * 0.29;
      m.add(cap);
      mtn.add(m);
    }
    scene.add(mtn); objs.push(mtn);
    // the Ice Cracks: a cracked ice shelf; the cracks glow at dusk/night (the Glacier Char feeds here)
    const lm = def.landmarks.find((l) => l.id === "ice_cracks")!;
    const shelf = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(20, 21.5, 2.2, 10), iceMat("#eaf6fc", "#9fd8ff", 0.1));
    top.position.y = 0.2;
    shelf.add(top);
    const crackMat = new THREE.MeshBasicMaterial({ color: "#5fd8ff", transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const pts: number[] = [];
    const crng = mulberry32(31);
    for (let k = 0; k < 9; k++) {
      let x = (crng() - 0.5) * 6, z = (crng() - 0.5) * 6;
      const a = crng() * Math.PI * 2;
      for (let s = 0; s < 6; s++) {
        const nx = x + Math.cos(a + (crng() - 0.5) * 1.2) * 3, nz = z + Math.sin(a + (crng() - 0.5) * 1.2) * 3;
        if (Math.hypot(nx, nz) > 19) break;
        const dx = nx - x, dz = nz - z, l = Math.hypot(dx, dz) || 1, w = 0.35;
        const px = (-dz / l) * w, pz = (dx / l) * w;
        pts.push(x + px, 0, z + pz, x - px, 0, z - pz, nx + px, 0, nz + pz, nx + px, 0, nz + pz, x - px, 0, z - pz, nx - px, 0, nz - pz);
        x = nx; z = nz;
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const cracks = new THREE.Mesh(cg, crackMat);
    cracks.position.y = 1.35;
    shelf.add(cracks);
    // glowing water ring where the char bites
    const ringMat = new THREE.MeshBasicMaterial({ color: "#ff9a6a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(21, lm.radius, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    shelf.add(ring);
    shelf.position.set(lm.x, 0, lm.z);
    scene.add(shelf); objs.push(shelf);
    addObstacle({ x: lm.x, z: lm.z, r: 21 });
    const dusk = new THREE.Color("#ff8a4a"), cold = new THREE.Color("#5fd8ff");
    return {
      update(_dt, time, night) {
        // the cracks burn orange at dusk (when the char bites) and glow blue at night
        const phase = envHost.current?.ctx.clock.phase;
        const duskK = phase === "dusk" ? 1 : 0;
        crackMat.color.copy(cold).lerp(dusk, Math.min(1, duskK * 1.6));
        crackMat.opacity = 0.5 + Math.max(duskK, night) * 0.5 * (0.8 + 0.2 * Math.sin(time * 2));
        ringMat.opacity = duskK * 0.18 * (0.7 + 0.3 * Math.sin(time * 1.5));
        shelf.position.y = waveHeight(lm.x, lm.z) * 0.15;
      },
      dispose() { for (const o of objs) scene.remove(o); },
    };
  },
});
