/**
 * Generic chapter actors: reach markers, floating pickups and NPC boats (towed escorts / moored defend targets).
 * Logic and visuals live together; the chapter runner reads the events they return each frame.
 */
import * as THREE from "three";
import type { CampaignChapter, ObjectiveKind, RegionDef } from "@freek/shared";
import { Boat } from "../entities/Boat";
import type { Labels, Label } from "../ui/labels";
import type { Effects } from "../fx/effects";
import { surfaceRing } from "../world/decals";
import { waveHeight } from "../world/ocean";
import { damp, dampAngle } from "../util";
import { sfx } from "../audio";
import type { ObjEvent } from "./objectives";
import type { MonsterTarget } from "./SoloNet";

export interface ActorEnv { scene: THREE.Scene; labels: Labels; fx: Effects }
export interface MapExtra { x: number; z: number; icon: string; color: string; pulse?: boolean }

const PICKUP_LOOK: Record<string, { color: string; icon: string; geo: () => THREE.BufferGeometry }> = {
  pearl: { color: "#f4f0ff", icon: "⚪", geo: () => new THREE.IcosahedronGeometry(0.55, 1) },
  crate: { color: "#c98a4a", icon: "📦", geo: () => new THREE.BoxGeometry(1.1, 1.1, 1.1) },
  fuel: { color: "#ff7a3d", icon: "⛽", geo: () => new THREE.CylinderGeometry(0.45, 0.45, 1.1, 8) },
  stormglass: { color: "#8fd0ff", icon: "🔷", geo: () => new THREE.OctahedronGeometry(0.7) },
};
/** later acts add pickup kinds (looks) here */
export function registerPickupLook(kind: string, look: { color: string; icon: string; geo: () => THREE.BufferGeometry }) { PICKUP_LOOK[kind] = look; }

export class Marker {
  readonly group = new THREE.Group();
  private beam: THREE.Mesh; private ring: THREE.Mesh;
  private label: Label;
  reached = false;
  constructor(private env: ActorEnv, readonly pointId: string, readonly x: number, readonly z: number, text: string, readonly color = "#ffd24a") {
    const geo = new THREE.CylinderGeometry(1.2, 2.2, 60, 16, 1, true);
    geo.translate(0, 30, 0);
    this.beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.ring = surfaceRing(9, color, 0.9);
    this.group.add(this.beam);
    this.group.position.set(x, 0, z);
    this.ring.position.set(x, 0, z);
    env.scene.add(this.group, this.ring);
    const el = document.createElement("div");
    el.className = "marker-tag";
    el.innerHTML = `<span>📍 ${text}</span>`;
    this.label = env.labels.add(el, 900);
    this.label.pos.set(x, 14, z);
  }
  update(time: number) {
    (this.beam.material as THREE.MeshBasicMaterial).opacity = this.reached ? 0 : 0.16 + 0.08 * Math.sin(time * 3);
    (this.ring.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    this.ring.visible = !this.reached;
    this.label.visible = !this.reached;
  }
  dispose() { this.env.scene.remove(this.group, this.ring); this.env.labels.remove(this.label); }
}

export class Pickup {
  readonly mesh: THREE.Mesh;
  taken = false;
  private phase = Math.random() * 10;
  constructor(private env: ActorEnv, readonly kind: string, readonly x: number, readonly z: number) {
    const look = PICKUP_LOOK[kind] ?? PICKUP_LOOK.pearl;
    this.mesh = new THREE.Mesh(look.geo(), new THREE.MeshStandardMaterial({ color: look.color, emissive: look.color, emissiveIntensity: 0.9, flatShading: true, roughness: 0.3 }));
    env.scene.add(this.mesh);
  }
  update(time: number) {
    this.mesh.position.set(this.x, waveHeight(this.x, this.z) + 0.6 + Math.sin(time * 2 + this.phase) * 0.2, this.z);
    this.mesh.rotation.y = time + this.phase;
  }
  dispose() { this.env.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

export class NpcBoat implements MonsterTarget {
  readonly boat: Boat;
  private rope: THREE.Line | null = null;
  private tag: HTMLElement; private bar: HTMLElement; private label: Label;
  hp: number; x: number; z: number; rot = 0; speed = 0;
  alive = true;
  arrived = false;
  /** tow boats wait where they are until the player sails within reach of the rope */
  attached = false;
  priority = 1.6;
  constructor(private env: ActorEnv, readonly id: string, readonly name: string, readonly maxHp: number, readonly mode: "tow" | "moored", x: number, z: number, wake: Effects["wake"]) {
    this.hp = maxHp; this.x = x; this.z = z;
    this.wake = wake;
    this.boat = new Boat(env.scene, env.labels, `npc_${id}`, false);
    this.boat.setInfo(name, "sun", 0);
    this.boat.setPose(x, z, 0, 0);
    if (mode === "tow") {
      const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3()));
      this.rope = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#e6d3a3" }));
      this.rope.frustumCulled = false;
      env.scene.add(this.rope);
    }
    this.bar = document.createElement("div");
    this.bar.className = "npc-fill";
    this.tag = document.createElement("div");
    this.tag.className = "npc-tag";
    this.tag.innerHTML = `<div class="npc-name">${mode === "tow" ? "⛓" : "⚓"} ${name}</div><div class="npc-bar"></div>`;
    this.tag.querySelector(".npc-bar")!.append(this.bar);
    this.label = env.labels.add(this.tag, 400);
  }
  private wake: Effects["wake"];
  get hpPct() { return this.hp / this.maxHp; }

  damage(n: number) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - n);
    this.env.labels.float(`-${n}`, new THREE.Vector3(this.x, 4, this.z), "dmg", 1.2);
    this.env.fx.splashAt(this.x, this.z, 1.5);
    this.tag.classList.remove("hit"); void this.tag.offsetWidth; this.tag.classList.add("hit");
    if (this.hp <= 0) { this.alive = false; this.boat.setSunk(true); sfx.sink(); }
  }

  update(dt: number, time: number, player: { x: number; z: number; rot: number; speed: number }) {
    if (this.alive && this.mode === "tow" && !this.arrived) {
      const L = 11;
      const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz) || 1;
      if (!this.attached && d < 16) { this.attached = true; sfx.mission(); this.env.labels.float("⛓ Tow rope on!", new THREE.Vector3(this.x, 5, this.z), "pts", 1.6); }
      if (this.attached && d > L) {
        const pull = d - L;
        this.x += (dx / d) * pull * Math.min(1, dt * 6);
        this.z += (dz / d) * pull * Math.min(1, dt * 6);
      }
      this.rot = dampAngle(this.rot, Math.atan2(dx, dz), 3, dt);
      this.speed = damp(this.speed, this.attached && d > L ? Math.abs(player.speed) : 0, 4, dt);
    }
    this.boat.setPose(this.x, this.z, this.rot, this.speed);
    this.boat.update(dt, time, 0.3, this.wake);
    if (this.rope) {
      this.rope.visible = this.alive && !this.arrived && this.attached;
      const a = new THREE.Vector3(player.x, waveHeight(player.x, player.z) + 1.2, player.z);
      const b = new THREE.Vector3(this.x, waveHeight(this.x, this.z) + 1.2, this.z);
      const attr = this.rope.geometry.attributes.position as THREE.BufferAttribute;
      const sag = Math.max(0, 1.4 - a.distanceTo(b) / 11);
      for (let i = 0; i < 12; i++) { const u = i / 11; attr.setXYZ(i, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * sag, a.z + (b.z - a.z) * u); }
      attr.needsUpdate = true;
    }
    this.bar.style.width = `${this.hpPct * 100}%`;
    this.bar.classList.toggle("low", this.hpPct < 0.35);
    this.label.pos.set(this.x, 6.5, this.z);
    this.label.visible = this.alive;
  }
  dispose() {
    this.boat.dispose(this.env.scene);
    if (this.rope) this.env.scene.remove(this.rope);
    this.env.labels.remove(this.label);
  }
}

/** all actors for the running chapter */
export class Actors {
  markers: Marker[] = [];
  pickups: Pickup[] = [];
  npcs: NpcBoat[] = [];
  /** escort destinations: npc id -> point id */
  private escorts = new Map<string, string>();
  constructor(private env: ActorEnv) {}

  build(ch: CampaignChapter, region: RegionDef) {
    this.clear();
    const pt = (id: string) => region.points[id];
    const flat = (k: ObjectiveKind): ObjectiveKind[] => (k.type === "all" ? k.parts.flatMap(flat) : [k]);
    const kinds = [ch.main, ...ch.optional].flatMap((o) => flat(o.kind));
    for (const k of kinds) {
      if (k.type === "reach" && pt(k.pointId) && !this.markers.some((m) => m.pointId === k.pointId)) this.markers.push(new Marker(this.env, k.pointId, pt(k.pointId).x, pt(k.pointId).z, pt(k.pointId).label));
      if (k.type === "escort" && pt(k.toPointId) && !this.markers.some((m) => m.pointId === k.toPointId)) { this.escorts.set(k.npcId, k.toPointId); this.markers.push(new Marker(this.env, k.toPointId, pt(k.toPointId).x, pt(k.toPointId).z, pt(k.toPointId).label, "#7dff9a")); }
    }
    for (const n of ch.setup?.npcs ?? []) {
      const p = pt(n.at) ?? { x: 0, z: -20 };
      this.npcs.push(new NpcBoat(this.env, n.id, n.name, n.hp, n.mode, p.x, p.z, this.env.fx.wake));
    }
    for (const ps of ch.setup?.pickups ?? []) {
      for (const id of ps.points) {
        const m = /^random:(\d+)$/.exec(id);
        if (m) {
          const pool = (region.pickupSpawns[ps.kind] ?? []).slice().sort(() => Math.random() - 0.5);
          pool.slice(0, Number(m[1])).forEach((p) => this.pickups.push(new Pickup(this.env, ps.kind, p.x, p.z)));
        } else if (pt(id)) this.pickups.push(new Pickup(this.env, ps.kind, pt(id).x, pt(id).z));
      }
    }
  }

  npc(id: string) { return this.npcs.find((n) => n.id === id); }

  /** per frame: returns objective events (reach / collect / npc arrive / npc dead) */
  update(dt: number, time: number, player: { x: number; z: number; rot: number; speed: number; sunk: boolean }): ObjEvent[] {
    const out: ObjEvent[] = [];
    for (const m of this.markers) {
      m.update(time);
      const towing = [...this.escorts.entries()].some(([, p]) => p === m.pointId);
      if (!m.reached && !towing && !player.sunk && Math.hypot(player.x - m.x, player.z - m.z) < 10) {
        m.reached = true; sfx.mission(); this.env.fx.sparkAt(new THREE.Vector3(m.x, 2, m.z), m.color, 60);
        out.push({ t: "reach", pointId: m.pointId });
      }
    }
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.update(time);
      if (!player.sunk && Math.hypot(player.x - p.x, player.z - p.z) < 5) {
        p.taken = true; p.dispose(); sfx.coin();
        this.env.fx.sparkAt(new THREE.Vector3(p.x, 1, p.z), PICKUP_LOOK[p.kind]?.color ?? "#fff", 40);
        out.push({ t: "collect", kind: p.kind });
      }
    }
    for (const n of this.npcs) {
      const wasAlive = n.alive;
      n.update(dt, time, player);
      if (wasAlive && !n.alive) out.push({ t: "npc_dead", npcId: n.id });
      const dest = this.escorts.get(n.id);
      if (dest && n.alive && !n.arrived) {
        const m = this.markers.find((k) => k.pointId === dest);
        if (m && Math.hypot(n.x - m.x, n.z - m.z) < 14) { n.arrived = true; m.reached = true; sfx.mission(); out.push({ t: "npc_arrive", npcId: n.id, pointId: dest }); }
      }
    }
    return out;
  }

  targets(): MonsterTarget[] { return this.npcs.filter((n) => n.alive && !n.arrived); }

  mapExtras(): MapExtra[] {
    return [
      ...this.markers.filter((m) => !m.reached).map((m) => ({ x: m.x, z: m.z, icon: "📍", color: m.color, pulse: true })),
      ...this.pickups.filter((p) => !p.taken).map((p) => ({ x: p.x, z: p.z, icon: "•", color: PICKUP_LOOK[p.kind]?.color ?? "#fff" })),
      ...this.npcs.filter((n) => n.alive).map((n) => ({ x: n.x, z: n.z, icon: "⛵", color: "#ffcc33" })),
    ];
  }

  clear() {
    this.markers.forEach((m) => m.dispose());
    this.pickups.forEach((p) => { if (!p.taken) p.dispose(); });
    this.npcs.forEach((n) => n.dispose());
    this.markers = []; this.pickups = []; this.npcs = []; this.escorts.clear();
  }
}
