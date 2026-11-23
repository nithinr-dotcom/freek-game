/** One small offscreen-ish WebGL renderer that shows a rotating fish inside a DOM card. */
import * as THREE from "three";
import { createFish } from "../entities/fishFactory";
import { animateFish } from "../entities/fishModels";
import { updateMixer } from "../world/assets";

export class FishPreview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1.4, 0.1, 50);
  private fish: THREE.Object3D | null = null;
  private pivot = new THREE.Group();
  private t = 0;
  private glow: THREE.PointLight;
  active = false;

  constructor(w = 300, h = 210) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "fish-preview";
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0.35, 3.2);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#334455", 2.2));
    const d = new THREE.DirectionalLight("#ffffff", 2.5);
    d.position.set(2, 3, 2);
    this.scene.add(d);
    this.glow = new THREE.PointLight("#ffffff", 8, 6);
    this.glow.position.set(-1.5, -0.5, 1.5);
    this.scene.add(this.glow, this.pivot);
  }

  show(speciesId: string, tierColor: string) {
    if (this.fish) this.pivot.remove(this.fish);
    this.fish = createFish(speciesId);
    // normalise size to fit the card
    const box = new THREE.Box3().setFromObject(this.fish);
    const size = box.getSize(new THREE.Vector3());
    const s = 1.9 / Math.max(size.x, size.y, size.z, 0.001);
    this.fish.scale.multiplyScalar(s);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
    this.fish.position.sub(c);
    this.pivot.add(this.fish);
    this.glow.color.set(tierColor);
    this.t = 0;
    this.active = true;
  }

  render(dt: number) {
    if (!this.active || !this.fish) return;
    this.t += dt;
    this.pivot.rotation.y = Math.PI / 2 + Math.sin(this.t * 0.8) * 0.65;
    this.pivot.rotation.z = Math.sin(this.t * 1.7) * 0.08;
    this.pivot.position.y = Math.sin(this.t * 2) * 0.05;
    animateFish(this.fish, this.t, 1);
    updateMixer(this.fish, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
