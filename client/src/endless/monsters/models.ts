/** Low-poly procedural rigs for the Endless monster roster (they face +z, sit on the water at y = 0). */
import * as THREE from "three";
import type { MonsterRig } from "../../entities/monsterModels";

const mat = (color: string, emissive?: string, ei = 0, opts: { opacity?: number } = {}) =>
  new THREE.MeshStandardMaterial({
    color, flatShading: true, roughness: 0.55, emissive: emissive ?? "#000", emissiveIntensity: ei,
    transparent: opts.opacity !== undefined, opacity: opts.opacity ?? 1,
  });

function eyes(parent: THREE.Object3D, x: number, y: number, z: number, r: number, color = "#ffee55") {
  const em = mat(color, color, 2.2);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.OctahedronGeometry(r), em);
    e.position.set(s * x, y, z);
    parent.add(e);
  }
}

// ------------------------------------------------------------------------------------------------ piranha
export function buildPiranha(): MonsterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const skin = mat("#5b6f86"), belly = mat("#e2463a"), fin = mat("#3d4b5e");
  const bg = new THREE.IcosahedronGeometry(0.9, 0); bg.scale(0.7, 0.95, 1.25);
  const b = new THREE.Mesh(bg, skin); b.castShadow = true;
  const bl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), belly); bl.position.set(0, -0.35, 0.2); bl.scale.set(0.9, 0.7, 1.2);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 3), fin); tail.rotation.x = Math.PI / 2; tail.position.z = -1.35;
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 3), fin); dorsal.position.set(0, 0.85, -0.1); dorsal.rotation.x = -0.5;
  const jaw = new THREE.Group(); jaw.position.set(0, -0.2, 0.9);
  const jm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.45), belly); jm.position.z = 0.15; jaw.add(jm);
  const tooth = mat("#ffffff");
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 3), tooth);
    t.position.set(-0.2 + i * 0.13, 0.15, 0.3); jaw.add(t);
  }
  eyes(body, 0.38, 0.3, 0.65, 0.12, "#ff5533");
  body.add(b, bl, tail, dorsal, jaw);
  body.position.y = 0.3;
  root.add(body);
  return {
    root,
    animate(t, _dt, attack) {
      const k = Math.sin(Math.min(1, attack) * Math.PI);
      tail.rotation.y = Math.sin(t * 14) * 0.5;
      body.rotation.y = Math.sin(t * 14) * 0.08;
      body.position.y = 0.3 + Math.abs(Math.sin(t * 5)) * 0.25 + k * 1.2;
      body.rotation.x = -k * 0.5;
      jaw.rotation.x = 0.2 + k * 0.7 + Math.max(0, Math.sin(t * 9)) * 0.15;
    },
  };
}

// ------------------------------------------------------------------------------------------------ spitter eel
export interface SpitterVis { charge: number }
export function buildSpitterEel(vis: SpitterVis): MonsterRig {
  const root = new THREE.Group();
  const a = mat("#5a2c7a"), b2 = mat("#43205d"), spot = mat("#9dff5a", "#7dff2a", 1.4);
  const segs: THREE.Mesh[] = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const r = 0.85 * (1 - (i / N) * 0.7);
    const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, 0.85, 1.4);
    const s = new THREE.Mesh(g, i % 2 ? a : b2); s.castShadow = true;
    if (i % 3 === 1) { const d = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.3), spot); d.position.y = r * 0.75; s.add(d); }
    root.add(s); segs.push(s);
  }
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.0, 5), a); skull.rotation.x = Math.PI / 2; skull.castShadow = true;
  const sacMat = mat("#7dff2a", "#7dff2a", 0.6, { opacity: 0.85 });
  const sac = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), sacMat); sac.position.set(0, -0.5, -0.2);
  const frillMat = mat("#c86bff");
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 3), frillMat);
    f.position.set(s * 0.8, 0.3, -0.4); f.rotation.z = s * -1.1;
    head.add(f);
  }
  eyes(head, 0.42, 0.35, 0.3, 0.16, "#b6ff3a");
  head.add(skull, sac);
  root.add(head);
  return {
    root,
    animate(t, _dt, attack) {
      const k = Math.sin(Math.min(1, attack) * Math.PI);
      for (let i = 0; i < N; i++) {
        const ph = t * 2.6 - i * 0.6;
        segs[i].position.set(Math.sin(ph) * 0.9 * (0.3 + i / N), 0.1 + Math.sin(t * 1.8 - i * 0.6) * 0.35, -i * 0.95 - 0.8);
        segs[i].rotation.y = Math.cos(ph) * 0.4;
      }
      // rears up while charging a spit, snaps forward on the spit
      head.position.set(Math.sin(t * 2.6) * 0.3, 1.0 + vis.charge * 2.2 + k * 0.6, 0.4 + k * 1.2);
      head.rotation.x = -vis.charge * 0.6 + k * 0.9;
      const s = 1 + vis.charge * 0.9;
      sac.scale.setScalar(s);
      sacMat.emissiveIntensity = 0.6 + vis.charge * 2.5 + Math.sin(t * 20) * vis.charge * 0.6;
    },
  };
}

// ------------------------------------------------------------------------------------------------ armored crab
export interface CrabVis { walk: number; charge: number; windup: number }
export function buildArmoredCrab(vis: CrabVis): MonsterRig {
  const root = new THREE.Group();
  const shell = mat("#8a4a2a"), dark = mat("#5e2f1a"), plate = mat("#9aa8b8", "#4a6c8a", 0.25), rim = mat("#ffd24a", "#ffb000", 0.8);
  const body = new THREE.Group();
  const cg = new THREE.IcosahedronGeometry(1.6, 0); cg.scale(1.5, 0.6, 1.1);
  const carapace = new THREE.Mesh(cg, shell); carapace.position.y = 1.0; carapace.castShadow = true;
  body.add(carapace);
  // the front shield: a broad plate with a glowing rim (reads "don't hit me here")
  const shield = new THREE.Group(); shield.position.set(0, 1.1, 1.7);
  const pl = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.9, 0.35, 3, 2, 1), plate); pl.castShadow = true;
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.15, 0.42), rim); top.position.y = 0.98;
  const bot = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.15, 0.42), rim); bot.position.y = -0.98;
  for (const s of [-1, 1]) {
    const stud = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 4), rim); stud.rotation.x = Math.PI / 2; stud.position.set(s * 1.1, 0.2, 0.35);
    shield.add(stud);
  }
  shield.add(pl, top, bot);
  body.add(shield);
  eyes(body, 0.6, 2.25, 1.2, 0.18);
  const claws: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const c = new THREE.Group(); c.position.set(s * 2.3, 1.0, 1.0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.4), dark); arm.position.z = 0.5;
    const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 4), shell); pincer.rotation.x = Math.PI / 2; pincer.position.z = 1.6;
    c.add(arm, pincer); body.add(c); claws.push(c);
  }
  const legs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const s = i < 3 ? -1 : 1;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 0.22), dark);
    leg.position.set(s * 2.0, 0.55, -0.7 + (i % 3) * 0.7);
    leg.rotation.z = s * -0.5;
    body.add(leg); legs.push(leg);
  }
  root.add(body);
  return {
    root,
    animate(t, _dt, attack) {
      const k = Math.sin(Math.min(1, attack) * Math.PI);
      const w = vis.walk + vis.charge * 2;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(t * (6 + w * 8) + i * 1.3) * 0.4 * Math.min(1, w + 0.15); });
      body.position.y = Math.sin(t * 1.4) * 0.1 + Math.abs(Math.sin(t * 8)) * 0.15 * w;
      body.rotation.x = vis.windup * -0.25 + vis.charge * 0.18;
      body.rotation.z = Math.sin(t * 20) * 0.05 * vis.windup;
      claws.forEach((c, i) => { c.rotation.x = -vis.windup * 0.9 - k * 0.6; c.rotation.y = (i ? -1 : 1) * (0.2 + k * 0.5); });
    },
  };
}

// ------------------------------------------------------------------------------------------------ jelly
export function buildJelly(scale = 1, color = "#ff7ad9"): MonsterRig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  const bellMat = mat(color, color, 0.9, { opacity: 0.78 });
  const core = mat("#ffffff", color, 2);
  const bg = new THREE.SphereGeometry(1.5, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const bell = new THREE.Mesh(bg, bellMat); bell.position.y = 1.0; bell.castShadow = true;
  const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), core); nucleus.position.y = 1.6;
  inner.add(bell, nucleus);
  const tents: THREE.Mesh[] = [];
  const tm = mat(color, color, 0.5, { opacity: 0.7 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const tn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 2.0, 4), tm);
    tn.geometry.translate(0, -1, 0);
    tn.position.set(Math.cos(a) * 0.9, 1.0, Math.sin(a) * 0.9);
    inner.add(tn); tents.push(tn);
  }
  inner.scale.setScalar(scale);
  root.add(inner);
  return {
    root,
    animate(t, _dt, attack) {
      const k = Math.sin(Math.min(1, attack) * Math.PI);
      const pulse = Math.sin(t * 3);
      bell.scale.set(1 + pulse * 0.12, 1 - pulse * 0.15, 1 + pulse * 0.12);
      inner.position.y = 0.3 + pulse * 0.25 + k * 0.8;
      tents.forEach((tn, i) => { tn.rotation.x = Math.sin(t * 2.4 + i) * 0.35 + k * 0.5; tn.rotation.z = Math.cos(t * 2 + i * 1.7) * 0.3; });
      bellMat.emissiveIntensity = 0.9 + k * 1.5;
    },
  };
}

// ------------------------------------------------------------------------------------------------ puffer mine
export interface PufferVis { inflate: number }
export function buildPuffer(vis: PufferVis): MonsterRig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  const skinMat = mat("#d8b04a", "#ff3a1a", 0);
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), skinMat); ball.castShadow = true;
  const spikeMat = mat("#3a2a18");
  for (let i = 0; i < 18; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / 18), th = i * 2.4;
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), spikeMat);
    sp.position.copy(dir).multiplyScalar(1.05);
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    inner.add(sp);
  }
  const fin = mat("#b08a32");
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 3), fin); tail.rotation.x = Math.PI / 2; tail.position.z = -1.1;
  eyes(inner, 0.45, 0.35, 0.8, 0.14, "#ffffff");
  inner.add(ball, tail);
  root.add(inner);
  return {
    root,
    animate(t) {
      const inf = vis.inflate;
      const s = 0.9 + inf * 1.1 + Math.sin(t * (4 + inf * 30)) * 0.05 * (0.3 + inf);
      inner.scale.setScalar(s);
      inner.position.y = 0.6 + Math.sin(t * 1.7) * 0.15 + inf * 0.6;
      tail.rotation.y = Math.sin(t * 8) * 0.4;
      skinMat.emissiveIntensity = inf * (1.5 + Math.sin(t * 25) * 0.8);
      skinMat.color.setRGB(0.85, 0.69 - inf * 0.45, 0.29 - inf * 0.2);
    },
  };
}
