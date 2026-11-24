/**
 * Deep horrors (Abyss Trench): giant anglers that stalk with a glowing lure, rear up behind a red line telegraph and lunge.
 * They replace the random serpents/krakens in the Trench (scripted monsters with their own controller). Chapter 26 keeps
 * two alive at all times ("survive 3:00 of horrors"); the Maelstrom Eye calls spawn() in its later phases.
 */
import * as THREE from "three";
import { DOCK_POS, zoneAt, type CampaignChapter, type MonsterS, type PlayerS } from "@freek/shared";
import { registerHazard, queueLook, type Hazard, type HazardCtx } from "./host";
import type { MonsterController, SoloNet } from "../SoloNet";
import { buildFish } from "../../entities/fishModels";
import { sfx } from "../../audio";

export const HORROR_NAME = "Deep Horror";

export function buildHorrorModel(): THREE.Object3D {
  const g = new THREE.Group();
  const body = buildFish("angler", "#2a1a4a");
  body.scale.setScalar(7);
  body.position.y = 1;
  g.add(body);
  const lure = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: "#9ff8ff" }));
  lure.position.set(0, 6.5, 5.5);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), new THREE.MeshBasicMaterial({ color: "#5ad8ff", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.copy(lure.position);
  const eyes = new THREE.MeshBasicMaterial({ color: "#ff3d6a" });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), eyes); e.position.set(s * 1.7, 2.6, 4.2); g.add(e); }
  g.add(lure, halo);
  g.userData.lure = halo;
  return g;
}

type St = "rise" | "stalk" | "telegraph" | "lunge" | "recover";

/** a horror's AI: stalk at ~20 m, telegraph a lunge line for 1 s, lunge, recover (harpoon window) */
export class HorrorCtl implements MonsterController {
  hitRadius = 6.5;
  private st: St = "rise";
  private t = 0;
  private from = { x: 0, z: 0 }; private to = { x: 0, z: 0 };
  private hit = false;
  private ang = Math.random() * Math.PI * 2;
  private stalkFor = 3 + Math.random() * 2;
  farFor = 0;
  constructor(private ctx: HazardCtx, readonly m: MonsterS, private dmg = 16, private tele: (x1: number, z1: number, x2: number, z2: number, dur: number) => void) {}

  private target(): { x: number; z: number; npc: { damage(n: number): void } | null } {
    const me = this.ctx.net.me, m = this.m;
    let best = { x: me.x, z: me.z, npc: null as { damage(n: number): void } | null }, bd = me.sunk ? Infinity : Math.hypot(me.x - m.x, me.z - m.z);
    for (const n of this.ctx.actors.targets()) { const d = Math.hypot(n.x - m.x, n.z - m.z) / 1.3; if (d < bd) { bd = d; best = { x: n.x, z: n.z, npc: n }; } }
    return best;
  }

  update(dt: number) {
    const m = this.m, net = this.ctx.net, me = net.me;
    this.t += dt;
    const tg = this.target();
    const dx = tg.x - m.x, dz = tg.z - m.z, d = Math.hypot(dx, dz) || 1;
    this.farFor = d > 200 ? this.farFor + dt : 0;
    const harbour = !tg.npc && Math.hypot(tg.x - DOCK_POS.x, tg.z - DOCK_POS.z) < 32;
    switch (this.st) {
      case "rise":
        m.state = "submerged";
        if (this.t > 1.4) { m.state = "chasing"; this.ctx.fx.splashAt(m.x, m.z, 3); sfx.roar(false); this.go("stalk"); }
        break;
      case "stalk": {
        m.state = "chasing";
        this.ang += dt * 0.6;
        const R = 20;
        const tx = tg.x + Math.sin(this.ang) * R, tz = tg.z + Math.cos(this.ang) * R;
        net.moveToward(m, tx, tz, d > 60 ? 13 : 9, dt);
        m.rot = Math.atan2(dx, dz);
        net.keepOutOfHarbour(m);
        if (this.t > this.stalkFor && d < 34 && !harbour && (!me.sunk || tg.npc)) {
          const len = Math.max(30, d + 12);
          this.from = { x: m.x, z: m.z };
          this.to = { x: m.x + (dx / d) * len, z: m.z + (dz / d) * len };
          this.tele(this.from.x, this.from.z, this.to.x, this.to.z, 1.0);
          this.go("telegraph");
        }
        break;
      }
      case "telegraph":
        m.rot = Math.atan2(this.to.x - m.x, this.to.z - m.z);
        if (this.t >= 1.0) { this.go("lunge"); this.hit = false; sfx.roar(false); this.ctx.monster(m.id)?.attack(); }
        break;
      case "lunge": {
        const k = Math.min(1, this.t / 0.6);
        m.state = "attacking";
        const px = m.x, pz = m.z;
        m.x = this.from.x + (this.to.x - this.from.x) * k;
        m.z = this.from.z + (this.to.z - this.from.z) * k;
        if (!this.hit) {
          if (!me.sunk && segDist(me.x, me.z, px, pz, m.x, m.z) < 4.5) { this.hit = true; net.damage(this.dmg, m.id); this.ctx.chase.shake(0.6); }
          for (const n of this.ctx.actors.targets()) if (segDist(n.x, n.z, px, pz, m.x, m.z) < 4.5) { this.hit = true; n.damage(Math.round(this.dmg * net.damageMult)); }
        }
        if (k >= 1) { this.ctx.fx.splashAt(m.x, m.z, 2.5); net.keepOutOfHarbour(m); this.go("recover"); }
        break;
      }
      case "recover":
        m.state = "chasing";
        if (this.t > 2) { this.go("stalk"); this.stalkFor = 2.5 + Math.random() * 2.5; this.ang = Math.atan2(m.x - tg.x, m.z - tg.z); }
        break;
    }
  }
  private go(s: St) { this.st = s; this.t = 0; }
}

function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export class Horrors implements Hazard {
  readonly id = "horrors";
  private want = false;
  private keep = 0;
  private nextAt = 20;
  private t = 0;
  private ctls = new Map<string, HorrorCtl>();
  private def: CampaignChapter | null = null;

  constructor(private ctx: HazardCtx) {
    // horrors are announced as "Deep Horror", not as the serpent they're built on
    const net = ctx.net as SoloNet & { emit: SoloNet["emit"] };
    const orig = net.emit.bind(net);
    net.emit = ((type: string, p: { text?: string }) => {
      if (type === "announce" && p?.text) p.text = p.text.replace("Reef Serpent", HORROR_NAME);
      return orig(type as never, p as never);
    }) as SoloNet["emit"];
  }

  onStart(def: CampaignChapter | null) {
    this.def = def;
    const net = this.ctx.net;
    this.want = net.randomMonsters && !def?.boss;
    net.randomMonsters = false; // the Trench has horrors instead of serpents
    // chapter 26 keeps two horrors hunting you; escort chapters keep one hunting the towed boat
    this.keep = def?.id === 26 ? 2 : def?.setup?.npcs?.length ? 1 : 0;
    this.nextAt = def?.id === 26 ? 4 : this.keep ? 20 : 30;
    this.t = 0;
    this.ctls.clear();
  }

  spawn(x?: number, z?: number, hp = 140): MonsterS {
    const net = this.ctx.net;
    const m = net.spawnMonster("serpent", { scripted: true, hp, dist: 50, ...(x !== undefined && z !== undefined ? { at: { x, z } } : {}) });
    const ctl = new HorrorCtl(this.ctx, m, 16, (a, b, c, d, dur) => this.ctx.bossFx.lineTelegraph(a, b, c, d, 7, dur));
    net.controllers.set(m.id, ctl);
    this.ctls.set(m.id, ctl);
    queueLook(m.id, (e) => e.setLook(HORROR_NAME, buildHorrorModel(), 11));
    return m;
  }

  get alive() { let n = 0; this.ctx.net.state.monsters.forEach((m) => { if (this.ctls.has(m.id)) n++; }); return n; }

  update(dt: number, me: PlayerS, paused: boolean) {
    const net = this.ctx.net;
    const t = performance.now() / 1000;
    // lure pulse
    for (const id of this.ctls.keys()) {
      const lure = this.ctx.monster(id)?.root.children.find((c) => c.userData.lure)?.userData.lure as THREE.Mesh | undefined;
      if (lure) lure.scale.setScalar(1 + Math.sin(t * 4 + id.length) * 0.25);
    }
    for (const [id, c] of this.ctls) {
      const m = net.state.monsters.get(id);
      if (!m) { this.ctls.delete(id); continue; }
      if (c.farFor > 25 && !this.keep) net.removeMonster(m);
    }
    if (paused || me.sunk || this.ctx.runner().status === "intro") return;
    this.t += dt;
    if (!this.want && !this.keep) return;
    if (this.t < this.nextAt) return;
    const alive = this.alive;
    if (this.keep && alive < this.keep) { this.spawn(); this.nextAt = this.t + 6; return; }
    if (this.want && alive < 1 && zoneAt(me.x, me.z) !== "shallows") { if (Math.random() < 0.6) this.spawn(); this.nextAt = this.t + 25 + Math.random() * 20; return; }
    this.nextAt = this.t + 8;
  }

  hint(me: PlayerS, phase: string): string {
    if (this.def?.id === 26 && phase === "idle" && !me.sunk && this.alive > 0) return "👁 A horror is hunting you: dodge the red line, then harpoon it while it recovers.";
    return "";
  }
}

registerHazard({ id: "horrors", when: (r) => r.id === "abyss_trench", create: (ctx) => new Horrors(ctx) });
