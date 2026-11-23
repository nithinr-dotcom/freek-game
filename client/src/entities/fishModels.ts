/** Procedural low-poly fish, one builder per body shape. Fish face +Z, ~1 unit long (scaled by caller). */
import * as THREE from "three";
import { jitter } from "../world/models";

export type FishShape = "small" | "medium" | "large" | "puffer" | "sword" | "ray" | "shark" | "angler" | "whale" | "generic";
export const FISH_SHAPES: FishShape[] = ["small", "medium", "large", "puffer", "sword", "ray", "shark", "angler", "whale"];

function fmat(color: THREE.ColorRepresentation, emissive?: THREE.ColorRepresentation, ei = 0) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5, metalness: 0.1, emissive: emissive ?? "#000", emissiveIntensity: ei });
}
function body(len: number, h: number, w: number, detail = 1, seed = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  // taper toward the tail (-z)
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const t = 0.65 + 0.35 * (z + 0.5);
    p.setX(i, p.getX(i) * t);
    p.setY(i, p.getY(i) * t);
  }
  g.scale(w, h, len);
  jitter(g, 0.015 * len, seed);
  return g;
}
function fin(w: number, h: number, color: THREE.ColorRepresentation, orient: "tail" | "dorsal" | "fluke" | "none" = "none"): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-w, h * 0.5);
  shape.lineTo(-w * 0.7, 0);
  shape.lineTo(-w, -h * 0.5);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  if (orient === "tail") g.rotateY(-Math.PI / 2);
  if (orient === "dorsal") { g.rotateZ(-Math.PI / 2); g.rotateY(Math.PI / 2); }
  if (orient === "fluke") { g.rotateY(-Math.PI / 2); g.rotateZ(Math.PI / 2); }
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, flatShading: true, roughness: 0.6 }));
  return m;
}
function eyes(group: THREE.Group, x: number, y: number, z: number, r: number) {
  const white = fmat("#ffffff");
  const black = fmat("#111111");
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), white);
    e.position.set(s * x, y, z);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 6, 4), black);
    pu.position.set(s * (x + r * 0.5), y, z + r * 0.2);
    group.add(e, pu);
  }
}

/** Build a fish; tail is in userData.tail for swim animation */
export function buildFish(shape: FishShape, tint: string): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Color(tint);
  const dark = c.clone().multiplyScalar(0.6);
  const belly = c.clone().lerp(new THREE.Color("#ffffff"), 0.55);
  const bodyMat = fmat(c);
  const addTail = (z: number, size: number, color = dark) => {
    const t = fin(size, size * 1.4, color, "tail");
    const pivot = new THREE.Group();
    pivot.position.z = z;
    t.position.z = 0;
    pivot.add(t);
    g.add(pivot);
    g.userData.tail = pivot;
  };
  const addDorsal = (z: number, y: number, size: number) => {
    const d = fin(size, size * 0.9, dark, "dorsal");
    d.position.set(0, y, z);
    g.add(d);
  };
  const addBelly = (len: number, h: number, w: number, y: number) => {
    const b = new THREE.Mesh(body(len * 0.85, h * 0.5, w * 0.92, 1, 3), fmat(belly));
    b.position.y = y;
    g.add(b);
  };

  switch (shape) {
    case "small": {
      g.add(new THREE.Mesh(body(1, 0.36, 0.22), bodyMat));
      addBelly(1, 0.36, 0.22, -0.06);
      addTail(-0.48, 0.3);
      addDorsal(0.05, 0.16, 0.22);
      eyes(g, 0.08, 0.05, 0.3, 0.045);
      break;
    }
    case "medium":
    case "generic": {
      g.add(new THREE.Mesh(body(1, 0.48, 0.26), bodyMat));
      addBelly(1, 0.48, 0.26, -0.08);
      addTail(-0.48, 0.38);
      addDorsal(0.1, 0.22, 0.35);
      eyes(g, 0.1, 0.07, 0.3, 0.05);
      for (const s of [-1, 1]) { const p = fin(0.16, 0.12, dark); p.position.set(s * 0.12, -0.08, 0.12); p.rotation.y = s * 0.6; g.add(p); }
      break;
    }
    case "large": {
      g.add(new THREE.Mesh(body(1, 0.42, 0.3, 1, 5), bodyMat));
      addBelly(1, 0.42, 0.3, -0.07);
      addTail(-0.5, 0.42);
      addDorsal(0.12, 0.2, 0.3);
      addDorsal(-0.25, 0.12, 0.14);
      eyes(g, 0.12, 0.05, 0.32, 0.04);
      break;
    }
    case "puffer": {
      const b = new THREE.IcosahedronGeometry(0.42, 1);
      jitter(b, 0.03, 2);
      g.add(new THREE.Mesh(b, bodyMat));
      const spikeMat = fmat(dark);
      const pos = (new THREE.IcosahedronGeometry(0.42, 1)).attributes.position as THREE.BufferAttribute;
      const seen = new Set<string>();
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        const k = v.toArray().map((n) => n.toFixed(2)).join();
        if (seen.has(k)) continue;
        seen.add(k);
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 3), spikeMat);
        s.position.copy(v.clone().multiplyScalar(1.05));
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
        g.add(s);
      }
      addTail(-0.4, 0.22);
      eyes(g, 0.18, 0.12, 0.3, 0.07);
      break;
    }
    case "sword": {
      g.add(new THREE.Mesh(body(1, 0.3, 0.2, 1, 7), bodyMat));
      addBelly(1, 0.3, 0.2, -0.05);
      const bill = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.6, 4), fmat(dark));
      bill.rotation.x = Math.PI / 2;
      bill.position.z = 0.75;
      g.add(bill);
      addTail(-0.48, 0.45);
      const sail = fin(0.55, 0.5, dark, "dorsal");
      sail.position.set(0, 0.13, 0.25);
      g.add(sail);
      eyes(g, 0.07, 0.04, 0.33, 0.035);
      break;
    }
    case "ray": {
      const shape2 = new THREE.Shape();
      shape2.moveTo(0, 0.5); shape2.lineTo(0.75, -0.05); shape2.lineTo(0.15, -0.35); shape2.lineTo(0, -0.42);
      shape2.lineTo(-0.15, -0.35); shape2.lineTo(-0.75, -0.05); shape2.closePath();
      const rg = new THREE.ExtrudeGeometry(shape2, { depth: 0.08, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
      rg.rotateX(Math.PI / 2);
      rg.translate(0, 0, 0);
      const ray = new THREE.Mesh(rg, bodyMat);
      g.add(ray);
      g.userData.wings = ray;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.8, 3), fmat(dark));
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = -0.75;
      const tp = new THREE.Group(); tp.position.z = 0; tp.add(tail); g.add(tp); g.userData.tail = tp;
      eyes(g, 0.12, 0.08, 0.32, 0.04);
      break;
    }
    case "shark": {
      g.add(new THREE.Mesh(body(1, 0.32, 0.28, 1, 9), bodyMat));
      addBelly(1, 0.32, 0.28, -0.06);
      addTail(-0.5, 0.5);
      const df = fin(0.32, 0.6, dark, "dorsal");
      df.position.set(0, 0.25, 0.05);
      g.add(df);
      for (const s of [-1, 1]) { const p = fin(0.28, 0.2, dark); p.position.set(s * 0.16, -0.1, 0.12); p.rotation.set(0.3, s * 1.1, s * 0.4); g.add(p); }
      eyes(g, 0.12, 0.04, 0.33, 0.03);
      break;
    }
    case "angler": {
      const b = new THREE.IcosahedronGeometry(0.4, 1);
      b.scale(1, 0.85, 1.1);
      jitter(b, 0.03, 11);
      g.add(new THREE.Mesh(b, bodyMat));
      const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.25, 6, 1, true), fmat("#1a0a20"));
      jaw.rotation.x = Math.PI / 2;
      jaw.position.set(0, -0.08, 0.38);
      g.add(jaw);
      for (let i = 0; i < 6; i++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 3), fmat("#ffffff"));
        tooth.position.set(-0.2 + i * 0.08, -0.02, 0.44);
        tooth.rotation.x = Math.PI;
        g.add(tooth);
      }
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.5, 4), fmat(dark));
      stalk.position.set(0, 0.45, 0.25);
      stalk.rotation.x = 0.7;
      const lure = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), fmat("#ffff99", "#ffee66", 3));
      lure.position.set(0, 0.62, 0.48);
      g.add(stalk, lure);
      addTail(-0.42, 0.3);
      eyes(g, 0.15, 0.14, 0.25, 0.05);
      break;
    }
    case "whale": {
      g.add(new THREE.Mesh(body(1, 0.38, 0.34, 1, 13), bodyMat));
      addBelly(1, 0.38, 0.34, -0.08);
      const fluke = fin(0.3, 0.6, dark, "fluke");
      const pivot = new THREE.Group(); pivot.position.z = -0.48; pivot.add(fluke);
      g.add(pivot); g.userData.tail = pivot; g.userData.tailVertical = true;
      for (const s of [-1, 1]) { const p = fin(0.28, 0.14, dark); p.position.set(s * 0.18, -0.1, 0.15); p.rotation.set(0.2, s * 1.2, 0); g.add(p); }
      eyes(g, 0.16, -0.02, 0.28, 0.025);
      break;
    }
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return g;
}

export function animateFish(g: THREE.Object3D, t: number, speed = 1) {
  const tail = g.userData.tail as THREE.Object3D | undefined;
  if (tail) {
    if (g.userData.tailVertical) tail.rotation.x = Math.sin(t * 5 * speed) * 0.35;
    else tail.rotation.y = Math.sin(t * 8 * speed) * 0.45;
  }
  const wings = g.userData.wings as THREE.Object3D | undefined;
  if (wings) wings.rotation.z = Math.sin(t * 3 * speed) * 0.12;
}

/** species.model "fish_medium" -> "medium" */
export function shapeFromModel(model: string): FishShape {
  const s = model.replace(/^fish_/, "") as FishShape;
  return (FISH_SHAPES as string[]).includes(s) ? s : "generic";
}
