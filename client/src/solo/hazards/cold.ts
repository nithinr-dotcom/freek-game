/**
 * Cold meter (Frozen Fjord): warmth 1..0 drains away from heat (dock, heater buoys); the Heater gear slot slows the drain;
 * blizzards and night drain faster. At 0 the chapter fails ("You froze!", checked by the ChapterRunner); in free roam the
 * hull takes frost damage instead. Heater buoys are built here from the region's `heater_*` points; lighting one emits a
 * `collect` event with itemKind "heater_buoy" (chapter 19). spike() is the Ice Leviathan's frost breath.
 */
import * as THREE from "three";
import { DOCK_POS, zoneAt, type CampaignChapter, type PlayerS } from "@freek/shared";
import { registerHazard, type Hazard, type HazardCtx } from "./host";
import { MeterChip, Vignette } from "../../ui/p3Meters";
import { surfaceRing } from "../../world/decals";
import { waveHeight } from "../../world/ocean";
import type { MapExtra } from "../actors";
import { sfx } from "../../audio";

/** seconds from full to frozen with a T1 heater on a calm day */
export const COLD_SECONDS = 130;
const DOCK_HEAT_R = 34, BUOY_HEAT_R = 16;

interface HeaterBuoy { id: string; x: number; z: number; label: string; lit: boolean; group: THREE.Group; flame: THREE.Mesh; ring: THREE.Mesh }

function buildHeaterBuoy(): { group: THREE.Group; flame: THREE.Mesh } {
  const g = new THREE.Group();
  const m = (c: string, e?: string) => new THREE.MeshStandardMaterial({ color: c, emissive: e ?? "#000000", emissiveIntensity: e ? 1.6 : 0, flatShading: true, roughness: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 1.2, 8), m("#c0392b"));
  base.position.y = 0.2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.3, 8), m("#f4ecdc"));
  band.position.y = 0.55;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 6), m("#3a3a40"));
  post.position.y = 1.8;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 0.6, 8, 1, true), m("#2a2a30"));
  bowl.position.y = 3.0;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 7), new THREE.MeshBasicMaterial({ color: "#ffb03a", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.y = 3.9;
  g.add(base, band, post, bowl, flame);
  return { group: g, flame };
}

export class ColdMeter implements Hazard {
  readonly id = "cold";
  warmth = 1;
  heaters: HeaterBuoy[] = [];
  private chip: MeterChip;
  private frost: Vignette;
  private slowT = 0;
  private frostDmgAcc = 0;
  private warned = false;
  private def: CampaignChapter | null = null;
  /** extra drain multiplier set by bosses (frost aura); 1 = none */
  extraDrain = 1;

  constructor(private ctx: HazardCtx) {
    this.chip = new MeterChip(ctx.ui, "❄", "mc-cold", "Warmth: drains away from heat sources");
    this.frost = new Vignette(ctx.ui, "frost");
    for (const [id, p] of Object.entries(ctx.region.points)) {
      if (!id.startsWith("heater_")) continue;
      const { group, flame } = buildHeaterBuoy();
      group.position.set(p.x, 0, p.z);
      const ring = surfaceRing(BUOY_HEAT_R, "#ff9a3d", 0.45, 64, 0.15);
      ring.position.set(p.x, 0, p.z);
      ctx.scene.add(group, ring);
      this.heaters.push({ id, x: p.x, z: p.z, label: p.label, lit: false, group, flame, ring });
    }
  }

  get heaterDrain() { return this.ctx.net.loadout.warmthDrain; }
  get slowed() { return this.slowT > 0; }

  onStart(def: CampaignChapter | null) {
    this.def = def;
    this.warmth = 1; this.slowT = 0; this.warned = false; this.extraDrain = 1;
    for (const b of this.heaters) b.lit = false;
  }

  /** frost breath: drop warmth, slow the boat and freeze it (breaks "never frozen") */
  spike(amount: number, slowSeconds: number) {
    this.warmth = Math.max(0, this.warmth - amount);
    this.slowT = Math.max(this.slowT, slowSeconds);
    this.chip.pulse();
    this.ctx.feed.toast("<b>❄ FROZEN!</b> The frost breath iced your hull", "bad", 2000);
    this.ctx.chase.shake(0.5);
    this.ctx.feed.flash("#bfefff", 0.7);
    sfx.damage();
    this.ctx.runner().feed({ t: "frozen" });
  }

  /** heat at (x,z): per-second warming (0 = none) */
  heatAt(x: number, z: number): number {
    if (Math.hypot(x - DOCK_POS.x, z - DOCK_POS.z) < DOCK_HEAT_R) return 0.25;
    for (const b of this.heaters) if (Math.hypot(x - b.x, z - b.z) < BUOY_HEAT_R) return 0.18;
    return 0;
  }

  update(dt: number, me: PlayerS, paused: boolean) {
    const ctx = this.ctx, t = performance.now() / 1000;
    // visuals
    for (const b of this.heaters) {
      b.group.position.y = waveHeight(b.x, b.z) - 0.3;
      b.group.rotation.z = Math.sin(t * 1.2 + b.x) * 0.06;
      b.flame.scale.set(1 + Math.sin(t * 13 + b.z) * 0.12, (b.lit ? 1.2 : 0.8) + Math.sin(t * 9 + b.x) * 0.2, 1);
      ((b.ring.material as THREE.ShaderMaterial).uniforms.uTime).value = t;
    }
    if (!paused && !me.sunk) {
      const x = ctx.local.x, z = ctx.local.z;
      const heat = this.heatAt(x, z);
      for (const b of this.heaters) {
        if (!b.lit && Math.hypot(x - b.x, z - b.z) < BUOY_HEAT_R - 3) {
          b.lit = true;
          sfx.mission();
          ctx.fx.sparkAt(new THREE.Vector3(b.x, 4, b.z), "#ffb03a", 60);
          if (this.def) ctx.feed.toast(`<b>🔥 ${b.label} lit</b> · warmth restored`, "good", 2000);
          ctx.runner().feed({ t: "collect", kind: "heater_buoy" });
        }
      }
      if (heat > 0) this.warmth = Math.min(1, this.warmth + heat * dt);
      else {
        const storm = ctx.net.state.storm ? 2 : 1;
        const night = ctx.clock.phase === "night" ? 1.25 : 1;
        const deep = zoneAt(x, z) === "abyss" ? 1.15 : 1;
        this.warmth = Math.max(0, this.warmth - (dt / COLD_SECONDS) * this.heaterDrain * storm * night * deep * this.extraDrain);
      }
      if (this.warmth < 0.25 && !this.warned) { this.warned = true; ctx.feed.toast("<b>❄ You're freezing!</b> Warm up at a heater buoy or the dock", "bad", 3000); sfx.fail(); }
      if (this.warmth > 0.45) this.warned = false;
      // free roam: no fail, the hull suffers instead
      const running = ctx.runner().status === "running";
      if (this.warmth <= 0 && !running) {
        this.frostDmgAcc += dt * 3;
        if (this.frostDmgAcc >= 3) { ctx.net.damage(Math.floor(this.frostDmgAcc), "frost"); this.frostDmgAcc = 0; }
      }
    }
    if (me.sunk) this.warmth = Math.max(this.warmth, 0.6);
    if (this.slowT > 0) {
      if (!paused) this.slowT -= dt;
      ctx.local.speedMult *= 0.4;
    }
    this.chip.set(this.warmth, 0.3);
    this.frost.set(Math.max(this.slowT > 0 ? 0.85 : 0, (0.45 - this.warmth) / 0.45));
  }

  meters() { return { warmth: this.warmth }; }
  mapExtras(): MapExtra[] { return this.heaters.map((b) => ({ x: b.x, z: b.z, icon: "🔥", color: b.lit ? "#ffb03a" : "#ffd9b0", pulse: !b.lit && this.def?.main.kind.type === "collect" })); }
  hint(me: PlayerS): string {
    if (me.sunk || this.ctx.runner().status !== "running") return "";
    if (this.slowT > 0) return "❄ Frozen! Your boat is iced up for a moment.";
    if (this.warmth < 0.3) return "❄ You're freezing! Sail to a heater buoy (🔥) or the dock to warm up.";
    return "";
  }
  dispose() {
    this.chip.dispose(); this.frost.dispose();
    for (const b of this.heaters) this.ctx.scene.remove(b.group, b.ring);
  }
}

registerHazard({ id: "cold", when: (r) => !!r.hazards.cold, create: (ctx) => new ColdMeter(ctx) });
