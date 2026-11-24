/**
 * Lantern fuel + visibility (Abyss Trench): fuel 1..0 burns down at sea and refills at the dock, from ⛽ fuel cans
 * (chapter pickups and free-floating cans) and from every Lanternfish landed. The visibility radius (fog distance and
 * a darkness vignette) follows the Lantern gear slot and the fuel left. Out of fuel = dark; the ChapterRunner fails the
 * chapter after 10 s of darkness. A dark fog replaces the night sky's blue haze.
 */
import * as THREE from "three";
import { DOCK_POS, type CampaignChapter, type PlayerS } from "@freek/shared";
import { registerEnvSystem, type EnvSystem, type EnvCtx } from "./host";
import { MeterChip, Vignette } from "../../ui/p3Meters";
import { waveHeight } from "../../world/ocean";
import type { ObjEvent } from "../objectives";
import type { MapExtra } from "../actors";
import { sfx } from "../../audio";

/** seconds of fuel in a full lantern */
export const FUEL_SECONDS = 180;
const DOCK_LIGHT_R = 34;
const CAN_FUEL = 0.35, LANTERNFISH_FUEL = 0.25;

interface Can { x: number; z: number; mesh: THREE.Mesh; respawnAt: number }

export class Lantern implements EnvSystem {
  readonly id = "lantern";
  fuel = 1;
  /** visibility radius (m) right now */
  radius = 40;
  private chip: MeterChip;
  private dark: Vignette;
  private cans: Can[] = [];
  private def: CampaignChapter | null = null;
  private warned = 0;
  private darkT = 0;
  private black = new THREE.Color("#03050c");
  /** bosses / scripted moments can force extra light (finale) */
  lightBoost = 0;

  constructor(private ctx: EnvCtx) {
    this.chip = new MeterChip(ctx.ui, "🏮", "mc-fuel", "Lantern fuel: how far you can see");
    this.dark = new Vignette(ctx.ui, "dark");
    const spots = ctx.region.pickupSpawns.fuel ?? [];
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8);
    spots.slice(8).forEach((p) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#ff7a3d", emissive: "#ff7a3d", emissiveIntensity: 1.2, flatShading: true }));
      ctx.scene.add(mesh);
      this.cans.push({ x: p.x, z: p.z, mesh, respawnAt: 0 });
    });
  }

  onStart(def: CampaignChapter | null) {
    this.def = def; this.fuel = 1; this.warned = 0; this.darkT = 0; this.lightBoost = 0;
    for (const c of this.cans) c.respawnAt = 0;
  }

  addFuel(n: number, label: string) {
    const before = this.fuel;
    this.fuel = Math.min(1, this.fuel + n);
    this.chip.pulse();
    const bp = this.ctx.boat()?.position;
    if (bp && this.fuel - before > 0.005) this.ctx.labels.float(`🏮 +${Math.round((this.fuel - before) * 100)}% ${label}`, new THREE.Vector3(bp.x, bp.y + 5, bp.z), "mat", 1.6);
    if (this.fuel > 0.3) this.warned = 0;
  }

  onEvent(ev: ObjEvent) {
    if (ev.t === "collect" && ev.kind === "fuel") this.addFuel(CAN_FUEL, "fuel");
    if (ev.t === "catch" && ev.card.speciesId === "lanternfish") this.addFuel(LANTERNFISH_FUEL, "Lanternfish glow");
  }

  update(dt: number, me: PlayerS, paused: boolean) {
    const ctx = this.ctx, t = performance.now() / 1000, L = ctx.local;
    if (!paused && !me.sunk) {
      const atDock = Math.hypot(L.x - DOCK_POS.x, L.z - DOCK_POS.z) < DOCK_LIGHT_R;
      if (atDock) this.fuel = Math.min(1, this.fuel + dt * 0.25);
      else this.fuel = Math.max(0, this.fuel - dt / FUEL_SECONDS);
      // free-floating cans (respawn after a while)
      for (const c of this.cans) {
        if (c.respawnAt > t || !this.freeCans) continue;
        if (Math.hypot(L.x - c.x, L.z - c.z) < 5) {
          c.respawnAt = t + 45; sfx.coin();
          ctx.fx.sparkAt(new THREE.Vector3(c.x, 1, c.z), "#ff7a3d", 40);
          this.addFuel(CAN_FUEL, "fuel");
        }
      }
      if (this.fuel < 0.25 && this.warned < 1) { this.warned = 1; ctx.feed.toast("<b>🏮 Lantern fuel low!</b> Find a ⛽ can or catch a Lanternfish", "bad", 2800); }
      if (this.fuel <= 0 && this.warned < 2) { this.warned = 2; ctx.feed.toast("<b>🌑 Out of fuel!</b> Find light within 10 seconds", "bad", 3000); sfx.fail(); }
    }
    if (me.sunk) this.fuel = Math.max(this.fuel, 0.6);
    this.darkT = this.fuel <= 0 && !paused ? this.darkT + dt : 0;
    for (const c of this.cans) {
      c.mesh.visible = c.respawnAt <= t && this.freeCans;
      c.mesh.position.set(c.x, waveHeight(c.x, c.z) + 0.6 + Math.sin(t * 2 + c.x) * 0.2, c.z);
      c.mesh.rotation.y = t + c.z;
    }
    // visibility: lantern gear radius scaled by fuel
    const lr = ctx.net.loadout.lightRadius;
    const target = this.fuel > 0 ? 12 + lr * (0.45 + 0.75 * this.fuel) + this.lightBoost : 9 + this.lightBoost;
    this.radius += (target - this.radius) * Math.min(1, dt * 2);
    const sky = ctx.world.sky;
    sky.fog.color.lerp(this.black, 0.75);
    sky.fog.near = this.radius * 0.3;
    sky.fog.far = this.radius * 2.4 + 25;
    sky.hemi.intensity *= 0.55;
    const k = 1 - Math.min(1, (this.radius - 9) / 80);
    this.dark.set(0.25 + k * 0.6 + (this.fuel <= 0 ? 0.1 + 0.05 * Math.sin(t * 6) : 0));
    this.chip.set(this.fuel, 0.25);
  }

  /** chapter 25 places its own fuel route */
  private get freeCans() { return this.def?.id !== 25; }
  meters() { return { fuel: this.fuel, dark: this.fuel <= 0 }; }
  mapExtras(): MapExtra[] {
    const t = performance.now() / 1000;
    return this.cans.filter((c) => c.respawnAt <= t && this.freeCans).map((c) => ({ x: c.x, z: c.z, icon: "⛽", color: "#ff9a5a" }));
  }
  hint(me: PlayerS): string {
    if (me.sunk) return "";
    if (this.fuel <= 0) return `🌑 Out of fuel! Grab a ⛽ can, land a Lanternfish or reach the dock (${Math.max(0, 10 - Math.floor(this.darkT))} s)`;
    if (this.fuel < 0.25) return "🏮 Fuel low: grab a ⛽ can, land a Lanternfish or refill at the dock.";
    return "";
  }
  dispose() { this.chip.dispose(); this.dark.dispose(); for (const c of this.cans) this.ctx.scene.remove(c.mesh); }
}

registerEnvSystem({ id: "lantern", when: (r) => !!r.hazards.darkness, create: (ctx) => new Lantern(ctx) });
