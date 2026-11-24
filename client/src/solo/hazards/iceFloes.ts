/**
 * Drifting ice floes (Frozen Fjord): moving circular obstacles that block and bump the boat (damage when rammed fast),
 * crack towed NPC barges, bounce off islands/rocks and each other, and wrap around the map edge.
 * API for bosses: launch() throws a fast floe along a line (Ice Leviathan P2); statics[] adds solid circles (the ice sheet).
 */
import * as THREE from "three";
import { DOCK_POS, WORLD_RADIUS, type CampaignChapter, type PlayerS } from "@freek/shared";
import { registerHazard, type Hazard, type HazardCtx } from "./host";
import { resolveObstacles } from "../../world/layout";
import { waveHeight } from "../../world/ocean";
import { mulberry32 } from "../../util";
import { sfx } from "../../audio";
import type { MapExtra } from "../actors";

export interface Floe { x: number; z: number; vx: number; vz: number; r: number; mesh: THREE.Mesh; spin: number; rot: number; thrown?: { life: number; dmg: number; hit: boolean } }

const BOAT_R = 2.4;

function floeGeometry(r: number, seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const sides = 7 + Math.floor(rng() * 4);
  const geo = new THREE.CylinderGeometry(r, r * 0.92, 1.1, sides, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const k = Array.from({ length: sides + 1 }, () => 0.82 + rng() * 0.3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const idx = Math.round(((a + Math.PI) / (Math.PI * 2)) * sides) % sides;
    pos.setX(i, x * k[idx]); pos.setZ(i, z * k[idx]);
    if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) + (rng() - 0.5) * 0.25);
  }
  geo.computeVertexNormals();
  return geo;
}

export class IceFloes implements Hazard {
  readonly id = "floes";
  floes: Floe[] = [];
  /** solid circles that block floes and the boat (boss ice sheet) */
  statics: { x: number; z: number; r: number }[] = [];
  private mat = new THREE.MeshStandardMaterial({ color: "#f2fbff", emissive: "#9fd8ff", emissiveIntensity: 0.12, flatShading: true, roughness: 0.4 });
  private hitCd = 0;
  private npcCd = new Map<string, number>();
  private seq = 0;
  private def: CampaignChapter | null = null;

  constructor(private ctx: HazardCtx) {
    const rng = mulberry32(40404);
    const cur = 0.9; // prevailing current direction
    let tries = 0;
    while (this.floes.length < 30 && tries++ < 400) {
      const a = rng() * Math.PI * 2, d = 55 + rng() * (WORLD_RADIUS - 80);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const r = 3 + rng() * 5;
      if (this.floes.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + r + 6)) continue;
      const p = { x, z };
      if (resolveObstacles(p, r)) continue;
      const s = 0.7 + rng() * 1.6, da = (rng() - 0.5) * 0.9;
      this.add(x, z, r, Math.sin(cur + da) * s, Math.cos(cur + da) * s);
    }
  }

  private add(x: number, z: number, r: number, vx: number, vz: number): Floe {
    const mesh = new THREE.Mesh(floeGeometry(r, 777 + this.seq++ * 13), this.mat);
    mesh.receiveShadow = true;
    this.ctx.scene.add(mesh);
    const f: Floe = { x, z, vx, vz, r, mesh, spin: (Math.random() - 0.5) * 0.15, rot: Math.random() * 6 };
    this.floes.push(f);
    return f;
  }
  private remove(f: Floe) {
    this.ctx.scene.remove(f.mesh); f.mesh.geometry.dispose();
    this.floes.splice(this.floes.indexOf(f), 1);
  }

  /** throw a fast floe from (x,z) along (dx,dz) (boss attack); it shatters after `life` seconds */
  launch(x: number, z: number, dx: number, dz: number, speed: number, r = 4.5, dmg = 20): Floe {
    const d = Math.hypot(dx, dz) || 1;
    const f = this.add(x, z, r, (dx / d) * speed, (dz / d) * speed);
    f.thrown = { life: 4, dmg, hit: false };
    this.ctx.fx.splashAt(x, z, 3);
    return f;
  }

  onStart(def: CampaignChapter | null) {
    this.def = def;
    for (const f of this.floes.filter((k) => k.thrown)) this.remove(f);
    this.statics = [];
  }

  update(dt: number, me: PlayerS, paused: boolean) {
    const ctx = this.ctx, local = ctx.local;
    if (!paused) {
      this.hitCd -= dt;
      for (const f of [...this.floes]) {
        f.x += f.vx * dt; f.z += f.vz * dt; f.rot += f.spin * dt;
        if (f.thrown) {
          f.thrown.life -= dt;
          if (f.thrown.life <= 0) { ctx.fx.splashAt(f.x, f.z, 2.5); this.remove(f); continue; }
        } else {
          // keep drifting floes out of the harbour and inside the map
          const r = Math.hypot(f.x - DOCK_POS.x, f.z - DOCK_POS.z);
          if (r < 42 + f.r) { const k = (42 + f.r) / (r || 1); f.x *= k; f.z *= k; const nx = f.x / (r || 1), nz = f.z / (r || 1); const dot = f.vx * nx + f.vz * nz; if (dot < 0) { f.vx -= 2 * dot * nx; f.vz -= 2 * dot * nz; } }
          if (r > WORLD_RADIUS + 10) { f.x = -f.x * 0.92; f.z = -f.z * 0.92; }
          const p = { x: f.x, z: f.z };
          if (resolveObstacles(p, f.r)) { const nx = p.x - f.x, nz = p.z - f.z, n = Math.hypot(nx, nz) || 1; const dot = (f.vx * nx + f.vz * nz) / n; if (dot < 0) { f.vx -= 2 * dot * nx / n; f.vz -= 2 * dot * nz / n; } f.x = p.x; f.z = p.z; }
        }
        for (const s of this.statics) {
          const dx = f.x - s.x, dz = f.z - s.z, d = Math.hypot(dx, dz) || 1, min = s.r + f.r;
          if (d < min) {
            if (f.thrown && d < s.r) continue; // thrown from inside the sheet
            f.x = s.x + (dx / d) * min; f.z = s.z + (dz / d) * min;
            const dot = (f.vx * dx + f.vz * dz) / d; if (dot < 0) { f.vx -= 2 * dot * dx / d; f.vz -= 2 * dot * dz / d; }
          }
        }
      }
      // floe vs floe: soft separation
      for (let i = 0; i < this.floes.length; i++) for (let j = i + 1; j < this.floes.length; j++) {
        const a = this.floes[i], b = this.floes[j];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
        if (d < min && d > 0.001) {
          const push = (min - d) * 0.5, nx = dx / d, nz = dz / d;
          a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
          if (!a.thrown && !b.thrown) { const t = a.vx; a.vx = (a.vx + b.vx) * 0.5 - nx * 0.2; b.vx = (t + b.vx) * 0.5 + nx * 0.2; const u = a.vz; a.vz = (a.vz + b.vz) * 0.5 - nz * 0.2; b.vz = (u + b.vz) * 0.5 + nz * 0.2; }
        }
      }
      if (!me.sunk) this.collideBoat();
      this.collideNpcs(dt);
    }
    const t = performance.now() / 1000;
    for (const f of this.floes) {
      f.mesh.position.set(f.x, waveHeight(f.x, f.z) - 0.25 + Math.sin(t * 1.3 + f.r) * 0.05, f.z);
      f.mesh.rotation.set(Math.sin(t * 0.9 + f.x) * 0.03, f.rot, Math.cos(t * 0.8 + f.z) * 0.03);
    }
  }

  private collideBoat() {
    const ctx = this.ctx, L = ctx.local;
    const bodies = [...this.floes.map((f) => ({ x: f.x, z: f.z, r: f.r, f })), ...this.statics.map((s) => ({ ...s, f: null as Floe | null }))];
    for (const b of bodies) {
      const dx = L.x - b.x, dz = L.z - b.z, d = Math.hypot(dx, dz) || 0.001, min = b.r + BOAT_R;
      if (d >= min) continue;
      L.x = b.x + (dx / d) * min; L.z = b.z + (dz / d) * min;
      const f = b.f;
      if (f?.thrown && !f.thrown.hit) {
        f.thrown.hit = true;
        ctx.net.damage(f.thrown.dmg, "floe");
        L.knockback(f.x, f.z, 18);
        ctx.chase.shake(0.8); sfx.slam();
        ctx.fx.splashAt(f.x, f.z, 3);
        f.thrown.life = Math.min(f.thrown.life, 0.15);
        continue;
      }
      // closing speed along the contact normal (boat heading vs normal)
      const vx = Math.sin(L.rot) * L.speed, vz = Math.cos(L.rot) * L.speed;
      const into = -(vx * dx + vz * dz) / d + (f ? (f.vx * dx + f.vz * dz) / d : 0);
      if (into > 5 && this.hitCd <= 0) {
        this.hitCd = 1;
        const dmg = Math.round(3 + (into - 5) * 1.4);
        ctx.net.damage(dmg, "floe");
        L.knockback(b.x, b.z, 6 + into * 0.5);
        ctx.chase.shake(0.4); sfx.hit();
        ctx.fx.splashAt(L.x - (dx / d) * BOAT_R, L.z - (dz / d) * BOAT_R, 1.5);
        ctx.feed.toast("<b>🧊 Ice!</b> Steer around the floes", "bad", 1600);
      }
      L.speed *= 0.6;
      if (f && !f.thrown) { f.vx -= (dx / d) * 0.6; f.vz -= (dz / d) * 0.6; }
    }
  }

  private collideNpcs(dt: number) {
    for (const n of this.ctx.actors.npcs) {
      if (!n.alive || n.arrived) continue;
      const cd = Math.max(0, (this.npcCd.get(n.id) ?? 0) - dt);
      this.npcCd.set(n.id, cd);
      for (const f of this.floes) {
        const dx = n.x - f.x, dz = n.z - f.z, d = Math.hypot(dx, dz) || 0.001, min = f.r + 2.4;
        if (d >= min) continue;
        n.x = f.x + (dx / d) * min; n.z = f.z + (dz / d) * min;
        if (cd <= 0 && (n.speed > 3 || f.thrown || Math.hypot(f.vx, f.vz) > 2.5)) {
          this.npcCd.set(n.id, 1.2);
          n.damage(f.thrown ? f.thrown.dmg : Math.round(5 + n.speed * 0.6));
          sfx.hit();
        }
      }
    }
  }

  /** floes near the boat on the minimap */
  mapExtras(): MapExtra[] {
    const L = this.ctx.local;
    return this.floes.filter((f) => Math.hypot(f.x - L.x, f.z - L.z) < 150).map((f) => ({ x: f.x, z: f.z, icon: "▪", color: f.thrown ? "#7fdcff" : "#e8f6ff" }));
  }
  hint(me: PlayerS): string {
    if (this.def?.id === 22 && !me.sunk && this.ctx.runner().status === "running" && this.ctx.actors.npcs.some((n) => n.alive && n.hpPct < 0.6)) return "🧊 Floes crack the barge: slow down and swing wide around the ice.";
    return "";
  }
  dispose() { for (const f of [...this.floes]) this.remove(f); }
}

registerHazard({ id: "floes", when: (r) => !!r.hazards.iceFloes, create: (ctx) => new IceFloes(ctx) });
