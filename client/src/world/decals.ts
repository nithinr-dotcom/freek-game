/** Materials for things that lie on the moving water surface (rings, warning circles). */
import * as THREE from "three";
import { WAVE_GLSL, waveUniforms } from "./ocean";

const vert = /* glsl */ `
${WAVE_GLSL}
uniform float uLift;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz += gerstner(wp.xyz);
  wp.y += uLift;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const ringFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; uniform float uPulse; uniform float uTime; uniform float uGlow;
varying vec2 vUv;
void main() {
  // RingGeometry uv: radial -> use distance from centre in uv space
  float d = abs(length(vUv - 0.5) * 2.0);
  float edge = smoothstep(0.0, 0.25, 1.0 - abs(d - 0.97) * 45.0);
  float dash = 0.6 + 0.4 * step(0.5, fract(atan(vUv.y - 0.5, vUv.x - 0.5) * 6.0 + uTime * uPulse));
  float glow = smoothstep(0.88, 0.97, d) * (1.0 - step(0.985, d)) * uGlow;
  float a = uOpacity * (edge * dash + glow);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * 1.6, a);
}`;
const discFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; uniform float uFill; uniform float uTime;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  if (d > 1.0) discard;
  float rim = smoothstep(0.86, 0.97, d) * (1.0 - smoothstep(0.97, 1.0, d));
  float fill = (1.0 - step(uFill, d)) * 0.35;
  float stripes = 0.15 * step(0.5, fract((vUv.x + vUv.y) * 10.0 + uTime * 2.0));
  float a = max(rim, fill + stripes * (1.0 - step(uFill, d)));
  gl_FragColor = vec4(uColor * 1.4, a * uOpacity);
}`;

export function makeRingMaterial(color: string, opacity = 0.7, pulse = 0.2, glow = 0.12): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: ringFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...waveUniforms, uLift: { value: 0.25 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uPulse: { value: pulse }, uGlow: { value: glow } },
  });
}
export function makeDiscMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: discFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { ...waveUniforms, uLift: { value: 0.3 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uFill: { value: 0 } },
  });
}

/** A ring lying on the water. Uses PlaneGeometry so uv distance maps to radius. */
export function surfaceRing(radius: number, color: string, opacity = 0.7, segs = 96, glow = 0.12): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const me = new THREE.Mesh(geo, makeRingMaterial(color, opacity, 0.2, glow));
  me.frustumCulled = false;
  return me;
}
export function surfaceDisc(radius: number, color: string): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, 24, 24);
  geo.rotateX(-Math.PI / 2);
  const me = new THREE.Mesh(geo, makeDiscMaterial(color));
  me.frustumCulled = false;
  return me;
}
