/** GPU point particles (splashes, sparks, spray). One draw call, fixed pool. */
import * as THREE from "three";

const vert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

export interface BurstOpts {
  count?: number; color?: THREE.ColorRepresentation; color2?: THREE.ColorRepresentation; speed?: number; up?: number;
  gravity?: number; life?: number; size?: number; spread?: number; additive?: boolean;
}

export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array; private vel: Float32Array; private col: Float32Array;
  private size: Float32Array; private alpha: Float32Array; private life: Float32Array; private maxLife: Float32Array; private grav: Float32Array; private size0: Float32Array;
  private cursor = 0;
  private c1 = new THREE.Color(); private c2 = new THREE.Color();

  constructor(n = 1200, additive = false) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n); this.grav = new Float32Array(n); this.size0 = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }

  burst(at: THREE.Vector3, o: BurstOpts = {}) {
    const count = o.count ?? 30;
    this.c1.set(o.color ?? "#e8f6ff");
    this.c2.set(o.color2 ?? o.color ?? "#ffffff");
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 5) * (0.4 + Math.random() * 0.8);
      const spread = o.spread ?? 0.4;
      this.pos[i * 3] = at.x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = (o.up ?? 6) * (0.5 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      const t = Math.random();
      this.col[i * 3] = this.c1.r + (this.c2.r - this.c1.r) * t;
      this.col[i * 3 + 1] = this.c1.g + (this.c2.g - this.c1.g) * t;
      this.col[i * 3 + 2] = this.c1.b + (this.c2.b - this.c1.b) * t;
      this.maxLife[i] = this.life[i] = (o.life ?? 1) * (0.6 + Math.random() * 0.6);
      this.size0[i] = (o.size ?? 0.6) * (0.6 + Math.random() * 0.8);
      this.grav[i] = o.gravity ?? 14;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 2);
      this.size[i] = this.size0[i] * (0.6 + 0.4 * t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}
