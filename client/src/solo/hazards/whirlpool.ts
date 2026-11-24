/**
 * Whirlpool (Abyss Trench, used by the Maelstrom Eye): a swirling current that drags the boat toward its centre and
 * around it; the core damages the hull. Off until a boss calls enable(); sail against the pull to stay out.
 */
import * as THREE from "three";
import type { PlayerS } from "@freek/shared";
import { registerEnvSystem, type EnvSystem, type EnvCtx } from "./host";
import { WAVE_GLSL, waveUniforms } from "../../world/ocean";

const vert = /* glsl */ `
${WAVE_GLSL}
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz += gerstner(wp.xyz);
  float r = length(uv - 0.5) * 2.0;
  wp.y += 0.3 - (1.0 - smoothstep(0.0, 0.9, r)) * 3.5;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const frag = /* glsl */ `
uniform float uTime; uniform float uStrength; uniform float uCore;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float spiral = sin(a * 4.0 + log(r + 0.02) * 9.0 + uTime * 2.6 * uStrength);
  float foam = smoothstep(0.55, 1.0, spiral) * (1.0 - smoothstep(0.75, 1.0, r));
  float core = 1.0 - smoothstep(0.0, uCore, r);
  vec3 col = mix(vec3(0.05, 0.02, 0.12), vec3(0.55, 0.35, 1.0), foam);
  col += vec3(1.0, 0.25, 0.75) * core * 0.8;
  float alpha = (0.25 + foam * 0.55) * (1.0 - smoothstep(0.85, 1.0, r)) + core * 0.6;
  gl_FragColor = vec4(col, alpha * clamp(uStrength, 0.0, 1.0));
}`;

export class Whirlpool implements EnvSystem {
  readonly id = "whirlpool";
  active = false;
  x = 0; z = 0; R = 95; core = 12;
  /** pull speed at the rim (m/s); grows toward the centre */
  strength = 5;
  /** 0 = frozen (Eye Duel / cinematics) */
  enabledPull = true;
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private dmgAcc = 0;
  private vis = 0;

  constructor(private ctx: EnvCtx) {
    const geo = new THREE.PlaneGeometry(2, 2, 48, 48);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      uniforms: { ...waveUniforms, uTime: { value: 0 }, uStrength: { value: 0 }, uCore: { value: 0.12 } },
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    ctx.scene.add(this.mesh);
  }

  enable(x: number, z: number, R: number, strength: number) { this.x = x; this.z = z; this.R = R; this.strength = strength; this.active = true; this.enabledPull = true; }
  disable() { this.active = false; }
  onStart() { this.disable(); }

  /** pull vector at (x,z) in m/s */
  pullAt(x: number, z: number): { vx: number; vz: number; d: number } {
    const dx = this.x - x, dz = this.z - z, d = Math.hypot(dx, dz) || 0.001;
    if (!this.active || d > this.R) return { vx: 0, vz: 0, d };
    const k = 1 - d / this.R;
    const pull = this.strength * (0.35 + 0.9 * k);
    const swirl = this.strength * 0.9 * Math.sqrt(k);
    const nx = dx / d, nz = dz / d;
    return { vx: nx * pull - nz * swirl, vz: nz * pull + nx * swirl, d };
  }

  update(dt: number, me: PlayerS, paused: boolean) {
    const t = performance.now() / 1000;
    this.vis += ((this.active ? 1 : 0) - this.vis) * Math.min(1, dt * 1.2);
    this.mesh.visible = this.vis > 0.01;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.scale.set(this.R, 1, this.R);
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uStrength.value = this.vis * (0.6 + this.strength / 12);
    this.mat.uniforms.uCore.value = this.core / this.R;
    if (!this.active || paused || me.sunk || !this.enabledPull) return;
    const L = this.ctx.local;
    const p = this.pullAt(L.x, L.z);
    L.x += p.vx * dt; L.z += p.vz * dt;
    if (p.d < this.core) {
      this.dmgAcc += dt * 10;
      if (this.dmgAcc >= 5) { this.dmgAcc = 0; this.ctx.net.damage(5, "maelstrom"); this.ctx.fx.splashAt(L.x, L.z, 1.5); }
    }
  }

  hint(me: PlayerS): string {
    if (!this.active || me.sunk) return "";
    const d = Math.hypot(this.ctx.local.x - this.x, this.ctx.local.z - this.z);
    return d < this.R * 0.45 ? "🌀 The whirlpool is dragging you in! Sail outward at full speed." : "";
  }
  dispose() { this.ctx.scene.remove(this.mesh); }
}

registerEnvSystem({ id: "whirlpool", when: (r) => r.id === "abyss_trench", create: (ctx) => new Whirlpool(ctx) });
