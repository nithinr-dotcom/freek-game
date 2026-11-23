/** Gradient sky dome with sun + clouds, slow day cycle, fog, lights, storm darkening and lightning. */
import * as THREE from "three";

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uTime; uniform float uStorm; uniform float uFlash;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, clamp(-h * 4.0, 0.0, 1.0));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 800.0) * 3.0 + pow(sd, 12.0) * 0.35) * (1.0 - uStorm * 0.9);
  // clouds on a plane projection
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm(uv);
    float cov = mix(0.55, 0.3, uStorm);
    float cl = smoothstep(cov, cov + 0.25, c) * smoothstep(0.0, 0.25, h);
    vec3 cloudCol = mix(vec3(1.0, 0.98, 0.95), vec3(0.32, 0.35, 0.4), uStorm);
    cloudCol = mix(cloudCol, uSunColor, 0.15);
    col = mix(col, cloudCol, cl * 0.85);
  }
  col += vec3(0.75, 0.8, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const DAY_LENGTH = 720; // seconds for a full cycle

interface Palette { top: THREE.Color; horizon: THREE.Color; sun: THREE.Color; sunI: number; hemi: number }
const DAY: Palette = { top: new THREE.Color("#3a86d8"), horizon: new THREE.Color("#bfe4f5"), sun: new THREE.Color("#fff2d8"), sunI: 2.6, hemi: 1.15 };
const DUSK: Palette = { top: new THREE.Color("#3b4f9a"), horizon: new THREE.Color("#ffb38a"), sun: new THREE.Color("#ffb070"), sunI: 1.8, hemi: 0.8 };
const STORM: Palette = { top: new THREE.Color("#2a323d"), horizon: new THREE.Color("#5b6672"), sun: new THREE.Color("#9fb0c0"), sunI: 0.7, hemi: 0.75 };

export class SkySystem {
  readonly dome: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.Fog;
  readonly sunDir = new THREE.Vector3();
  readonly horizon = new THREE.Color();
  readonly sunColor = new THREE.Color();
  private mat: THREE.ShaderMaterial;
  storm = 0; // smoothed 0..1
  flash = 0;
  private nextBolt = 3;
  onThunder: ((delay: number) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color("#1d5a80") },
        uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
        uTime: { value: 0 }, uStorm: { value: 0 }, uFlash: { value: 0 },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight("#cfe8ff", "#2b5a6b", 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff2d8", 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    this.fog = new THREE.Fog("#bfe4f5", 140, 640);
    scene.fog = this.fog;
  }

  update(dt: number, time: number, focus: THREE.Vector3, camPos: THREE.Vector3, stormOn: boolean) {
    this.storm += ((stormOn ? 1 : 0) - this.storm) * (1 - Math.exp(-0.6 * dt));
    // day cycle: sun elevation oscillates between low golden hour and high noon (never full night)
    const phase = (time / DAY_LENGTH) * Math.PI * 2;
    const elev = THREE.MathUtils.lerp(0.12, 1.05, 0.5 + 0.5 * Math.sin(phase));
    const az = phase * 0.5 + 0.8;
    this.sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
    const duskT = 1 - THREE.MathUtils.smoothstep(elev, 0.12, 0.55);
    const top = DAY.top.clone().lerp(DUSK.top, duskT).lerp(STORM.top, this.storm);
    this.horizon.copy(DAY.horizon).lerp(DUSK.horizon, duskT).lerp(STORM.horizon, this.storm);
    this.sunColor.copy(DAY.sun).lerp(DUSK.sun, duskT).lerp(STORM.sun, this.storm);
    const sunI = THREE.MathUtils.lerp(THREE.MathUtils.lerp(DAY.sunI, DUSK.sunI, duskT), STORM.sunI, this.storm);
    const hemiI = THREE.MathUtils.lerp(THREE.MathUtils.lerp(DAY.hemi, DUSK.hemi, duskT), STORM.hemi, this.storm);

    // lightning
    if (this.storm > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        this.nextBolt = 4 + Math.random() * 8;
        this.onThunder?.(0.3 + Math.random() * 1.2);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const flicker = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(time * 60)) : 0;

    const u = this.mat.uniforms;
    (u.uTop.value as THREE.Color).copy(top);
    (u.uHorizon.value as THREE.Color).copy(this.horizon);
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.uSunColor.value as THREE.Color).copy(this.sunColor);
    u.uTime.value = time;
    u.uStorm.value = this.storm;
    u.uFlash.value = flicker * 0.8;
    this.dome.position.copy(camPos);

    this.sun.color.copy(this.sunColor);
    this.sun.intensity = sunI + flicker * 2;
    this.hemi.intensity = hemiI + flicker * 1.5;
    this.hemi.color.copy(this.horizon).lerp(new THREE.Color("#ffffff"), 0.4);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 120);
    this.sun.target.position.copy(focus);

    this.fog.color.copy(this.horizon);
    this.fog.near = THREE.MathUtils.lerp(150, 50, this.storm);
    this.fog.far = THREE.MathUtils.lerp(650, 340, this.storm);
  }

  get flicker() { return this.flash; }
}
