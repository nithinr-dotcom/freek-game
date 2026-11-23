/**
 * Procedural low-poly models (flat shaded, cohesive palette).
 * Every builder returns a fresh Object3D facing +Z, origin at waterline / ground.
 */
import * as THREE from "three";
import { mulberry32 } from "../util";

export const PALETTE = {
  wood: "#a8693d", woodDark: "#6e4426", woodLight: "#c98f5a", plank: "#b98252",
  hull: "#f1eadb", hullBottom: "#9c3b32", cabin: "#e9dcc2", roof: "#2f6f7a", window: "#20354a",
  sand: "#f0d79b", sandDark: "#d9b877", grass: "#6cc24a", grassDark: "#4f9c3a",
  rock: "#8a8f98", rockDark: "#646a74", trunk: "#8b5e34", leaf: "#3faa4a", leafDark: "#2d8a3c",
  white: "#f7f4ee", red: "#d9433b", metal: "#9aa3ad", rope: "#d9c08c", gold: "#ffd24a", lamp: "#fff2a8",
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: { emissive?: string; ei?: number; rough?: number; metal?: number; key?: string } = {}): THREE.MeshStandardMaterial {
  const key = opts.key ?? `${color}|${opts.emissive ?? ""}|${opts.ei ?? 0}|${opts.rough ?? 0.85}|${opts.metal ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? "#000000", emissiveIntensity: opts.ei ?? 0,
    });
    matCache.set(key, m);
  }
  return m;
}

/** displace vertices by a position hash so seams stay closed */
export function jitter(geo: THREE.BufferGeometry, amount: number, seed = 1, yScale = 1): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    const r1 = (h - Math.floor(h)) - 0.5;
    const h2 = Math.sin(x * 93.989 + y * 67.345 + z * 12.123 + seed * 1.7) * 24634.6345;
    const r2 = (h2 - Math.floor(h2)) - 0.5;
    const h3 = Math.sin(x * 41.31 + y * 11.13 + z * 71.71 + seed * 2.3) * 13758.937;
    const r3 = (h3 - Math.floor(h3)) - 0.5;
    pos.setXYZ(i, x + r1 * amount, y + r2 * amount * yScale, z + r3 * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], shadow = true): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.castShadow = shadow;
  me.receiveShadow = true;
  return me;
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

// ------------------------------------------------------------------ BOAT
/** hull stations along z: [z, halfWidth, deckY, keelY] */
const STATIONS: [number, number, number, number][] = [
  [-2.6, 1.2, 0.95, -0.3],
  [-1.4, 1.38, 0.9, -0.55],
  [0.4, 1.36, 0.92, -0.62],
  [1.8, 1.0, 1.02, -0.48],
  [2.8, 0.38, 1.16, -0.12],
  [3.25, 0.02, 1.25, 0.2],
];
let hullGeo: THREE.BufferGeometry | null = null;
let deckGeo: THREE.BufferGeometry | null = null;
let hullMats: THREE.MeshStandardMaterial[] | null = null;
function buildHull() {
  // 7 profile points per station: deckL, stripeL, waterL, keel, waterR, stripeR, deckR
  const prof = (s: [number, number, number, number]): THREE.Vector3[] => {
    const [z, w, yd, yk] = s;
    return [
      new THREE.Vector3(-w, yd, z), new THREE.Vector3(-w * 0.98, yd - 0.28, z), new THREE.Vector3(-w * 0.86, 0.08, z),
      new THREE.Vector3(0, yk, z),
      new THREE.Vector3(w * 0.86, 0.08, z), new THREE.Vector3(w * 0.98, yd - 0.28, z), new THREE.Vector3(w, yd, z),
    ];
  };
  const rings = STATIONS.map(prof);
  const bandOf = [0, 1, 2, 2, 1, 0]; // stripe, hull, bottom
  const pos: number[][] = [[], [], []];
  const push = (b: number, ...v: THREE.Vector3[]) => { for (const p of v) pos[b].push(p.x, p.y, p.z); };
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let j = 0; j < 6; j++) {
      const band = bandOf[j];
      push(band, a[j], b[j], b[j + 1]);
      push(band, a[j], b[j + 1], a[j + 1]);
    }
  }
  // transom (stern cap)
  const t = rings[0];
  const c = new THREE.Vector3(0, 0.3, t[0].z);
  for (let j = 0; j < 6; j++) push(bandOf[j], c, t[j + 1], t[j]);
  push(1, c, t[0], t[6]);
  const g = new THREE.BufferGeometry();
  const all: number[] = [];
  let start = 0;
  for (let b = 0; b < 3; b++) {
    all.push(...pos[b]);
    g.addGroup(start, pos[b].length / 3, b);
    start += pos[b].length / 3;
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(all, 3));
  g.computeVertexNormals();
  hullGeo = g;
  // deck: slightly below the gunwale
  const d: number[] = [];
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const [z0, w0, y0] = STATIONS[i];
    const [z1, w1, y1] = STATIONS[i + 1];
    const k = 0.9;
    const a = [-w0 * k, y0 - 0.18, z0], b = [w0 * k, y0 - 0.18, z0], c2 = [w1 * k, y1 - 0.18, z1], e = [-w1 * k, y1 - 0.18, z1];
    d.push(...a, ...c2, ...b, ...a, ...e, ...c2);
  }
  deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute("position", new THREE.Float32BufferAttribute(d, 3));
  deckGeo.computeVertexNormals();
}

export interface BoatParts { root: THREE.Group; flag: THREE.Mesh; flagMat: THREE.MeshStandardMaterial; stripeMat: THREE.MeshStandardMaterial; rodTip: THREE.Object3D; lantern: THREE.Mesh }

export function buildBoat(squadColor = "#ff5d5d"): BoatParts {
  if (!hullGeo) buildHull();
  const root = new THREE.Group();
  root.name = "boat";
  const stripeMat = new THREE.MeshStandardMaterial({ color: squadColor, flatShading: true, roughness: 0.7, side: THREE.DoubleSide });
  if (!hullMats) {
    hullMats = [
      new THREE.MeshStandardMaterial({ color: PALETTE.hull, flatShading: true, roughness: 0.75, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: PALETTE.hullBottom, flatShading: true, roughness: 0.8, side: THREE.DoubleSide }),
    ];
  }
  const hull = mesh(hullGeo!, [stripeMat, hullMats[0], hullMats[1]]);
  root.add(hull);
  root.add(mesh(deckGeo!, mat(PALETTE.plank, { key: "deckDS" })));
  mat(PALETTE.plank, { key: "deckDS" }).side = THREE.DoubleSide;
  // cabin
  const cabin = mesh(new THREE.BoxGeometry(1.7, 1.15, 1.5), mat(PALETTE.cabin));
  root.add(at(cabin, 0, 1.3, -0.9));
  const roof = mesh(new THREE.BoxGeometry(1.95, 0.16, 1.85), mat(PALETTE.roof));
  root.add(at(roof, 0, 1.95, -0.95));
  const winMat = mat(PALETTE.window, { emissive: "#3a6a8a", ei: 0.25, rough: 0.3 });
  root.add(at(mesh(new THREE.BoxGeometry(1.2, 0.42, 0.05), winMat, false), 0, 1.45, -0.13));
  root.add(at(mesh(new THREE.BoxGeometry(0.05, 0.4, 0.8), winMat, false), 0.86, 1.45, -0.9));
  root.add(at(mesh(new THREE.BoxGeometry(0.05, 0.4, 0.8), winMat, false), -0.86, 1.45, -0.9));
  // life ring
  const ring = mesh(new THREE.TorusGeometry(0.28, 0.08, 5, 10), mat(PALETTE.red));
  root.add(at(ring, -0.87, 1.25, -1.35, 0, Math.PI / 2, 0));
  // mast + boom
  const mast = mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6), mat(PALETTE.woodDark));
  root.add(at(mast, 0, 2.6, 0.9));
  root.add(at(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), mat(PALETTE.woodDark)), 0, 1.8, 0.3, Math.PI / 2, 0, 0));
  // flag (segmented plane so it can wave)
  const flagGeo = new THREE.PlaneGeometry(1.0, 0.6, 6, 2);
  flagGeo.translate(0.5, 0, 0);
  const flagMat = new THREE.MeshStandardMaterial({ color: squadColor, side: THREE.DoubleSide, flatShading: true, roughness: 0.8 });
  const flag = mesh(flagGeo, flagMat);
  flag.userData.base = Float32Array.from((flagGeo.attributes.position as THREE.BufferAttribute).array as Float32Array);
  root.add(at(flag, 0.05, 4.1, 0.9));
  // lantern on roof
  const lantern = mesh(new THREE.OctahedronGeometry(0.14), mat(PALETTE.lamp, { emissive: "#ffcc55", ei: 1.6 }), false);
  root.add(at(lantern, 0.6, 2.2, -0.4));
  // rod (starboard, near stern), angled up and out
  const rodPivot = new THREE.Group();
  at(rodPivot, 1.05, 1.0, -1.7, 0, 0, 0);
  const rodLen = 3.4;
  const rod = mesh(new THREE.CylinderGeometry(0.025, 0.05, rodLen, 5), mat(PALETTE.woodDark));
  rod.position.y = rodLen / 2;
  const reel = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 8), mat(PALETTE.metal, { metal: 0.6, rough: 0.4 }));
  at(reel, 0, 0.5, 0.08, 0, 0, Math.PI / 2);
  rodPivot.add(rod, reel);
  rodPivot.rotation.set(0.55, 0, -0.55);
  const rodTip = new THREE.Object3D();
  rodTip.position.y = rodLen;
  rodPivot.add(rodTip);
  root.add(rodPivot);
  root.userData.rodPivot = rodPivot;
  // crates/barrel on deck
  root.add(at(mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), mat(PALETTE.woodLight)), -0.75, 0.98, 1.4, 0, 0.3, 0));
  root.add(at(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 8), mat(PALETTE.wood)), 0.7, 1.0, 1.6));
  return { root, flag, flagMat, stripeMat, rodTip, lantern };
}

export function animateFlag(flag: THREE.Mesh, t: number, windStrength: number) {
  const pos = (flag.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
  const base = flag.userData.base as Float32Array;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3];
    const z = Math.sin(t * (6 + windStrength * 6) + x * 5) * 0.12 * x * (0.5 + windStrength);
    pos.setZ(i, base[i * 3 + 2] + z);
  }
  pos.needsUpdate = true;
}

// ------------------------------------------------------------------ SCENERY
export function buildPalm(seed = 1, height = 6): THREE.Group {
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  const segs = 6;
  const lean = 0.08 + rng() * 0.12;
  let x = 0, y = 0;
  let ang = 0;
  for (let i = 0; i < segs; i++) {
    const segH = height / segs;
    const r0 = 0.32 - i * 0.03, r1 = 0.3 - (i + 1) * 0.03;
    const seg = mesh(new THREE.CylinderGeometry(r1, r0, segH * 1.05, 6), mat(i % 2 ? PALETTE.trunk : "#7a5130"));
    ang += lean;
    seg.position.set(x + Math.sin(ang) * segH * 0.5, y + Math.cos(ang) * segH * 0.5, 0);
    seg.rotation.z = -ang;
    g.add(seg);
    x += Math.sin(ang) * segH;
    y += Math.cos(ang) * segH;
  }
  const top = new THREE.Group();
  top.position.set(x, y, 0);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const frond = new THREE.Group();
    const leafGeo = new THREE.ConeGeometry(0.55, 3.4, 4, 3);
    // bend the leaf downward along its length
    const p = leafGeo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const ly = p.getY(k) + 1.7; // 0..3.4
      p.setZ(k, p.getZ(k) * 0.25);
      p.setX(k, p.getX(k) - ly * ly * 0.09);
    }
    leafGeo.computeVertexNormals();
    const leaf = mesh(leafGeo, mat(i % 2 ? PALETTE.leaf : PALETTE.leafDark));
    leaf.rotation.z = -Math.PI / 2;
    leaf.position.x = 1.6;
    frond.add(leaf);
    frond.rotation.y = (i / n) * Math.PI * 2 + rng() * 0.3;
    frond.rotation.z = -0.1 - rng() * 0.25;
    top.add(frond);
  }
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.IcosahedronGeometry(0.2, 0), mat("#6b4a2a"));
    c.position.set(Math.cos(i * 2.1) * 0.3, -0.25, Math.sin(i * 2.1) * 0.3);
    top.add(c);
  }
  g.add(top);
  g.userData.top = top;
  return g;
}

export function buildRock(variant = 1, seed = 7): THREE.Group {
  const geos = [
    () => new THREE.DodecahedronGeometry(1, 0),
    () => new THREE.IcosahedronGeometry(1, 0),
    () => new THREE.ConeGeometry(1, 2.2, 5, 2),
  ];
  const geo = geos[(variant - 1) % 3]();
  if (variant === 1) geo.scale(1.3, 0.8, 1);
  if (variant === 2) geo.scale(1, 1.25, 0.9);
  jitter(geo, 0.35, seed);
  const m = mesh(geo, mat(variant === 3 ? PALETTE.rockDark : PALETTE.rock));
  m.position.y = variant === 3 ? 0.6 : 0.2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function buildIsland(radius = 16, palms = 3, seed = 3): THREE.Group {
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  // sand base: wide flattened cone going below the water
  const sandGeo = new THREE.CylinderGeometry(radius * 0.92, radius * 1.08, 3.2, 14, 2);
  jitter(sandGeo, radius * 0.06, seed, 0.3);
  const sand = mesh(sandGeo, mat(PALETTE.sand), false);
  sand.position.y = -0.8;
  g.add(sand);
  // grassy top
  const grassGeo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.78, 2.4, 11, 2);
  jitter(grassGeo, radius * 0.07, seed + 1, 0.5);
  const grass = mesh(grassGeo, mat(PALETTE.grass));
  grass.position.set((rng() - 0.5) * radius * 0.15, 1.6, (rng() - 0.5) * radius * 0.15);
  g.add(grass);
  // small hill
  const hillGeo = new THREE.ConeGeometry(radius * 0.35, 3 + radius * 0.15, 7, 2);
  jitter(hillGeo, 0.6, seed + 2);
  const hill = mesh(hillGeo, mat(PALETTE.grassDark));
  hill.position.set(grass.position.x + (rng() - 0.5) * radius * 0.2, 2.8 + radius * 0.07, grass.position.z + (rng() - 0.5) * radius * 0.2);
  g.add(hill);
  for (let i = 0; i < palms; i++) {
    const a = rng() * Math.PI * 2;
    const d = radius * (0.45 + rng() * 0.35);
    const p = buildPalm(seed + i * 13, 5 + rng() * 3);
    p.position.set(Math.cos(a) * d, d > radius * 0.6 ? 0.9 : 2.6, Math.sin(a) * d);
    p.rotation.y = rng() * Math.PI * 2;
    g.add(p);
  }
  for (let i = 0; i < 3; i++) {
    const r = buildRock(1 + (i % 2), seed + i);
    const a = rng() * Math.PI * 2;
    r.position.set(Math.cos(a) * radius * 0.85, 0.4, Math.sin(a) * radius * 0.85);
    r.scale.setScalar(0.8 + rng());
    g.add(r);
  }
  return g;
}

export function buildBarrel(): THREE.Group {
  const g = new THREE.Group();
  const b = mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10, 1), mat(PALETTE.wood));
  b.position.y = 0.52;
  g.add(b);
  for (const y of [0.18, 0.86]) {
    const hoop = mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.07, 10, 1, true), mat(PALETTE.metal, { metal: 0.5 }));
    hoop.position.y = y;
    g.add(hoop);
  }
  return g;
}
export function buildCrate(): THREE.Group {
  const g = new THREE.Group();
  const b = mesh(new THREE.BoxGeometry(1, 1, 1), mat(PALETTE.woodLight));
  b.position.y = 0.5;
  g.add(b);
  const band = mat(PALETTE.woodDark);
  for (const s of [-1, 1]) {
    g.add(at(mesh(new THREE.BoxGeometry(1.04, 0.12, 1.04), band), 0, 0.5 + s * 0.38, 0));
  }
  return g;
}
export function buildBuoy(color = "#ff6b3d"): THREE.Group {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.8, 8), mat(color));
  base.position.y = 0.1;
  const band = mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.2, 8), mat(PALETTE.white));
  band.position.y = 0.25;
  const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5), mat(PALETTE.metal));
  pole.position.y = 1.1;
  const light = mesh(new THREE.OctahedronGeometry(0.18), mat(color, { emissive: color, ei: 1.2 }), false);
  light.position.y = 1.85;
  g.add(base, band, pole, light);
  return g;
}

export function buildDock(): THREE.Group {
  const g = new THREE.Group();
  // pier along +x from 0 to 21 (caller positions it), width 4
  const len = 21, w = 4;
  for (let i = 0; i < len / 0.7; i++) {
    const shade = i % 3 === 0 ? PALETTE.woodLight : i % 3 === 1 ? PALETTE.plank : PALETTE.wood;
    const plank = mesh(new THREE.BoxGeometry(0.64, 0.16, w), mat(shade));
    plank.position.set(i * 0.7 + 0.35, 1.3, 0);
    plank.rotation.y = (Math.sin(i * 7.3) * 0.02);
    g.add(plank);
  }
  // T head
  const head = mesh(new THREE.BoxGeometry(4, 0.16, 10), mat(PALETTE.plank));
  head.position.set(len + 2, 1.3, 0);
  g.add(head);
  const postMat = mat(PALETTE.woodDark);
  for (let x = 0; x <= len; x += 3) {
    for (const z of [-w / 2, w / 2]) {
      const post = mesh(new THREE.CylinderGeometry(0.2, 0.22, 4.5, 6), postMat);
      post.position.set(x, -0.2, z);
      g.add(post);
    }
  }
  for (const z of [-4.8, 4.8, 0]) {
    const post = mesh(new THREE.CylinderGeometry(0.22, 0.24, 5, 6), postMat);
    post.position.set(len + 3.8, 0, z);
    g.add(post);
  }
  // rope rail
  const ropeMat = mat(PALETTE.rope);
  for (const z of [-w / 2, w / 2]) {
    const rail = mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 4), ropeMat, false);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(len / 2, 2.2, z);
    g.add(rail);
  }
  // props
  const c1 = buildCrate(); c1.position.set(len + 2.5, 1.38, 3.2); c1.rotation.y = 0.3; g.add(c1);
  const c2 = buildCrate(); c2.position.set(len + 2.2, 1.38, -3.3); g.add(c2);
  const c3 = buildCrate(); c3.scale.setScalar(0.7); c3.position.set(len + 2.2, 2.38, -3.3); c3.rotation.y = 0.7; g.add(c3);
  const b1 = buildBarrel(); b1.position.set(len + 1.2, 1.38, 4.2); g.add(b1);
  const b2 = buildBarrel(); b2.position.set(6, 1.38, 1.3); g.add(b2);
  // lantern posts
  for (const x of [1, 12]) {
    const p = mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 5), postMat);
    p.position.set(x, 2.5, -w / 2 + 0.2);
    const l = mesh(new THREE.OctahedronGeometry(0.22), mat(PALETTE.lamp, { emissive: "#ffcc55", ei: 1.8 }), false);
    l.position.set(x, 3.8, -w / 2 + 0.2);
    g.add(p, l);
  }
  // little shack on the T head
  const shack = mesh(new THREE.BoxGeometry(2.6, 2, 2.6), mat("#d8c39c"));
  shack.position.set(len + 2.2, 2.4, 0);
  const sroof = mesh(new THREE.ConeGeometry(2.3, 1.2, 4), mat(PALETTE.red));
  sroof.position.set(len + 2.2, 4.0, 0);
  sroof.rotation.y = Math.PI / 4;
  g.add(shack, sroof);
  return g;
}

export interface LighthouseParts { root: THREE.Group; beam: THREE.Group }
export function buildLighthouse(): LighthouseParts {
  const root = new THREE.Group();
  // rocky islet
  const isletGeo = new THREE.CylinderGeometry(6, 7.5, 3, 9, 1);
  jitter(isletGeo, 0.9, 42, 0.4);
  const islet = mesh(isletGeo, mat(PALETTE.rock));
  islet.position.y = 0;
  root.add(islet);
  const sections = 5, h = 2.6;
  for (let i = 0; i < sections; i++) {
    const r0 = 2.1 - i * 0.22, r1 = 2.1 - (i + 1) * 0.22;
    const s = mesh(new THREE.CylinderGeometry(r1, r0, h, 10), mat(i % 2 ? PALETTE.red : PALETTE.white));
    s.position.y = 1.5 + h * i + h / 2;
    root.add(s);
  }
  const topY = 1.5 + h * sections;
  const gallery = mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.25, 10), mat("#3a3f47"));
  gallery.position.y = topY + 0.1;
  const glass = mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), mat(PALETTE.lamp, { emissive: "#ffd76a", ei: 2.2 }), false);
  glass.position.y = topY + 1.0;
  const cap = mesh(new THREE.ConeGeometry(1.25, 1.3, 8), mat(PALETTE.red));
  cap.position.y = topY + 2.45;
  const ball = mesh(new THREE.SphereGeometry(0.18, 6, 4), mat("#3a3f47"));
  ball.position.y = topY + 3.2;
  const door = mesh(new THREE.BoxGeometry(0.9, 1.5, 0.2), mat(PALETTE.woodDark));
  door.position.set(0, 2.3, 2.05);
  root.add(gallery, glass, cap, ball, door);
  // rotating light beams (additive cones)
  const beam = new THREE.Group();
  beam.position.y = topY + 1.0;
  const beamMat = new THREE.MeshBasicMaterial({ color: "#fff1b0", vertexColors: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (const s of [1, -1]) {
    const geo = new THREE.ConeGeometry(4.5, 60, 16, 4, true);
    // fade from bright apex (+y) to nothing at the wide end
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = Math.pow((pos.getY(i) + 30) / 60, 2.2); cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = k; }
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const cone = new THREE.Mesh(geo, beamMat);
    cone.rotation.z = (s * Math.PI) / 2;
    cone.position.x = s * 30;
    beam.add(cone);
  }
  root.add(beam);
  return { root, beam };
}
