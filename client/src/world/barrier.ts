/** Locked-zone barrier (solo campaign): a ring of red buoys and a drifting fog wall at a zone border. */
import * as THREE from "three";
import { ZONES } from "@freek/shared";
import { buildBuoy } from "./models";
import { InstancedProp } from "./bake";
import { waveHeight } from "./ocean";

const wallVert = /* glsl */ `
varying vec2 vUv; varying vec3 vWorld;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const wallFrag = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform vec3 uCam; uniform float uRadius;
varying vec2 vUv; varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
void main() {
  float n = noise(vec2(vUv.x * 120.0 + uTime * 0.4, vUv.y * 4.0 - uTime * 0.15)) * 0.6 + noise(vec2(vUv.x * 300.0 - uTime, vUv.y * 9.0)) * 0.4;
  float a = (1.0 - smoothstep(0.0, 1.0, vUv.y)) * (0.45 + 0.55 * n);
  // fade the wall when the camera is far from the border so it reads as a soft edge
  float camR = length(uCam.xz);
  float near = 1.0 - smoothstep(60.0, 180.0, abs(camR - uRadius));
  gl_FragColor = vec4(uColor, a * mix(0.25, 0.8, near));
}`;

class Border {
  readonly group = new THREE.Group();
  private buoys: InstancedProp;
  private pos: { x: number; z: number }[] = [];
  private mat: THREE.ShaderMaterial;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private s = new THREE.Vector3(1.6, 1.6, 1.6);

  constructor(public readonly radius: number) {
    const n = Math.round((Math.PI * 2 * radius) / 9);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.035; this.pos.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius }); }
    this.buoys = new InstancedProp(buildBuoy("#e0221c"), n, false);
    this.buoys.addTo(this.group);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: wallVert, fragmentShader: wallFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#c9a6a6") }, uCam: { value: new THREE.Vector3() }, uRadius: { value: radius } },
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius + 4, radius + 4, 26, 128, 1, true), this.mat);
    wall.geometry.translate(0, 12, 0);
    wall.renderOrder = 2;
    wall.frustumCulled = false;
    this.group.add(wall);
  }

  update(time: number, cam: THREE.Vector3) {
    this.mat.uniforms.uTime.value = time;
    (this.mat.uniforms.uCam.value as THREE.Vector3).copy(cam);
    this.pos.forEach((b, i) => {
      this.q.setFromEuler(this.e.set(Math.sin(time * 1.4 + i) * 0.15, i, Math.cos(time * 1.2 + i) * 0.15));
      this.m.compose(this.p.set(b.x, waveHeight(b.x, b.z) - 0.2, b.z), this.q, this.s);
      this.buoys.setMatrix(i, this.m);
    });
    this.buoys.commit();
  }
}

export class ZoneBarriers {
  private reef: Border;
  private abyss: Border;
  constructor(scene: THREE.Scene) {
    this.reef = new Border(ZONES.shallows.maxR);
    this.abyss = new Border(ZONES.reef.maxR);
    this.reef.group.visible = this.abyss.group.visible = false;
    scene.add(this.reef.group, this.abyss.group);
  }
  setLocked(reefLocked: boolean, abyssLocked: boolean) {
    this.reef.group.visible = reefLocked;
    this.abyss.group.visible = abyssLocked;
  }
  update(time: number, cam: THREE.Vector3) {
    if (this.reef.group.visible) this.reef.update(time, cam);
    if (this.abyss.group.visible) this.abyss.update(time, cam);
  }
}
