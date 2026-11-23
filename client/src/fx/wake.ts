/** Foam wake: instanced soft discs lying on the water, spawned behind moving boats. */
import * as THREE from "three";
import { waveHeight } from "../world/ocean";

function foamTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,0.0)");
  grd.addColorStop(0.55, "rgba(255,255,255,0.75)");
  grd.addColorStop(0.75, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Wake {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private x: Float32Array; private z: Float32Array; private life: Float32Array; private max: Float32Array; private s0: Float32Array; private grow: Float32Array; private rot: Float32Array;
  private cursor = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private p = new THREE.Vector3(); private s = new THREE.Vector3(); private c = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(n = 700) {
    this.n = n;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#ffffff" });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.x = new Float32Array(n); this.z = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.grow = new Float32Array(n); this.rot = new Float32Array(n);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, this.m);
  }

  spawn(x: number, z: number, size = 1.2, life = 2.4, grow = 2.2) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.x[i] = x; this.z[i] = z; this.life[i] = this.max[i] = life; this.s0[i] = size; this.grow[i] = grow; this.rot[i] = Math.random() * 6.28;
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      const sc = this.s0[i] + (1 - t) * this.grow[i];
      this.q.setFromAxisAngle(this.up, this.rot[i]);
      this.p.set(this.x[i], waveHeight(this.x[i], this.z[i]) + 0.12, this.z[i]);
      this.s.set(sc, 1, sc);
      this.m.compose(this.p, this.q, t > 0 ? this.s : this.s.set(0, 0, 0));
      this.mesh.setMatrixAt(i, this.m);
      const a = Math.min(1, t * 1.6) * t * 0.45;
      this.c.setRGB(a, a, a);
      this.mesh.setColorAt(i, this.c);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
