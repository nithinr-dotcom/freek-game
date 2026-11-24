/** Boss telegraphs lying on the water: red lunge lines (filling along their length) and circles. */
import * as THREE from "three";
import { WAVE_GLSL, waveUniforms } from "../world/ocean";
import { surfaceDisc } from "../world/decals";

const vert = /* glsl */ `
${WAVE_GLSL}
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz += gerstner(wp.xyz);
  wp.y += 0.35;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const frag = /* glsl */ `
uniform vec3 uColor; uniform float uFill; uniform float uTime; uniform float uOpacity;
varying vec2 vUv;
void main() {
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.x);
  float rim = 1.0 - smoothstep(0.06, 0.16, min(vUv.x, 1.0 - vUv.x));
  float filled = 1.0 - step(uFill, vUv.y);
  float chev = step(0.5, fract(vUv.y * 9.0 - uTime * 3.0 + abs(vUv.x - 0.5) * 2.0));
  float a = max(rim * 0.9, edge * (filled * 0.45 + chev * 0.18));
  gl_FragColor = vec4(uColor * 1.5, a * uOpacity);
}`;

interface Tele { mesh: THREE.Mesh; t: number; dur: number; done?: () => void; fired: boolean; disc: boolean }

export class Telegraphs {
  private list: Tele[] = [];
  constructor(private scene: THREE.Scene) {}

  /** red lane from (x1,z1) to (x2,z2); fills over dur seconds, then onDone */
  line(x1: number, z1: number, x2: number, z2: number, width: number, dur: number, onDone?: () => void) {
    const len = Math.hypot(x2 - x1, z2 - z1) || 1;
    const geo = new THREE.PlaneGeometry(width, len, 6, Math.max(8, Math.round(len / 2)));
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -len / 2); // runs from local z=0 to z=-len
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { ...waveUniforms, uColor: { value: new THREE.Color("#ff2a2a") }, uFill: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 } },
    });
    // after rotateX(-90°) + translate, uv.y = 0 at the start (local z=0) and 1 at the end, so the fill grows along the lunge
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.position.set(x1, 0, z1);
    mesh.rotation.y = Math.atan2(x1 - x2, z1 - z2);
    this.scene.add(mesh);
    this.list.push({ mesh, t: 0, dur, done: onDone, fired: false, disc: false });
  }
  circle(x: number, z: number, r: number, dur: number, onDone?: () => void) {
    const mesh = surfaceDisc(r, "#ff3030");
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.list.push({ mesh, t: 0, dur, done: onDone, fired: false, disc: true });
  }
  clear() { for (const t of this.list) this.dispose(t); this.list = []; }

  update(dt: number, time: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.t += dt;
      const u = (t.mesh.material as THREE.ShaderMaterial).uniforms;
      u.uFill.value = Math.min(1, t.t / t.dur);
      u.uTime.value = time;
      u.uOpacity.value = t.t < t.dur ? 0.65 + 0.35 * Math.sin(time * 16) : Math.max(0, 1 - (t.t - t.dur) / 0.4);
      if (!t.fired && t.t >= t.dur) { t.fired = true; t.done?.(); }
      if (t.t > t.dur + 0.4) { this.dispose(t); this.list.splice(i, 1); }
    }
  }
  private dispose(t: Tele) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); (t.mesh.material as THREE.Material).dispose(); }
}
