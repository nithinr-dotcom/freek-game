/** A player's boat: model, wave bobbing/tilt, wake, name tag, sinking/respawn animation. */
import * as THREE from "three";
import { SQUADS, type SquadId, type Cosmetic } from "@freek/shared";
import { buildBoat, animateFlag, type BoatParts } from "../world/models";
import { Assets, updateMixer } from "../world/assets";
import { waveHeight } from "../world/ocean";
import type { Labels, Label } from "../ui/labels";
import type { Wake } from "../fx/wake";
import { damp, escapeHtml } from "../util";

export class Boat {
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private model: THREE.Object3D;
  private parts: BoatParts | null = null;
  private flag: THREE.Mesh | null = null;
  private flagMat: THREE.MeshStandardMaterial;
  readonly rodTip: THREE.Object3D;
  private rodPivot: THREE.Object3D | null = null;
  private label: Label;
  private tagEl: HTMLElement;
  x = 0; z = 0; rot = 0; speed = 0;
  private pitch = 0; private roll = 0; private heave = 0;
  private wakeTimer = 0;
  private sinkT = -1; // <0 = afloat
  private popT = 1;
  sunk = false;
  /** 0..1 rod bend while reeling */
  rodBend = 0;
  private squad: SquadId | "" = "";
  private nameStr = ""; private level = 0;
  /** solo cosmetics (paint / sail / flag); null = squad colours */
  private cos: { paint: Cosmetic; sail: Cosmetic; flag: Cosmetic } | null = null;
  private sailMesh: THREE.Mesh | null = null;
  private extraTag = "";

  constructor(scene: THREE.Scene, private labels: Labels, public readonly id: string, public readonly isLocal: boolean) {
    const color = "#cccccc";
    if (Assets.has("boat")) {
      this.model = Assets.create("boat", () => new THREE.Group());
      // attachments so GLB boats still get a squad flag and a rod tip
      const flagGeo = new THREE.PlaneGeometry(1.0, 0.6, 6, 2);
      flagGeo.translate(0.5, 0, 0);
      this.flagMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, flatShading: true });
      this.flag = new THREE.Mesh(flagGeo, this.flagMat);
      this.flag.userData.base = Float32Array.from(flagGeo.attributes.position.array as Float32Array);
      this.flag.position.set(0, 4.2, 0.6);
      this.model.add(this.flag);
      this.rodTip = new THREE.Object3D();
      this.rodTip.position.set(1.8, 3.2, -0.6);
      this.model.add(this.rodTip);
    } else {
      this.parts = buildBoat(color);
      this.model = this.parts.root;
      this.flag = this.parts.flag;
      this.flagMat = this.parts.flagMat;
      this.rodTip = this.parts.rodTip;
      this.rodPivot = this.model.userData.rodPivot ?? null;
    }
    this.model.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    this.tilt.add(this.model);
    this.root.add(this.tilt);
    scene.add(this.root);
    this.tagEl = document.createElement("div");
    this.tagEl.className = `nametag${isLocal ? " me" : ""}`;
    this.label = this.labels.add(this.tagEl, 260);
  }

  setInfo(name: string, squad: SquadId | "", level: number) {
    if (name === this.nameStr && squad === this.squad && level === this.level) return;
    this.nameStr = name; this.squad = squad; this.level = level;
    const col = squad && SQUADS[squad] ? SQUADS[squad].color : "#cfd8e3";
    this.flagMat.color.set(col);
    if (this.parts) this.parts.stripeMat.color.set(col);
    this.tagEl.style.setProperty("--sq", col);
    this.tagEl.innerHTML = `<span class="lvl">${level}</span><span class="nm">${escapeHtml(name || "Sailor")}</span>${this.extraTag}`;
    if (this.cos) this.paintCosmetics();
  }

  /** solo: title under the name tag */
  setTitle(t: string) { this.extraTag = t ? `<span class="ttl">${escapeHtml(t)}</span>` : ""; this.nameStr = ""; }

  /** solo boat cosmetics: hull paint, a patterned sail and flag */
  applyCosmetics(c: { paint: Cosmetic; sail: Cosmetic; flag: Cosmetic }) {
    this.cos = c;
    this.paintCosmetics();
  }
  private paintCosmetics() {
    const c = this.cos!;
    this.flagMat.color.set("#ffffff");
    this.flagMat.map = patternTexture(c.flag, 64, 40);
    this.flagMat.needsUpdate = true;
    if (this.parts) {
      this.parts.stripeMat.color.set(c.paint.color2 ?? "#f4f1ea");
      const hull = this.parts.root.children[0] as THREE.Mesh;
      const mats = hull.material as THREE.MeshStandardMaterial[];
      if (Array.isArray(mats)) {
        if (!mats[1].userData.own) { mats[1] = mats[1].clone(); mats[1].userData.own = true; }
        mats[1].color.set(c.paint.color);
      }
      if (!this.sailMesh) {
        // P4: a square sail on a yard, facing the chase camera (the old fore-and-aft triangle was edge-on from
        // behind). Billowed forward so the pattern reads from behind and from the side.
        const W = 1.9, H = 1.45;
        const g = new THREE.PlaneGeometry(W, H, 8, 4);
        const pos = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i);
          const u = x / (W / 2), v = (y + H / 2) / H;
          pos.setZ(i, 0.32 * (1 - u * u) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1))));
        }
        g.computeVertexNormals();
        g.translate(0, 3.05, 0.78);
        this.sailMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, flatShading: true, roughness: 0.9 }));
        this.sailMesh.castShadow = true;
        const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, W + 0.25, 5), new THREE.MeshStandardMaterial({ color: "#5a3a22", flatShading: true }));
        yard.rotation.z = Math.PI / 2; yard.position.set(0, 3.05 + H / 2 + 0.03, 0.8);
        this.sailMesh.add(yard);
        this.parts.root.add(this.sailMesh);
        // bigger flag so the cosmetic reads from the chase camera
        this.parts.flag.scale.set(1.45, 1.45, 1);
      }
      const sm = this.sailMesh.material as THREE.MeshStandardMaterial;
      sm.map = patternTexture(c.sail, 64, 64);
      sm.needsUpdate = true;
    }
  }

  setPose(x: number, z: number, rot: number, speed: number) { this.x = x; this.z = z; this.rot = rot; this.speed = speed; }

  setSunk(s: boolean) {
    if (s === this.sunk) return;
    this.sunk = s;
    if (s) this.sinkT = 0;
    else { this.sinkT = -1; this.popT = 0; this.root.visible = true; }
  }

  get position(): THREE.Vector3 { return this.root.position; }

  /** world position of the rod tip */
  rodTipWorld(out: THREE.Vector3): THREE.Vector3 { return this.rodTip.getWorldPosition(out); }

  update(dt: number, t: number, windSpeed: number, wake: Wake) {
    const fwdX = Math.sin(this.rot), fwdZ = Math.cos(this.rot);
    const h = waveHeight(this.x, this.z);
    const hb = waveHeight(this.x + fwdX * 2.8, this.z + fwdZ * 2.8), hs = waveHeight(this.x - fwdX * 2.4, this.z - fwdZ * 2.4);
    const hr = waveHeight(this.x + fwdZ * 1.4, this.z - fwdX * 1.4), hl = waveHeight(this.x - fwdZ * 1.4, this.z + fwdX * 1.4);
    const avg = (h * 2 + hb + hs + hl + hr) / 6;
    this.heave = damp(this.heave, avg, 8, dt);
    this.pitch = damp(this.pitch, Math.atan2(hs - hb, 5.2) - this.speed * 0.006, 6, dt);
    this.roll = damp(this.roll, Math.atan2(hr - hl, 2.8), 6, dt);
    this.root.position.set(this.x, this.heave - 0.15, this.z);
    this.root.rotation.y = this.rot;
    this.tilt.rotation.set(this.pitch, 0, this.roll);

    if (this.sinkT >= 0) {
      this.sinkT += dt;
      const k = Math.min(1, this.sinkT / 2.6);
      this.tilt.rotation.z += k * 0.9;
      this.tilt.rotation.x += k * 0.4;
      this.root.position.y -= k * k * 7;
      if (k >= 1) this.root.visible = false;
    }
    if (this.popT < 1) {
      this.popT = Math.min(1, this.popT + dt * 2.5);
      const s = 1 + Math.sin(this.popT * Math.PI) * 0.25;
      this.model.scale.setScalar(Math.max(0.01, this.popT < 0.2 ? this.popT * 5 : s));
    } else this.model.scale.setScalar(1);

    if (this.flag) animateFlag(this.flag, t + this.id.length, windSpeed);
    if (this.rodPivot) this.rodPivot.rotation.x = 0.55 - this.rodBend * 0.45 + Math.sin(t * 20) * this.rodBend * 0.03;
    updateMixer(this.model, dt);

    // wake + spray
    if (!this.sunk && Math.abs(this.speed) > 1.2) {
      this.wakeTimer -= dt;
      if (this.wakeTimer <= 0) {
        this.wakeTimer = 0.07;
        const sx = this.x - fwdX * 2.8, sz = this.z - fwdZ * 2.8;
        const sp = Math.min(1, Math.abs(this.speed) / 14);
        wake.spawn(sx + fwdZ * 0.7, sz - fwdX * 0.7, 0.9 + sp, 2.6, 2.5 + sp * 2);
        wake.spawn(sx - fwdZ * 0.7, sz + fwdX * 0.7, 0.9 + sp, 2.6, 2.5 + sp * 2);
        if (sp > 0.5) wake.spawn(this.x + fwdX * 2.6, this.z + fwdZ * 2.6, 0.8, 1.0, 1.5);
      }
    }
    this.label.pos.set(this.root.position.x, this.root.position.y + 5.2, this.root.position.z);
    this.label.visible = this.root.visible && this.sinkT < 0;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.root);
    this.labels.remove(this.label);
  }
}

const texCache = new Map<string, THREE.CanvasTexture>();
/** small canvas texture for a cosmetic pattern (solid / stripe / star / wave / skull) */
function patternTexture(c: Cosmetic, w: number, hgt: number): THREE.CanvasTexture {
  const key = `${c.id}:${w}x${hgt}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = hgt;
  const g = cv.getContext("2d")!;
  g.fillStyle = c.color; g.fillRect(0, 0, w, hgt);
  g.fillStyle = c.color2 ?? c.color;
  switch (c.pattern) {
    case "stripe": for (let i = 0; i < 3; i++) g.fillRect(0, hgt * (0.15 + i * 0.3), w, hgt * 0.12); break;
    case "wave": g.beginPath(); g.moveTo(0, hgt * 0.6); for (let x = 0; x <= w; x += 4) g.lineTo(x, hgt * 0.6 + Math.sin(x / 6) * hgt * 0.08); g.lineTo(w, hgt); g.lineTo(0, hgt); g.fill(); break;
    case "star": {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? hgt * 0.14 : hgt * 0.32; g.lineTo(w / 2 + Math.cos(a) * r, hgt / 2 + Math.sin(a) * r); }
      g.fill(); break;
    }
    case "skull":
      g.beginPath(); g.arc(w / 2, hgt * 0.42, hgt * 0.22, 0, Math.PI * 2); g.fill();
      g.fillRect(w / 2 - hgt * 0.12, hgt * 0.55, hgt * 0.24, hgt * 0.16);
      g.fillStyle = c.color; g.beginPath(); g.arc(w / 2 - hgt * 0.09, hgt * 0.42, hgt * 0.06, 0, 7); g.arc(w / 2 + hgt * 0.09, hgt * 0.42, hgt * 0.06, 0, 7); g.fill();
      break;
    default: break;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
