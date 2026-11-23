/** Monster visual: interpolated position, surfacing/submerging, attack animation, hp bar label. */
import * as THREE from "three";
import { MONSTERS, type MonsterKind, type MonsterS } from "@freek/shared";
import { buildSerpent, buildKraken, type MonsterRig } from "./monsterModels";
import { Assets, updateMixer } from "../world/assets";
import { waveHeight } from "../world/ocean";
import type { Labels, Label } from "../ui/labels";
import { damp, dampAngle } from "../util";

export class MonsterEntity {
  readonly root = new THREE.Group();
  private rig: MonsterRig | null = null;
  private model: THREE.Object3D;
  private label: Label;
  private bar: HTMLElement;
  private hpText: HTMLElement;
  x = 0; z = 0; rot = 0;
  private depth = -14;
  private attackT = 0;
  submerged = true;
  hp = 1; maxHp = 1;
  private first = true;
  onSurface: ((x: number, z: number, big: boolean) => void) | null = null;

  constructor(private scene: THREE.Scene, private labels: Labels, public readonly id: string, public readonly kind: MonsterKind) {
    const key = MONSTERS[kind]?.model ?? `monster_${kind}`;
    if (Assets.has(key)) this.model = Assets.create(key, () => new THREE.Group());
    else {
      this.rig = kind === "kraken" ? buildKraken() : buildSerpent();
      this.model = this.rig.root;
    }
    this.root.add(this.model);
    scene.add(this.root);
    const el = document.createElement("div");
    el.className = `monster-tag ${kind}`;
    el.innerHTML = `<div class="mname">☠ ${MONSTERS[kind]?.name ?? kind}</div><div class="mbar"><div class="mfill"></div></div><div class="mhp"></div>`;
    this.bar = el.querySelector(".mfill") as HTMLElement;
    this.hpText = el.querySelector(".mhp") as HTMLElement;
    this.label = labels.add(el, 400);
  }

  get isBoss() { return MONSTERS[this.kind]?.boss ?? false; }

  attack() { this.attackT = 0.001; }

  sync(m: MonsterS) {
    if (this.first) { this.x = m.x; this.z = m.z; this.rot = m.rot; this.first = false; }
    this.tx = m.x; this.tz = m.z; this.trot = m.rot;
    this.hp = m.hp; this.maxHp = m.maxHp || MONSTERS[this.kind]?.hp || 1;
    const sub = m.state === "submerged";
    if (this.submerged && !sub) this.onSurface?.(m.x, m.z, this.isBoss);
    this.submerged = sub;
  }
  private tx = 0; private tz = 0; private trot = 0;

  update(dt: number, t: number) {
    this.x = damp(this.x, this.tx, 6, dt);
    this.z = damp(this.z, this.tz, 6, dt);
    this.rot = dampAngle(this.rot, this.trot, 5, dt);
    const targetDepth = this.submerged ? -16 : 0;
    this.depth = damp(this.depth, targetDepth, this.submerged ? 1.2 : 1.8, dt);
    const wy = waveHeight(this.x, this.z);
    this.root.position.set(this.x, wy + this.depth, this.z);
    this.root.rotation.y = this.rot;
    if (this.attackT > 0) {
      this.attackT += dt / (this.kind === "kraken" ? 1.6 : 1.1);
      if (this.attackT >= 1) this.attackT = 0;
    }
    if (this.rig) this.rig.animate(t, dt, this.attackT);
    else {
      updateMixer(this.model, dt);
      this.model.position.y = Math.sin(t * 1.5) * 0.4 + Math.sin(this.attackT * Math.PI) * 3;
    }
    this.root.visible = this.depth > -15.5;
    const k = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    this.hpText.textContent = `${Math.ceil(this.hp)} / ${this.maxHp}`;
    this.label.pos.set(this.x, wy + (this.kind === "kraken" ? 15 : 9), this.z);
    this.label.visible = this.depth > -4;
  }

  /** point to aim at / show hits */
  hitPoint(out: THREE.Vector3) { return out.set(this.x, waveHeight(this.x, this.z) + (this.kind === "kraken" ? 5 : 2.5), this.z); }

  dispose() {
    this.scene.remove(this.root);
    this.labels.remove(this.label);
  }
}
