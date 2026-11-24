/** DOM labels anchored to world positions (name tags, hp bars, damage numbers). */
import * as THREE from "three";

interface Label { el: HTMLElement; pos: THREE.Vector3; maxDist: number; visible: boolean }
interface Floater { el: HTMLElement; pos: THREE.Vector3; t: number; life: number; rise: number }

export class Labels {
  readonly root: HTMLElement;
  private labels = new Set<Label>();
  private floaters: Floater[] = [];
  private v = new THREE.Vector3();
  constructor(root: HTMLElement) { this.root = root; }

  add(el: HTMLElement, maxDist = 220): Label {
    el.classList.add("world-label");
    this.root.append(el);
    const l: Label = { el, pos: new THREE.Vector3(), maxDist, visible: true };
    this.labels.add(l);
    return l;
  }
  remove(l: Label) { l.el.remove(); this.labels.delete(l); }

  /** float text that rises and fades (damage numbers, +XP) */
  float(text: string, pos: THREE.Vector3, cls = "", life = 1.3) {
    const el = document.createElement("div");
    el.className = `float-num ${cls}`;
    el.textContent = text;
    this.root.append(el);
    this.floaters.push({ el, pos: pos.clone(), t: 0, life, rise: 4 });
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number) {
    const camPos = (camera as THREE.PerspectiveCamera).position;
    for (const l of this.labels) {
      const show = l.visible && this.place(l.el, l.pos, camera, w, h) && camPos.distanceTo(l.pos) < l.maxDist;
      l.el.style.display = show ? "" : "none";
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      this.v.copy(f.pos); this.v.y += f.rise * k;
      const ok = this.place(f.el, this.v, camera, w, h);
      f.el.style.display = ok ? "" : "none";
      f.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }
  }

  private place(el: HTMLElement, pos: THREE.Vector3, camera: THREE.Camera, w: number, h: number): boolean {
    this.v.copy(pos).project(camera);
    if (this.v.z > 1 || this.v.z < -1) return false;
    const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
    el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    return true;
  }
}
export type { Label };
