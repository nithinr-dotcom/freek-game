/**
 * Stylised low-poly ocean: Gerstner vertex waves, faceted normals, zone depth colours,
 * crest/shore foam. `waveHeight()` evaluates the same wave sum on the CPU.
 */
import * as THREE from "three";
import { ZONES, WORLD_RADIUS } from "@freek/shared";
import type { IslandDef } from "./layout";

// [dirX, dirZ, wavelength, amplitude, steepness]
const WAVES: [number, number, number, number, number][] = [
  [1.0, 0.25, 42, 0.55, 0.35],
  [0.55, 0.85, 23, 0.3, 0.4],
  [-0.6, 0.8, 14, 0.17, 0.45],
  [0.2, -1.0, 8.5, 0.08, 0.5],
];
const G = 9.8;
const WAVE_K = WAVES.map(([dx, dz, L, A, Q]) => {
  const len = Math.hypot(dx, dz);
  const k = (Math.PI * 2) / L;
  return { dx: dx / len, dz: dz / len, k, c: Math.sqrt(G / k), A, Q };
});

/** shared wave state; the ocean writes it, CPU queries read it so they match the shader */
export const waveState = { time: 0, amp: 1 };

/** height of the water surface at world (x,z) at time t (seconds) */
export function waveHeight(x: number, z: number, t = waveState.time, amp = waveState.amp): number {
  let y = 0;
  for (const w of WAVE_K) y += w.A * amp * Math.sin(w.k * (w.dx * x + w.dz * z - w.c * t));
  const r = Math.hypot(x, z);
  const s = Math.min(1, Math.max(0, (r - 10) / 50));
  return y * (0.65 + 0.35 * s * s * (3 - 2 * s));
}
/** approximate surface normal (finite differences) */
export function waveNormal(x: number, z: number, out = new THREE.Vector3(), t = waveState.time): THREE.Vector3 {
  const e = 1.2;
  const hL = waveHeight(x - e, z, t), hR = waveHeight(x + e, z, t);
  const hD = waveHeight(x, z - e, t), hU = waveHeight(x, z + e, t);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

/** GLSL wave function shared by the ocean and surface decals (rings, warnings). */
export const WAVE_GLSL = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform vec4 uWaves[4];   // dx, dz, k, c
uniform vec4 uWaveA[4];   // A, Q, -, -
vec3 gerstner(vec3 p) {
  vec3 disp = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    float A = uWaveA[i].x * uAmp;
    float Q = uWaveA[i].y;
    float f = w.z * (w.x * p.x + w.y * p.z - w.w * uTime);
    disp.y += A * sin(f);
    disp.x += Q * A * w.x * cos(f);
    disp.z += Q * A * w.y * cos(f);
  }
  float r = length(p.xz);
  disp *= mix(0.65, 1.0, smoothstep(10.0, 60.0, r));
  return disp;
}`;

const vert = /* glsl */ `
${WAVE_GLSL}
varying vec3 vWorld;
varying float vHeight;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 p = wp.xyz;
  vec3 disp = gerstner(p);
  p += disp;
  vWorld = p;
  vHeight = disp.y;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

/** uniforms objects shared (by reference) with every material using WAVE_GLSL */
export const waveUniforms = {
  uTime: { value: 0 },
  uAmp: { value: 1 },
  uWaves: { value: WAVE_K.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.c)) },
  uWaveA: { value: WAVE_K.map((w) => new THREE.Vector4(w.A, w.Q, 0, 0)) },
};

const frag = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uStorm;
uniform float uFlash;
uniform float uNight;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uShallow;
uniform vec3 uReef;
uniform vec3 uAbyss;
uniform vec3 uLagoon;
uniform vec4 uIslands[16];
uniform int uIslandCount;
uniform vec4 uZones; // shallowsMax, reefMax, worldR, -
varying vec3 vWorld;
varying float vHeight;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  float r = length(vWorld.xz);
  // zone depth colour
  vec3 col = mix(uShallow, uReef, smoothstep(uZones.x - 30.0, uZones.x + 30.0, r));
  col = mix(col, uAbyss, smoothstep(uZones.y - 20.0, uZones.y + 60.0, r));
  col = mix(col, uAbyss * 0.6, smoothstep(uZones.z - 60.0, uZones.z + 40.0, r));
  // island lagoons + shore foam
  float shore = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uIslandCount) break;
    vec4 isl = uIslands[i];
    float d = length(vWorld.xz - isl.xy) - isl.z;
    col = mix(uLagoon, col, smoothstep(0.0, isl.w, d));
    float wob = noise(vWorld.xz * 0.35 + uTime * 0.3) * 1.6;
    shore = max(shore, 1.0 - smoothstep(0.0, 2.2 + wob, d));
  }
  // zone border hints: faint dashed rings
  float dash = step(0.5, fract(atan(vWorld.z, vWorld.x) * 30.0 / 6.2831 + uTime * 0.02));
  float ring1 = (1.0 - smoothstep(0.0, 1.2, abs(r - uZones.x))) * dash;
  float ring2 = (1.0 - smoothstep(0.0, 1.6, abs(r - uZones.y))) * dash;
  // lighting
  vec3 L = normalize(uSunDir);
  float diff = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), 700.0) * (1.0 - uStorm * 0.8);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 c = col * (0.55 + 0.6 * diff) * mix(vec3(1.0), uSunColor, 0.35);
  c = mix(c, uSkyColor, fres * 0.35);
  c += uSunColor * spec * 0.3;
  // crest foam
  float crest = smoothstep(0.62, 1.05, vHeight / max(uAmp, 0.01)) * (0.55 + 0.45 * noise(vWorld.xz * 0.5 + uTime * 0.6));
  float foam = clamp(crest * (0.35 + uStorm * 0.6) + shore, 0.0, 1.0);
  c = mix(c, vec3(0.93, 0.97, 1.0), foam * 0.85);
  c = mix(c, vec3(0.7, 1.0, 0.95), ring1 * 0.18);
  c = mix(c, vec3(1.0, 0.55, 0.35), ring2 * 0.18);
  c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * vec3(0.7, 0.8, 0.9), uStorm * 0.45);
  c *= 1.0 - uStorm * 0.4;
  c = mix(c, c * vec3(0.2, 0.27, 0.48) + uSunColor * spec * 0.6, uNight);
  c += vec3(0.6, 0.7, 0.9) * uFlash * 0.35;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private cell: number;
  private smoothAmp = 1;

  /** region biome water colours (solo) */
  setWater(shallow: string, mid: string, deep: string) {
    const u = this.material.uniforms;
    (u.uShallow.value as THREE.Color).set(shallow).multiplyScalar(0.62);
    (u.uReef.value as THREE.Color).set(mid).multiplyScalar(0.75);
    (u.uAbyss.value as THREE.Color).set(deep);
  }

  constructor(islands: IslandDef[], segs = 340) {
    const size = 1700;
    this.cell = size / segs;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const islandVec = Array.from({ length: 16 }, (_, i) => {
      const isl = islands[i];
      return isl ? new THREE.Vector4(isl.x, isl.z, isl.r * 0.92, isl.lagoon) : new THREE.Vector4(0, 0, 0, 1);
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uStorm: { value: 0 },
          uFlash: { value: 0 },
          uNight: { value: 0 },
          uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
          uSunColor: { value: new THREE.Color("#fff3d6") },
          uSkyColor: { value: new THREE.Color("#bfe6ff") },
          uShallow: { value: new THREE.Color(ZONES.shallows.color).multiplyScalar(0.62) },
          uReef: { value: new THREE.Color(ZONES.reef.color).multiplyScalar(0.75) },
          uAbyss: { value: new THREE.Color(ZONES.abyss.color) },
          uLagoon: { value: new THREE.Color("#4fd6c4") },
          uIslands: { value: islandVec },
          uIslandCount: { value: Math.min(16, islands.length) },
          uZones: { value: new THREE.Vector4(ZONES.shallows.maxR, ZONES.reef.maxR, WORLD_RADIUS, 0) },
        },
      ]),
    });
    // share the wave uniforms by reference (UniformsUtils.merge clones them)
    Object.assign(this.material.uniforms, waveUniforms);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  /** wind 0..1, storm 0..1 (smoothed by caller) */
  update(dt: number, time: number, camPos: THREE.Vector3, wind: number, storm: number) {
    const target = 0.55 + wind * 0.9 + storm * 1.3;
    this.smoothAmp += (target - this.smoothAmp) * (1 - Math.exp(-0.5 * dt));
    waveState.time = time;
    waveState.amp = this.smoothAmp;
    const u = this.material.uniforms;
    waveUniforms.uTime.value = time;
    waveUniforms.uAmp.value = this.smoothAmp;
    u.uStorm.value = storm;
    this.mesh.position.set(Math.round(camPos.x / this.cell) * this.cell, 0, Math.round(camPos.z / this.cell) * this.cell);
  }
}
