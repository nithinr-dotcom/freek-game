/** Instanced rain streaks animated fully on the GPU around the camera. */
import * as THREE from "three";

const vert = /* glsl */ `
attribute vec3 aOffset;
uniform float uTime;
uniform vec3 uCam;
uniform vec2 uWind;
uniform vec3 uBox;
varying float vA;
void main() {
  vec3 o = aOffset;
  o.y -= uTime * 32.0;
  o.xz += uWind * uTime * 6.0;
  vec3 p = mod(o - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
  // streak: position.y 0..1 along the fall direction (slanted with wind)
  vec3 dir = normalize(vec3(uWind * 0.25, -1.0));
  vec4 vp = viewMatrix * vec4(p + dir * position.y * 1.6, 1.0);
  vp.x += position.x * 0.04;
  vA = position.y;
  gl_Position = projectionMatrix * vp;
}`;
const frag = /* glsl */ `
uniform float uOpacity;
varying float vA;
void main() { gl_FragColor = vec4(0.75, 0.82, 0.92, uOpacity * (1.0 - vA)); }`;

export class Rain {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  constructor(count = 4000) {
    const base = new THREE.PlaneGeometry(1, 1, 1, 1);
    base.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    const off = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { off[i * 3] = Math.random() * 90; off[i * 3 + 1] = Math.random() * 45; off[i * 3 + 2] = Math.random() * 90; }
    g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
    g.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uBox: { value: new THREE.Vector3(90, 45, 90) }, uOpacity: { value: 0 } },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
  update(time: number, cam: THREE.Vector3, windDir: number, windSpeed: number, storm: number) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    (u.uCam.value as THREE.Vector3).copy(cam);
    (u.uWind.value as THREE.Vector2).set(Math.sin(windDir) * windSpeed * 3, Math.cos(windDir) * windSpeed * 3);
    u.uOpacity.value = storm * 0.55;
    this.mesh.visible = storm > 0.02;
  }
}
