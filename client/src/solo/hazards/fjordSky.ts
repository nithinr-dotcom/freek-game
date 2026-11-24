/**
 * Frozen Fjord atmosphere: falling snow (heavy in a blizzard, which replaces the rain), aurora curtains on aurora nights,
 * blizzard fog, and the "aurora" weather tag gate (the lights dance from 21:00 to 03:00 only).
 * A chapter with setup.weather "storm" keeps the blizzard going for the whole chapter (Deep Freeze).
 */
import * as THREE from "three";
import type { CampaignChapter, PlayerS, WeatherTag } from "@freek/shared";
import { registerHazard, type Hazard, type HazardCtx } from "./host";

/** 0..1 aurora strength at a clock hour (fades in 20:30–21:00, out 03:00–03:30) */
export function auroraLevel(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 21 || h < 3) return 1;
  if (h >= 20.5) return (h - 20.5) / 0.5;
  if (h < 3.5) return 1 - (h - 3) / 0.5;
  return 0;
}
export const auroraActive = (hour: number) => auroraLevel(hour) >= 0.99;

const snowVert = /* glsl */ `
attribute vec3 aOffset;
uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; uniform vec3 uBox; uniform float uSize;
varying float vA;
void main() {
  vec3 o = aOffset;
  o.y -= uTime * (3.0 + fract(aOffset.x * 7.13) * 2.0);
  o.xz += uWind * uTime * 2.0 + vec2(sin(uTime * 0.7 + aOffset.y), cos(uTime * 0.6 + aOffset.x)) * 0.8;
  vec3 p = mod(o - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (60.0 / -mv.z);
  vA = clamp(1.0 - (-mv.z) / 70.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const snowFrag = /* glsl */ `
uniform float uOpacity;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(c));
  gl_FragColor = vec4(0.95, 0.98, 1.0, a * uOpacity * vA);
}`;

const auroraVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const auroraFrag = /* glsl */ `
uniform float uTime; uniform float uLevel; uniform vec3 uA; uniform vec3 uB;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float x = vUv.x * 26.0;
  float rays = noise(x * 3.0 + uTime * 0.6) * 0.6 + noise(x * 9.0 - uTime * 1.1) * 0.4;
  float band = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.x);
  vec3 col = mix(uA, uB, smoothstep(0.2, 0.9, vUv.y) + 0.2 * sin(x + uTime));
  float a = band * edge * (0.35 + 0.65 * rays) * uLevel;
  gl_FragColor = vec4(col * 1.4, a * 0.75);
}`;

class FjordSky implements Hazard {
  readonly id = "fjordSky";
  private snow: THREE.Points;
  private snowMat: THREE.ShaderMaterial;
  private aurora = new THREE.Group();
  private auroraMats: THREE.ShaderMaterial[] = [];
  private def: CampaignChapter | null = null;
  private level = 0;
  private announced = false;

  constructor(private ctx: HazardCtx) {
    const n = 2600;
    const geo = new THREE.BufferGeometry();
    const off = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { off[i * 3] = Math.random() * 120; off[i * 3 + 1] = Math.random() * 50; off[i * 3 + 2] = Math.random() * 120; }
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("aOffset", new THREE.BufferAttribute(off, 3));
    this.snowMat = new THREE.ShaderMaterial({
      vertexShader: snowVert, fragmentShader: snowFrag, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uBox: { value: new THREE.Vector3(120, 50, 120) }, uSize: { value: 2 }, uOpacity: { value: 0.6 } },
    });
    this.snow = new THREE.Points(geo, this.snowMat);
    this.snow.frustumCulled = false;
    ctx.scene.add(this.snow);
    // aurora: three wide curved curtains high in the northern sky (they follow the camera)
    const cols: [string, string][] = [["#3dff9a", "#7a5cff"], ["#5affc8", "#ff5ad8"], ["#3dffb0", "#4aa8ff"]];
    for (let i = 0; i < 3; i++) {
      const geo2 = new THREE.CylinderGeometry(640 - i * 70, 640 - i * 70, 230, 96, 1, true, i * 2.1, 3.6);
      const m = new THREE.ShaderMaterial({
        vertexShader: auroraVert, fragmentShader: auroraFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uA: { value: new THREE.Color(cols[i][0]) }, uB: { value: new THREE.Color(cols[i][1]) } },
      });
      const mesh = new THREE.Mesh(geo2, m);
      mesh.position.y = 150 + i * 35;
      mesh.rotation.y = Math.PI + i * 0.3;
      mesh.frustumCulled = false;
      mesh.renderOrder = -5;
      this.auroraMats.push(m);
      this.aurora.add(mesh);
    }
    ctx.scene.add(this.aurora);
  }

  get auroraOn() { return this.ctx.clock.phase === "night" && auroraLevel(this.ctx.clock.hour) >= 0.99; }

  onStart(def: CampaignChapter | null) { this.def = def; this.announced = false; }

  weather(tags: Set<WeatherTag>) {
    if (!this.auroraOn) tags.delete("aurora");
    else tags.add("aurora");
    if (!tags.size) tags.add("clear");
  }

  update(dt: number, _me: PlayerS, paused: boolean) {
    const ctx = this.ctx, t = performance.now() / 1000;
    const sky = ctx.world.sky, net = ctx.net;
    // a blizzard chapter keeps the storm going
    if (this.def?.setup?.weather === "storm" && !net.state.storm && !paused && ctx.runner().status === "running") net.forceStorm(0);
    const storm = sky.storm;
    const camPos = ctx.chase.camera.position;
    const w = net.state.wind;
    const u = this.snowMat.uniforms;
    u.uTime.value = t;
    (u.uCam.value as THREE.Vector3).copy(camPos);
    (u.uWind.value as THREE.Vector2).set(Math.sin(w.dirRad) * w.speed * (1 + storm * 4), Math.cos(w.dirRad) * w.speed * (1 + storm * 4));
    u.uOpacity.value = 0.45 + storm * 0.5;
    u.uSize.value = 1.6 + storm * 1.2;
    // snow instead of rain
    ctx.fx.rain.mesh.visible = false;
    // blizzard: whiteout fog
    if (storm > 0.02) {
      sky.fog.color.lerp(new THREE.Color("#dfe9f2"), storm * 0.6);
      sky.fog.near *= 1 - storm * 0.55; sky.fog.far *= 1 - storm * 0.5;
    }
    // aurora
    const target = ctx.clock.phase === "night" || ctx.clock.hour >= 20.5 ? auroraLevel(ctx.clock.hour) * (1 - storm) : 0;
    this.level += (target - this.level) * Math.min(1, dt * 1.5);
    this.aurora.visible = this.level > 0.01;
    this.aurora.position.set(camPos.x, 0, camPos.z);
    for (const m of this.auroraMats) { m.uniforms.uTime.value = t; m.uniforms.uLevel.value = this.level; }
    if (this.auroraOn && !this.announced && this.def) { this.announced = true; ctx.feed.announce("The aurora lights up the sky!", "#5affc8", "🌌", true); }
    if (!this.auroraOn) this.announced = false;
  }

  hint(me: PlayerS, phase: string): string {
    const d = this.def, ctx = this.ctx;
    if (!d || phase !== "idle" || me.sunk || ctx.runner().status !== "running") return "";
    const k = d.main.kind, done = ctx.runner().obj?.mainDone;
    const atDock = Math.hypot(me.x, me.z) < 24;
    const touch = document.body.classList.contains("touch-mode");
    const rest = touch ? "Tap REST" : "Press R / click REST";
    if (done) return "";
    if (k.type === "catch_species" && k.ids.includes("aurora_koi")) {
      if (ctx.clock.phase !== "night") return atDock ? `🌙 ${rest} to wait for nightfall.` : "🌙 The Aurora Koi only rises at night. Rest at the dock.";
      if (!this.auroraOn) return `🌌 Wait for the aurora (from 21:00)… it's ${ctx.clock.label}.`;
      return "";
    }
    if (k.type === "catch_weight_range" && k.speciesId === "glacier_char") {
      if (ctx.clock.phase !== "dusk") return ctx.clock.phase === "day" ? (atDock ? `🌇 ${rest} to skip to dusk.` : "🌇 The char bites at dusk. Rest at the dock, or wait for the sunset.") : (atDock ? `🌙 Dusk has passed. ${rest} until morning, then again to dusk.` : "🌙 Dusk has passed: rest at the dock until morning, then to dusk.");
      const lm = ctx.region.landmarks.find((l) => l.id === "ice_cracks");
      if (lm && Math.hypot(me.x - lm.x, me.z - lm.z) > lm.radius) return "🧊 Dusk! Fish right beside the glowing Ice Cracks (east).";
    }
    return "";
  }

  dispose() { this.ctx.scene.remove(this.snow, this.aurora); }
}

registerHazard({ id: "fjordSky", when: (r) => r.id === "frozen_fjord", create: (ctx) => new FjordSky(ctx) });
