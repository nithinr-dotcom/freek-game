/** P3: cone telegraph lying on the water (Ice Leviathan frost breath). Fills from the origin outward over `dur`. */
import * as THREE from "three";
import { WAVE_GLSL, waveUniforms } from "../world/ocean";

const vert = /* glsl */ `
${WAVE_GLSL}
varying vec2 vPos;
void main() {
  vPos = position.xz;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz += gerstner(wp.xyz);
  wp.y += 0.4;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const frag = /* glsl */ `
uniform vec3 uColor; uniform float uFill; uniform float uTime; uniform float uOpacity; uniform float uLen; uniform float uHalf;
varying vec2 vPos;
void main() {
  float r = length(vPos) / uLen;
  float a = abs(atan(vPos.x, vPos.y)) / uHalf;
  float rim = max(smoothstep(0.86, 1.0, a), smoothstep(0.93, 1.0, r));
  float filled = 1.0 - step(uFill, r);
  float ripple = step(0.5, fract(r * 7.0 - uTime * 2.5));
  float alpha = max(rim * 0.95, filled * 0.45 + ripple * 0.15);
  gl_FragColor = vec4(uColor * 1.6, alpha * uOpacity);
}`;

interface Cone { mesh: THREE.Mesh; t: number; dur: number; done?: () => void; fired: boolean }

export class ConeTelegraphs {
  private list: Cone[] = [];
  constructor(private scene: THREE.Scene) {}

  /** cone from (x,z) facing angle `dir` (atan2(dx,dz)), half-angle `half` (rad), length `len` */
  cone(x: number, z: number, dir: number, half: number, len: number, dur: number, onDone?: () => void, color = "#7fdcff") {
    const geo = new THREE.CircleGeometry(len, 24, Math.PI / 2 - half, half * 2);
    geo.rotateX(-Math.PI / 2);
    // the sector points along -z after rotateX; turn it to point along local +z (rotation.y = atan2(dx, dz) then aims it)
    geo.rotateY(Math.PI);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { ...waveUniforms, uColor: { value: new THREE.Color(color) }, uFill: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uLen: { value: len }, uHalf: { value: half } },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = dir;
    this.scene.add(mesh);
    this.list.push({ mesh, t: 0, dur, done: onDone, fired: false });
  }

  /** is (px,pz) inside a cone from (x,z) facing dir? */
  static inside(px: number, pz: number, x: number, z: number, dir: number, half: number, len: number, pad = 2) {
    const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
    if (d > len + pad) return false;
    if (d < pad * 2) return true;
    let a = Math.atan2(dx, dz) - dir;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a) <= half + Math.atan2(pad, d);
  }

  clear() { for (const c of this.list) this.dispose(c); this.list = []; }

  update(dt: number, time: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.t += dt;
      const u = (c.mesh.material as THREE.ShaderMaterial).uniforms;
      u.uFill.value = Math.min(1, c.t / c.dur);
      u.uTime.value = time;
      u.uOpacity.value = c.t < c.dur ? 0.7 + 0.3 * Math.sin(time * 14) : Math.max(0, 1 - (c.t - c.dur) / 0.5);
      if (!c.fired && c.t >= c.dur) { c.fired = true; c.done?.(); }
      if (c.t > c.dur + 0.5) { this.dispose(c); this.list.splice(i, 1); }
    }
  }
  private dispose(c: Cone) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); (c.mesh.material as THREE.Material).dispose(); }
}
