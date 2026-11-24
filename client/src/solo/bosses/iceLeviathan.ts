/**
 * Ice Leviathan (Act 4 boss). It hides under an ice sheet of 7 hex plates (its glowing shadow shows which one).
 * Harpoon a plate twice to break it; when the Leviathan rests under a broken plate it is exposed (harpoonable) for a few
 * seconds. Frost breath: a blue cone telegraph (1.3 s) that spikes the cold meter, slows and "freezes" the boat.
 * P2 (<50%): it surfaces at the sheet's edge and rams ice floes at you along a red line; breath comes faster.
 * Broken plates refreeze after a while. The sheet blocks the boat and the drifting floes.
 */
import * as THREE from "three";
import { getRegion } from "@freek/shared";
import { BossBehaviour, registerBossBehaviour, type BossEnv } from "./registry";
import { hazardHost, queueLook } from "../hazards/host";
import type { IceFloes } from "../hazards/iceFloes";
import type { ColdMeter } from "../hazards/cold";
import { ConeTelegraphs } from "../../fx/cone";
import { waveHeight } from "../../world/ocean";
import { sfx } from "../../audio";

const PLATE_R = 9.6, RING = 17, SHEET_R = 27;
const BREATH_HALF = 0.36, BREATH_LEN = 50, BREATH_TELE = 1.3;
const REFREEZE = 16;

interface Plate { x: number; z: number; hp: number; broken: boolean; refreezeAt: number; mesh: THREE.Mesh; crack: THREE.Mesh; hole: THREE.Mesh }

type St = "move" | "rest" | "exposed" | "breath" | "ram";

class IceLeviathan extends BossBehaviour {
  private cx = 0; private cz = -175;
  private plates: Plate[] = [];
  private group = new THREE.Group();
  private shadow: THREE.Mesh;
  private cones: ConeTelegraphs | null = null;
  private st: St = "move";
  private stT = 0;
  private at = 0; private from = 0; private to = 0;
  private nextBreath = 6;
  private nextRam = 5;
  private exposeFor = 7;
  private breathDir = 0;
  private ramFrom = { x: 0, z: 0 }; private ramDir = { x: 0, z: 1 };
  private clock = 0;
  private alive = true;

  constructor(env: BossEnv) {
    super(env);
    this.hitRadius = 0;
    const pt = getRegion("frozen_fjord")?.points.ice_sheet;
    if (pt) { this.cx = pt.x; this.cz = pt.z; }
    const m = this.m;
    m.x = this.cx; m.z = this.cz; m.state = "submerged";
    const host = hazardHost.current;
    const scene = host?.ctx.scene;
    // plates
    const ice = new THREE.MeshStandardMaterial({ color: "#e8f7ff", emissive: "#8fd8ff", emissiveIntensity: 0.15, flatShading: true, roughness: 0.35 });
    const crackMat = new THREE.MeshBasicMaterial({ color: "#3fb8ff", transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const holeMat = new THREE.MeshBasicMaterial({ color: "#062033", transparent: true, opacity: 0.75, depthWrite: false });
    const spots = [{ x: 0, z: 0 }, ...Array.from({ length: 6 }, (_, i) => ({ x: Math.cos((i / 6) * Math.PI * 2) * RING, z: Math.sin((i / 6) * Math.PI * 2) * RING }))];
    for (const s of spots) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R * 0.95, 1.4, 6), ice);
      mesh.rotation.y = Math.PI / 6;
      const crack = new THREE.Mesh(crackGeometry(), crackMat);
      crack.position.y = 0.72; crack.visible = false;
      mesh.add(crack);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(PLATE_R * 0.9, 6), holeMat);
      hole.rotation.x = -Math.PI / 2; hole.visible = false;
      const x = this.cx + s.x, z = this.cz + s.z;
      mesh.position.set(x, 0.1, z); hole.position.set(x, 0.25, z);
      this.group.add(mesh, hole);
      this.plates.push({ x, z, hp: 2, broken: false, refreezeAt: 0, mesh, crack, hole });
    }
    // snow rim around the sheet
    const rim = new THREE.Mesh(new THREE.TorusGeometry(SHEET_R + 1, 2.2, 6, 40), new THREE.MeshStandardMaterial({ color: "#f4fbff", flatShading: true, roughness: 0.9 }));
    rim.rotation.x = Math.PI / 2; rim.scale.z = 0.35; rim.position.set(this.cx, 0.2, this.cz);
    this.group.add(rim);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: "#2a7fd0", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.scale.set(5, 9, 1);
    this.group.add(this.shadow);
    if (scene) { scene.add(this.group); this.cones = new ConeTelegraphs(scene); }
    // the sheet blocks the boat and the floes
    const floes = host?.get<IceFloes>("floes");
    floes?.statics.push({ x: this.cx, z: this.cz, r: SHEET_R });
    // harpoons that hit the ice crack plates
    env.net.on("harpoonFx", (p) => { if (this.alive && p.from === "me" && !p.hitMonster) this.harpoonAt(p.tx, p.tz); });
    // icy look for the serpent rig
    queueLook(m.id, (e) => {
      e.setLook(env.def.name, undefined, 16);
      e.root.scale.setScalar(2.1);
      e.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        const hsl = { h: 0, s: 0, l: 0 }; mat.color.getHSL(hsl);
        mat.color.setHSL(0.55, 0.45, Math.min(0.92, 0.45 + hsl.l * 0.6));
        if (mat.emissiveIntensity > 0.5) mat.emissive.set("#7fe8ff");
        mesh.material = mat;
      });
    });
    host?.addTicker((dt, paused) => this.frame(dt, paused));
    if (this.phase >= 1) this.nextRam = 3;
    this.pickTarget();
  }

  private get floes() { return hazardHost.current?.get<IceFloes>("floes"); }
  private get cold() { return hazardHost.current?.get<ColdMeter>("cold"); }
  private plateAt(x: number, z: number) { return this.plates.find((p) => Math.hypot(p.x - x, p.z - z) < PLATE_R); }

  private harpoonAt(x: number, z: number) {
    const p = this.plateAt(x, z);
    if (!p || p.broken) return;
    p.hp--;
    const fx = this.env.fx;
    fx.splash(p.x, p.z, 1.2);
    sfx.hit();
    if (p.hp <= 0) {
      p.broken = true; p.refreezeAt = this.clock + REFREEZE;
      fx.splash(p.x, p.z, 3.5); fx.shake(0.3); sfx.slam();
      const host = hazardHost.current;
      host?.ctx.fx.sparkAt(new THREE.Vector3(p.x, 1, p.z), "#cff4ff", 70);
      if (this.plates.indexOf(p) === this.at && (this.st === "rest" || this.st === "move")) this.expose();
    } else p.crack.visible = true;
  }

  private pickTarget() {
    const me = this.me;
    // prefer plates on the far side from the boat, never the same one
    const opts = this.plates.map((p, i) => ({ i, d: Math.hypot(p.x - me.x, p.z - me.z) })).filter((o) => o.i !== this.at);
    opts.sort((a, b) => b.d - a.d + (Math.random() - 0.5) * 30);
    this.from = this.at; this.to = opts[Math.floor(Math.random() * Math.min(4, opts.length))].i;
    this.go("move");
  }
  private go(s: St) { this.st = s; this.stT = 0; }

  private expose() {
    this.go("exposed");
    this.exposeFor = this.phase >= 1 ? 6 : 7;
    this.m.state = "chasing";
    this.hitRadius = 9;
    this.env.fx.splash(this.m.x, this.m.z, 5);
    this.env.fx.roar(true);
    this.env.fx.announce("The Ice Leviathan is exposed! Harpoon it!");
  }
  private submerge() {
    this.m.state = "submerged";
    this.hitRadius = 0;
    this.env.fx.splash(this.m.x, this.m.z, 3);
  }

  protected enterPhase(p: number) {
    if (p !== 1) return;
    this.env.fx.roar(true); this.env.fx.shake(0.9);
    this.env.fx.announce("The Ice Leviathan is enraged: it's throwing the ice at you!");
    this.submerge();
    this.nextRam = 2.5;
    this.pickTarget();
  }

  private startBreath() {
    const m = this.m, me = this.me;
    this.breathDir = Math.atan2(me.x - m.x, me.z - m.z);
    this.cones?.cone(m.x, m.z, this.breathDir, BREATH_HALF, BREATH_LEN, BREATH_TELE, () => this.breathHit());
    this.env.fx.attackAnim();
    this.env.fx.roar(false);
    this.go("breath");
  }
  private breathHit() {
    if (!this.alive) return;
    const m = this.m, me = this.me, host = hazardHost.current;
    for (let i = 1; i <= 5; i++) {
      const r = (BREATH_LEN / 5) * i;
      host?.ctx.fx.sparkAt(new THREE.Vector3(m.x + Math.sin(this.breathDir) * r, 1.5, m.z + Math.cos(this.breathDir) * r), "#cff4ff", 30);
    }
    sfx.slam();
    if (!me.sunk && ConeTelegraphs.inside(me.x, me.z, m.x, m.z, this.breathDir, BREATH_HALF, BREATH_LEN, 2.4)) {
      this.cold?.spike(0.25, 3);
      this.env.net.damage(5, m.id);
    }
    for (const n of host?.ctx.actors.npcs ?? []) if (n.alive && ConeTelegraphs.inside(n.x, n.z, m.x, m.z, this.breathDir, BREATH_HALF, BREATH_LEN)) n.damage(10);
  }

  private startRam() {
    const me = this.me;
    // surface at the edge facing the boat
    const a = Math.atan2(me.x - this.cx, me.z - this.cz) + (Math.random() - 0.5) * 0.6;
    this.ramFrom = { x: this.cx + Math.sin(a) * (SHEET_R + 3), z: this.cz + Math.cos(a) * (SHEET_R + 3) };
    const dx = me.x - this.ramFrom.x, dz = me.z - this.ramFrom.z, d = Math.hypot(dx, dz) || 1;
    this.ramDir = { x: dx / d, z: dz / d };
    const len = Math.max(60, d + 20);
    this.env.fx.lineTelegraph(this.ramFrom.x, this.ramFrom.z, this.ramFrom.x + this.ramDir.x * len, this.ramFrom.z + this.ramDir.z * len, 9, 1.2);
    this.m.x = this.cx + Math.sin(a) * (SHEET_R - 4); this.m.z = this.cz + Math.cos(a) * (SHEET_R - 4);
    this.m.state = "chasing"; this.hitRadius = 8;
    this.m.rot = a;
    this.env.fx.splash(this.m.x, this.m.z, 4);
    this.go("ram");
  }

  protected tick(dt: number) {
    const m = this.m, me = this.me;
    this.clock += dt;
    this.stT += dt;
    // refreeze broken plates the Leviathan isn't using
    for (const [i, p] of this.plates.entries()) {
      if (p.broken && this.clock > p.refreezeAt && !(i === this.at && this.st === "exposed")) { p.broken = false; p.hp = 2; p.crack.visible = false; this.env.fx.splash(p.x, p.z, 1); }
    }
    if (me.sunk) { if (this.st === "exposed") { this.submerge(); this.pickTarget(); } return; }
    this.nextBreath -= dt;
    if (this.phase >= 1) this.nextRam -= dt;
    switch (this.st) {
      case "move": {
        const a = this.plates[this.from], b = this.plates[this.to];
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const k = Math.min(1, this.stT * (this.phase >= 1 ? 9 : 7) / len);
        m.x = a.x + (b.x - a.x) * k; m.z = a.z + (b.z - a.z) * k;
        m.rot = Math.atan2(b.x - a.x, b.z - a.z);
        m.state = "submerged"; this.hitRadius = 0;
        if (k >= 1) { this.at = this.to; this.go("rest"); if (b.broken) this.expose(); }
        break;
      }
      case "rest":
        m.state = "submerged";
        if (this.nextBreath <= 0) { this.nextBreath = (this.phase >= 1 ? 5.5 : 7.5) + Math.random() * 2; this.startBreath(); break; }
        if (this.phase >= 1 && this.nextRam <= 0) { this.nextRam = 6 + Math.random() * 2; this.startRam(); break; }
        if (this.stT > (this.phase >= 1 ? 3.5 : 4.5)) this.pickTarget();
        break;
      case "exposed":
        m.rot = Math.atan2(me.x - m.x, me.z - m.z);
        if (this.nextBreath <= 0 && this.stT > 1.5) { this.nextBreath = (this.phase >= 1 ? 5 : 7) + Math.random() * 2; this.cones?.cone(m.x, m.z, Math.atan2(me.x - m.x, me.z - m.z), BREATH_HALF, BREATH_LEN, BREATH_TELE, () => this.breathHit()); this.breathDir = Math.atan2(me.x - m.x, me.z - m.z); this.env.fx.attackAnim(); this.env.fx.roar(false); }
        if (this.stT > this.exposeFor) { this.submerge(); this.pickTarget(); }
        break;
      case "breath":
        m.rot = this.breathDir;
        if (this.stT > BREATH_TELE + 0.4) { const p = this.plates[this.at]; this.go("rest"); this.stT = 1.5; if (p.broken) this.expose(); }
        break;
      case "ram":
        m.rot = Math.atan2(this.ramDir.x, this.ramDir.z);
        if (this.stT >= 1.2 && this.stT - dt < 1.2) {
          this.floes?.launch(this.ramFrom.x, this.ramFrom.z, this.ramDir.x, this.ramDir.z, 26, 4.5, 18);
          this.env.fx.roar(false); this.env.fx.attackAnim();
          if (Math.random() < 0.5) { const s = (Math.random() < 0.5 ? -1 : 1) * 0.22; this.floes?.launch(this.ramFrom.x, this.ramFrom.z, this.ramDir.x * Math.cos(s) - this.ramDir.z * Math.sin(s), this.ramDir.z * Math.cos(s) + this.ramDir.x * Math.sin(s), 22, 3.5, 14); }
        }
        if (this.stT > 2.6) { this.submerge(); this.at = this.nearestPlate(m.x, m.z); this.pickTarget(); }
        break;
    }
  }
  private nearestPlate(x: number, z: number) { let bi = 0, bd = Infinity; this.plates.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; bi = i; } }); return bi; }

  /** visuals + cleanup (runs even while the game is paused) */
  private frame(dt: number, paused: boolean): boolean {
    const net = this.env.net;
    if (!net.state.monsters.has(this.m.id)) { this.dispose(); return false; }
    const t = performance.now() / 1000;
    if (!paused) this.cones?.update(dt, t);
    for (const p of this.plates) {
      p.mesh.visible = !p.broken;
      p.hole.visible = p.broken;
      p.mesh.position.y = waveHeight(p.x, p.z) * 0.3 + 0.1;
    }
    const m = this.m;
    this.shadow.visible = m.state === "submerged";
    this.shadow.position.set(m.x, 0.95, m.z);
    this.shadow.rotation.z = -m.rot;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(t * 3);
    // the sheet chills the air around it
    const c = this.cold, me = net.me;
    if (c) c.extraDrain = Math.hypot(me.x - this.cx, me.z - this.cz) < 70 ? 1.15 : 1;
    return true;
  }
  private dispose() {
    this.alive = false;
    const host = hazardHost.current;
    host?.ctx.scene.remove(this.group);
    this.cones?.clear();
    const f = this.floes;
    if (f) f.statics = f.statics.filter((s) => !(s.x === this.cx && s.z === this.cz));
    const c = this.cold; if (c) c.extraDrain = 1;
  }
}

function crackGeometry(): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.random();
    let x = 0, z = 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + Math.cos(a + (Math.random() - 0.5)) * 2.2, nz = z + Math.sin(a + (Math.random() - 0.5)) * 2.2;
      // thin quad from (x,z) to (nx,nz)
      const dx = nx - x, dz = nz - z, l = Math.hypot(dx, dz) || 1, w = 0.18;
      const px = (-dz / l) * w, pz = (dx / l) * w;
      pts.push(x + px, 0, z + pz, x - px, 0, z - pz, nx + px, 0, nz + pz, nx + px, 0, nz + pz, x - px, 0, z - pz, nx - px, 0, nz - pz);
      x = nx; z = nz;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

registerBossBehaviour("ice_leviathan", (env) => new IceLeviathan(env));
