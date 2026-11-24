/** A little companion that follows the solo boat (gull, otter, turtle, baby kraken). Procedural low-poly models. */
import * as THREE from "three";
import { waveHeight } from "../world/ocean";

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, ...extra });

function buildGull() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat("#f4f6f8"));
  body.scale.set(0.8, 0.7, 1.5);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mat("#ffffff"));
  head.position.set(0, 0.25, 0.75);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 5), mat("#ffb43a"));
  beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.2, 1.1);
  const wingGeo = new THREE.BoxGeometry(1.6, 0.06, 0.6);
  wingGeo.translate(0.8, 0, 0);
  const wl = new THREE.Mesh(wingGeo, mat("#dfe5ea")), wr = new THREE.Mesh(wingGeo, mat("#dfe5ea"));
  wr.rotation.y = Math.PI;
  const tipGeo = new THREE.BoxGeometry(0.5, 0.07, 0.5); tipGeo.translate(1.75, 0, 0);
  wl.add(new THREE.Mesh(tipGeo, mat("#4a5560"))); wr.add(new THREE.Mesh(tipGeo, mat("#4a5560")));
  g.add(body, head, beak, wl, wr);
  g.userData.wings = [wl, wr];
  return g;
}
function buildOtter() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), mat("#7a5232"));
  body.rotation.x = Math.PI / 2;
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.8, 4, 8), mat("#c9a27a"));
  belly.rotation.x = Math.PI / 2; belly.position.y = 0.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), mat("#7a5232"));
  head.position.set(0, 0.2, 0.8);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), mat("#1a1210"));
  nose.position.set(0, 0.25, 1.12);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), mat("#6a4428"));
  tail.rotation.x = -Math.PI / 2; tail.position.z = -1;
  g.add(body, belly, head, nose, tail);
  g.userData.tail = tail;
  return g;
}
function buildTurtle() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat("#3f7a3a"));
  shell.scale.set(1, 0.55, 1.2);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 4, 12), mat("#c9b56a"));
  rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.2, 1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 5), mat("#8fb86a"));
  head.position.set(0, 0.05, 1.1);
  const flippers: THREE.Mesh[] = [];
  for (const [x, z] of [[0.75, 0.5], [-0.75, 0.5], [0.6, -0.6], [-0.6, -0.6]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.25), mat("#8fb86a"));
    f.position.set(x, 0, z);
    flippers.push(f);
  }
  g.add(shell, rim, head, ...flippers);
  g.userData.flippers = flippers;
  return g;
}
function buildKraken() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), mat("#9a4ad8", { emissive: "#3a1260", emissiveIntensity: 0.4 }));
  head.scale.set(1, 1.25, 1);
  head.position.y = 0.4;
  for (const x of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mat("#ffffff"));
    eye.position.set(x, 0.5, 0.45);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat("#101010"));
    pupil.position.set(x, 0.5, 0.55);
    g.add(eye, pupil);
  }
  const tentacles: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 5), mat("#b464f0"));
    t.position.set(Math.cos(a) * 0.35, -0.1, Math.sin(a) * 0.35);
    t.rotation.x = Math.PI;
    t.userData.a = a;
    tentacles.push(t);
  }
  g.add(head, ...tentacles);
  g.userData.tentacles = tentacles;
  return g;
}

export class Companion {
  readonly root = new THREE.Group();
  private obj: THREE.Group | null = null;
  private x = 0; private z = 0; private rot = 0;
  private first = true;
  constructor(private scene: THREE.Scene, readonly kind: string) {
    const b = kind === "gull" ? buildGull() : kind === "otter" ? buildOtter() : kind === "turtle" ? buildTurtle() : kind === "kraken" ? buildKraken() : null;
    if (!b) return;
    this.obj = b;
    b.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    this.root.add(b);
    scene.add(this.root);
  }
  update(dt: number, t: number, boat: THREE.Vector3, boatRot: number, speed: number) {
    const o = this.obj;
    if (!o) return;
    if (this.kind === "gull") {
      const a = t * 0.8;
      const tx = boat.x + Math.cos(a) * 10, tz = boat.z + Math.sin(a) * 10;
      this.x = tx; this.z = tz;
      this.root.scale.setScalar(0.7);
      this.root.position.set(tx, boat.y + 12 + Math.sin(t * 1.3) * 0.6, tz);
      this.root.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), -0.35);
      const [wl, wr] = o.userData.wings as THREE.Mesh[];
      const f = Math.sin(t * 7) * 0.5;
      wl.rotation.z = f; wr.rotation.z = -f;
      return;
    }
    // swimmers: follow a point beside / behind the boat with lag
    const side = this.kind === "otter" ? 4.5 : this.kind === "kraken" ? -4 : 0;
    const back = this.kind === "turtle" ? 7 : 4.5;
    const tx = boat.x - Math.sin(boatRot) * back + Math.cos(boatRot) * side;
    const tz = boat.z - Math.cos(boatRot) * back - Math.sin(boatRot) * side;
    if (this.first) { this.x = tx; this.z = tz; this.first = false; }
    const k = 1 - Math.exp(-(this.kind === "turtle" ? 1.6 : 3) * dt);
    const nx = this.x + (tx - this.x) * k, nz = this.z + (tz - this.z) * k;
    const moving = Math.hypot(nx - this.x, nz - this.z) > 0.002;
    if (moving) this.rot = Math.atan2(nx - this.x, nz - this.z);
    this.x = nx; this.z = nz;
    const y = waveHeight(this.x, this.z);
    this.root.position.set(this.x, y + (this.kind === "kraken" ? -0.1 : 0.05) + Math.sin(t * 2.4) * 0.08, this.z);
    this.root.rotation.set(0, this.rot, Math.sin(t * 1.8) * 0.08);
    const sw = Math.min(1, Math.abs(speed) / 6);
    if (o.userData.tail) (o.userData.tail as THREE.Mesh).rotation.y = Math.sin(t * 8) * (0.2 + sw * 0.4);
    if (o.userData.flippers) (o.userData.flippers as THREE.Mesh[]).forEach((f, i) => { f.rotation.y = Math.sin(t * 3 + i * 1.6) * 0.5; });
    if (o.userData.tentacles) (o.userData.tentacles as THREE.Mesh[]).forEach((f) => { f.rotation.z = Math.sin(t * 4 + f.userData.a * 2) * 0.35; });
  }
  dispose() { this.scene.remove(this.root); }
}
