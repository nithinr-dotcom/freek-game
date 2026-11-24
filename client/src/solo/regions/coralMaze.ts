/**
 * Coral Maze client: a polar maze of coral walls (4 rings with offset gaps + radial spokes) in the Reef band, a calm
 * lagoon with coral heads around the dock, the Sunken Arch and three wrecks. Coral walls are layout obstacles (the boat
 * slides along them) and contact surfaces for the "coralDamage" hazard (they scrape the hull).
 * Route notes (deg, x = cos, z = sin): lagoon → A110 → B185 → C140 → Arch (215°, r 262); Diver's Grotto (278°) via
 * A330 → B330 → C300 (dead end); exits to the deep: D20, D90, D200.
 */
import * as THREE from "three";
import { registerRegionClient } from "./registry";
import { DEFAULT_LAYOUT, addObstacle, type IslandDef, type LayoutData, type Obstacle, type RockDef } from "../../world/layout";
import { buildWreck } from "../../world/landmarks";
import { waveHeight } from "../../world/ocean";
import { jitter } from "../../world/models";
import { mulberry32 } from "../../util";
import { registerContactSurfaces } from "../hazards/contact";

/** the maze, in degrees */
export const CORAL_MAZE = {
  rings: [152, 196, 240, 284],
  gaps: [[30, 110, 270, 330], [75, 185, 250, 330], [10, 100, 140, 300], [20, 90, 200]],
  /** spokes between ring i and ring i+1 */
  spokes: [[0, 90, 200, 300], [40, 120, 220, 290], [60, 120, 240, 330]],
  gapWidth: 24,
  spacing: 3.2,
  coralR: 2.1,
};
const rad = (d: number) => (d * Math.PI) / 180;
const polar = (deg: number, r: number) => ({ x: Math.cos(rad(deg)) * r, z: Math.sin(rad(deg)) * r });

/** coral wall samples (obstacles + contact surfaces) */
export const CORAL: Obstacle[] = [];
{
  const M = CORAL_MAZE;
  M.rings.forEach((R, i) => {
    const n = Math.round((Math.PI * 2 * R) / M.spacing);
    const half = (M.gapWidth / 2 / R) * (180 / Math.PI);
    for (let k = 0; k < n; k++) {
      const deg = (k / n) * 360;
      if (M.gaps[i].some((g) => Math.abs(((deg - g + 540) % 360) - 180) < half)) continue;
      CORAL.push({ ...polar(deg, R), r: M.coralR });
    }
  });
  M.spokes.forEach((list, i) => {
    const r0 = M.rings[i], r1 = M.rings[i + 1];
    for (const deg of list) for (let r = r0 + M.spacing; r < r1 - M.spacing * 0.5; r += M.spacing) CORAL.push({ ...polar(deg, r), r: M.coralR });
  });
  // lagoon coral heads (small, scattered, away from the dock)
  const rng = mulberry32(7702);
  for (const deg of [15, 75, 120, 165, 230, 285, 315, 350]) {
    const c = polar(deg + (rng() - 0.5) * 12, 70 + rng() * 50);
    for (let j = 0; j < 3; j++) CORAL.push({ x: c.x + (rng() - 0.5) * 5, z: c.z + (rng() - 0.5) * 5, r: 1.6 + rng() * 0.8 });
  }
}

const ISLETS: IslandDef[] = [
  { ...polar(200, 88), r: 9, lagoon: 15, palms: 2, seed: 4411 },
  { ...polar(40, 102), r: 7.5, lagoon: 13, palms: 2, seed: 8812 },
];

function layout(): LayoutData {
  const rng = mulberry32(5150);
  const rocks: RockDef[] = [];
  while (rocks.length < 22) {
    const a = rng() * Math.PI * 2, r = 305 + rng() * 130;
    rocks.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 2 + rng() * 3, variant: 1 + Math.floor(rng() * 3), rot: rng() * 6 });
  }
  const pier = DEFAULT_LAYOUT.pier, lh = DEFAULT_LAYOUT.lighthouse;
  const obstacles: Obstacle[] = [
    ...ISLETS.map((i) => ({ x: i.x, z: i.z, r: i.r + 1.5 })),
    ...rocks.filter((r) => r.s > 1.4).map((r) => ({ x: r.x, z: r.z, r: r.s * 1.1 })),
    { x: lh.x, z: lh.z, r: lh.r + 1 },
    ...CORAL,
  ];
  for (let x = pier.x0; x <= pier.x1; x += 3) obstacles.push({ x, z: pier.z, r: 2.6 });
  return {
    islands: ISLETS, rocks, buoys: DEFAULT_LAYOUT.buoys.slice(), obstacles, lighthouse: { ...lh }, pier: { ...pier },
    mapDots: CORAL.map((c) => ({ x: c.x, z: c.z, r: c.r * 1.3, color: "#ff8a9a" })),
  };
}

registerContactSurfaces("coralDamage", CORAL, {
  damage: 6, cooldown: 0.9, npcDamage: 5, source: "coral", color: "#ff8a9a",
  warn: "<b>🪸 The coral scrapes your hull!</b> Steer clear of the walls.",
});

const PALETTE = ["#ff7a8a", "#ff9a5a", "#c46bff", "#ffd24a", "#ff5ad8", "#4fe0c0", "#ff6f61", "#f4a6ff"];

/** instanced coral: a rounded "brain" head per sample plus branching spikes on every other one */
function buildCoral(scene: THREE.Scene): THREE.Object3D[] {
  const rng = mulberry32(31337);
  const brainGeo = jitter(new THREE.IcosahedronGeometry(1, 1), 0.18, 3);
  const branchGeo = new THREE.ConeGeometry(0.32, 1, 5); branchGeo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.7, emissive: "#3a0a20", emissiveIntensity: 0.25 });
  const brains = new THREE.InstancedMesh(brainGeo, mat, CORAL.length);
  const nBranch = Math.ceil(CORAL.length / 2) * 2;
  const branches = new THREE.InstancedMesh(branchGeo, mat, nBranch);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  let bi = 0;
  CORAL.forEach((c, i) => {
    const k = c.r / CORAL_MAZE.coralR;
    q.setFromEuler(e.set(rng() * 0.4, rng() * 6.28, rng() * 0.4));
    m.compose(p.set(c.x, -0.6, c.z), q, s.set((2.0 + rng() * 0.8) * k, (1.4 + rng() * 1.1) * k, (2.0 + rng() * 0.8) * k));
    brains.setMatrixAt(i, m);
    brains.setColorAt(i, col.set(PALETTE[Math.floor(rng() * PALETTE.length)]));
    if (i % 2 === 0) for (let j = 0; j < 2 && bi < nBranch; j++, bi++) {
      q.setFromEuler(e.set((rng() - 0.5) * 0.7, 0, (rng() - 0.5) * 0.7));
      m.compose(p.set(c.x + (rng() - 0.5) * 2, 0.2, c.z + (rng() - 0.5) * 2), q, s.set(1, 2.2 + rng() * 2.4, 1));
      branches.setMatrixAt(bi, m);
      branches.setColorAt(bi, col.set(PALETTE[Math.floor(rng() * PALETTE.length)]));
    }
  });
  branches.count = bi;
  for (const im of [brains, branches]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); }
  return [brains, branches];
}

/** the Sunken Arch: two weathered pillars and a broken span, crusted in coral */
function buildArch(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: "#b8a98a", flatShading: true, roughness: 0.9 });
  const moss = new THREE.MeshStandardMaterial({ color: "#4fb39a", flatShading: true, roughness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ color: "#ffd24a", emissive: "#ffb84d", emissiveIntensity: 1.2, flatShading: true });
  for (const sx of [-7, 7]) {
    const pil = new THREE.Mesh(jitter(new THREE.CylinderGeometry(1.7, 2.4, 13, 7, 4), 0.25, sx > 0 ? 5 : 9), stone);
    pil.position.set(sx, 4.5, 0);
    g.add(pil);
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + (i % 2) * 0.4, 0), i % 2 ? moss : new THREE.MeshStandardMaterial({ color: PALETTE[i], flatShading: true }));
      c.position.set(sx + Math.cos(i * 1.7) * 2, 0.5 + i * 2.4, Math.sin(i * 1.7) * 1.8);
      g.add(c);
    }
  }
  const span = new THREE.Mesh(jitter(new THREE.TorusGeometry(7, 1.5, 6, 14, Math.PI * 0.86), 0.2, 13), stone);
  span.position.y = 11; span.rotation.z = 0.04;
  g.add(span);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), glow);
  gem.position.set(0, 17.6, 0);
  g.add(gem);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; } });
  g.userData.gem = gem;
  return g;
}

registerRegionClient({
  id: "coral_maze",
  layout,
  decorate(scene, def) {
    const objs: THREE.Object3D[] = buildCoral(scene);
    // Sunken Arch (faces the dock), pillars are solid
    const lm = def.landmarks.find((l) => l.id === "sunken_arch")!;
    const arch = buildArch();
    const face = Math.atan2(lm.x, lm.z);
    arch.position.set(lm.x, -1, lm.z);
    arch.rotation.y = face + Math.PI / 2;
    scene.add(arch); objs.push(arch);
    // the arch spans the channel: pillars sit along the radial line (local x after the rotation)
    const len = Math.hypot(lm.x, lm.z) || 1, ax = lm.x / len, az = lm.z / len;
    for (const s of [-7, 7]) addObstacle({ x: lm.x + ax * s, z: lm.z + az * s, r: 2.8 });
    // wrecks
    for (const w of def.landmarks.filter((l) => l.kind === "wreck")) {
      const wr = buildWreck();
      wr.position.set(w.x, 0, w.z);
      wr.rotation.y = Math.atan2(w.x, w.z);
      scene.add(wr); objs.push(wr);
      addObstacle({ x: w.x, z: w.z, r: 6.5 });
    }
    // glints over the coral walls + a warm light in the arch
    const light = new THREE.PointLight("#ffd28a", 0, 50, 1.4);
    light.position.set(lm.x, 8, lm.z);
    scene.add(light); objs.push(light);
    const gem = arch.userData.gem as THREE.Mesh;
    return {
      update(_dt, time, night) {
        gem.rotation.y = time * 0.8;
        gem.position.y = 17.6 + Math.sin(time * 1.5) * 0.4;
        light.intensity = 6 + night * 16 + Math.sin(time * 2) * 2;
        arch.position.y = -1 + waveHeight(lm.x, lm.z) * 0.15;
      },
      dispose() { scene.remove(...objs); },
    };
  },
});

