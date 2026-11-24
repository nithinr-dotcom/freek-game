/**
 * Endless Tide surprises: treasure chests (dropped by elites and bosses, opened with a quick slot-machine reveal) and
 * mid-tide events (merchant ship, cursed altar, shiny legendary school, treasure rain). Owned by EndlessMode, which
 * calls onTideStart / update / onTideEnd / mapExtras / clear. Pure rolls and tables: shared/src/endless/events.ts.
 */
import * as THREE from "three";
import {
  TRINKETS, TRINKETS_BY_ID, STAT_INFO, RIGS_BY_ID, RIG_TIER_LABEL, RARITY_INFO, MAX_RIG_TIER, CHEST_INFO, TIDE_EVENTS, ALTAR_DEALS, ALTAR_DEAL_IDS, MERCHANT_DISCOUNT,
  rollChestTier, rollChestReward, applyChestReward, rollTideEvent, rollTrinketFor, rollOffer, runRng, rigSlots, captainRules,
  type ChestTier, type ChestReward, type TideEventId, type AltarDealId, type Offer, type Tier, type StatId,
} from "@freek/shared";
import type { EndlessMode } from "./EndlessMode";
import type { MapExtra } from "../solo/actors";
import type { Loot, School } from "./world";
import { ARENA } from "./world";
import { isUnlocked } from "./meta";
import { surfaceRing } from "../world/decals";
import { waveHeight } from "../world/ocean";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";

/** what EndlessMode lends the event system (its private bits, as closures) */
export interface EventHost {
  addCoins(n: number): void;
  dropCoin(x: number, z: number, value: number): Loot;
  addMonsters(n: number): void;
  rigCatch(tier: Tier, from: { x: number; z: number }): void;
  arenaPoint(minFromBoat?: number): { x: number; z: number };
  biomeSpecies(tier?: Tier): string[];
}

interface Chest { tier: ChestTier; x: number; z: number; y: number; vy: number; t: number; group: THREE.Group; ring: THREE.Mesh }
interface Reveal { tier: ChestTier; reward: ChestReward; applied: boolean }

const SHINY_TIME = 10, MERCHANT_TIME = 20, RAIN_TIME = 8, ALTAR_TIME = 35;

function disposeObj(o: THREE.Object3D) {
  o.parent?.remove(o);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
  });
}
const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, ...o });

// ------------------------------------------------------------------------------------------------ meshes
function chestMesh(tier: ChestTier): THREE.Group {
  const info = CHEST_INFO[tier];
  const g = new THREE.Group();
  const body = std(info.color, tier === "wood" ? {} : { metalness: 0.6, roughness: 0.35 });
  const trim = std(info.trim, { emissive: info.trim, emissiveIntensity: tier === "wood" ? 0.35 : 0.8, metalness: 0.8, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 1.1), body);
  base.position.y = 0.48;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 10, 1, false, 0, Math.PI), body);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.95;
  g.add(base, lid);
  for (const x of [-0.58, 0.58]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.02, 1.16), trim);
    band.position.set(x, 0.5, 0);
    const arc = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.14, 10, 1, false, 0, Math.PI), trim);
    arc.rotation.z = Math.PI / 2;
    arc.position.set(x, 0.95, 0);
    g.add(band, arc);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.12), trim);
  lock.position.set(0, 0.9, 0.58);
  g.add(lock);
  // soft glow column
  const beamMat = new THREE.MeshBasicMaterial({ color: info.trim, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 7, 12, 1, true), beamMat);
  beam.position.y = 3.5;
  beam.userData.beam = true;
  g.add(beam);
  g.scale.setScalar(tier === "gold" ? 1.35 : tier === "silver" ? 1.2 : 1.05);
  return g;
}

function merchantMesh(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 7), std("#6b3f22"));
  hull.position.y = 0.4;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.6, 4), std("#6b3f22"));
  bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  bow.scale.set(1, 1, 0.55);
  bow.position.set(0, 0.4, 4.7);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 6.7), std("#c9a06a"));
  deck.position.y = 1.08;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 6), std("#4a2c18"));
  mast.position.set(0, 4.8, 0.4);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.9, 4, 4), std("#f6ead0", { side: THREE.DoubleSide }));
  sail.position.set(0, 5, 0.25);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(3.82, 0.7), std("#d0453a", { side: THREE.DoubleSide }));
  stripe.position.set(0, 5.2, 0.27);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), std("#ffd24a", { side: THREE.DoubleSide, emissive: "#ffb020", emissiveIntensity: 0.6 }));
  flag.position.set(0, 8.4, -0.2);
  flag.rotation.y = Math.PI / 2;
  flag.userData.flag = true;
  g.add(hull, bow, deck, mast, sail, stripe, flag);
  for (const [x, z, c] of [[0.6, -1.8, "#c98a4a"], [-0.5, -2.4, "#a8703a"], [0.3, 2.2, "#c98a4a"]] as [number, number, string][]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), std(c));
    crate.position.set(x, 1.5, z);
    crate.rotation.y = x;
    g.add(crate);
  }
  for (const z of [-3.2, 3.4]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: "#fff2b0", emissive: "#ffc04a", emissiveIntensity: 2.4 }));
    lamp.position.set(0, 1.9, z);
    g.add(lamp);
  }
  return g;
}

function altarMesh(): THREE.Group {
  const g = new THREE.Group();
  const stone = std("#2b2433");
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.4, 1.2, 8), stone);
  base.position.y = 0.2;
  const step = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 0.6, 8), std("#3a3046"));
  step.position.y = 1.1;
  g.add(base, step);
  const glowMat = std("#b05cff", { emissive: "#b05cff", emissiveIntensity: 1.4 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.5), stone);
    p.position.set(Math.cos(a) * 2.3, 2, Math.sin(a) * 2.3);
    p.rotation.y = -a;
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.5, 0.52), glowMat);
    rune.position.set(p.position.x, 3.2, p.position.z);
    rune.rotation.y = -a;
    g.add(p, rune);
  }
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshStandardMaterial({ color: "#e2b8ff", emissive: "#a040ff", emissiveIntensity: 2.2, flatShading: true, transparent: true, opacity: 0.92 }));
  crystal.position.y = 3.4;
  crystal.userData.crystal = true;
  g.add(crystal);
  return g;
}

// ------------------------------------------------------------------------------------------------ the system
export class EndlessEvents {
  private chests: Chest[] = [];
  private reveals: Reveal[] = [];
  private revealEl: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private panelFor: "merchant" | "altar" | null = null;
  private plan: { id: TideEventId; at: number } | null = null;
  private active: TideEventId | null = null;
  private evT = 0;
  // merchant
  private ship: THREE.Group | null = null;
  private shipRing: THREE.Mesh | null = null;
  private shipFrom = { x: 0, z: 0 }; private shipTo = { x: 0, z: 0 };
  private shipPos = { x: 0, z: 0 };
  private offers: (Offer | null)[] = [];
  // altar
  private altar: THREE.Group | null = null;
  private altarRing: THREE.Mesh | null = null;
  private altarPos = { x: 0, z: 0 };
  private deals: AltarDealId[] = [];
  private altarUsed = false;
  /** Gambler's Tithe: the hold is doubled at cash-in */
  private doubleHold = false;
  // shiny school
  private shiny: School | null = null;
  private shinyCount = 0;
  private shinyHooked = false;
  private sparkT = 0;
  // treasure rain
  private rainT = 0;
  private readonly forced: TideEventId | null;

  constructor(private m: EndlessMode, private host: EventHost) {
    const f = new URLSearchParams(location.search).get("enEvent");
    this.forced = f && f in TIDE_EVENTS ? (f as TideEventId) : null;
  }

  private get g() { return this.m.g; }
  private get ctx() { return { unlocked: (k: string) => isUnlocked(this.m.meta, k) }; }

  // ---------------------------------------------------------------- tide hooks
  onTideStart() {
    this.clear();
    const sp = this.m.spec;
    this.plan = this.forced ? { id: this.forced, at: 5 } : sp.boss ? null : rollTideEvent(this.m.run.tide, sp.duration, runRng(this.m.run, 7700));
  }
  /** called by endTide before the hold is cashed in */
  onTideEnd() {
    const me = this.m.net.me;
    if (this.doubleHold && me.unbanked.length) {
      const copies = me.unbanked.map((c) => ({ ...c }));
      me.unbanked.push(...copies);
      me.unbankedPoints += copies.reduce((a, c) => a + c.points, 0);
      this.g.feed.toast("<b>🎲 Gambler's Tithe:</b> the hold pays double!", "good", 2600);
    }
    // chests left on the water are scooped up: they still play their reveal (over the cash-in); past 3, silently
    const got: string[] = [];
    for (const c of this.chests) {
      const rw = rollChestReward(this.m.run, c.tier, this.m.stats.luck, Math.random, this.ctx);
      if (this.reveals.length < 3) this.reveals.push({ tier: c.tier, reward: rw, applied: false });
      else { this.applyReward(rw); got.push(this.rewardText(rw).short); }
      disposeObj(c.group); disposeObj(c.ring);
    }
    this.chests = [];
    if (got.length) this.g.feed.toast(`<b>🎁 Scooped up more chests:</b> ${got.map(escapeHtml).join(", ")}`, "good", 3600);
    if (this.reveals.length && !this.revealEl) this.nextReveal();
    this.endEvent();
    this.plan = null;
    this.doubleHold = false;
  }

  /** remove every mesh and panel (tide end, run end) */
  clear() {
    for (const c of this.chests) { disposeObj(c.group); disposeObj(c.ring); }
    this.chests = [];
    for (const r of this.reveals) if (!r.applied) { r.applied = true; this.applyReward(r.reward); }
    this.reveals = [];
    this.revealEl?.remove(); this.revealEl = null;
    this.endEvent();
    this.plan = null;
    this.doubleHold = false;
  }
  dispose() { this.clear(); }

  private endEvent() {
    if (this.ship) disposeObj(this.ship);
    if (this.shipRing) disposeObj(this.shipRing);
    if (this.altar) disposeObj(this.altar);
    if (this.altarRing) disposeObj(this.altarRing);
    this.ship = this.shipRing = this.altar = this.altarRing = null;
    if (this.shiny && this.shiny.count > 0 && !this.shiny.dying) { this.shinyHooked = true; this.m.schools.take(this.shiny, this.shiny.count); }
    this.shiny = null;
    this.closePanel();
    this.active = null;
  }

  // ---------------------------------------------------------------- frame (only while the tide runs)
  update(dt: number) {
    const t = performance.now() / 1000;
    const me = this.m.net.me;
    this.updateChests(dt, t, me.x, me.z);
    if (this.plan && this.m.tideT >= this.plan.at) { const id = this.plan.id; this.plan = null; this.start(id); }
    if (!this.active) return;
    this.evT += dt;
    switch (this.active) {
      case "merchant": this.updateMerchant(t, me.x, me.z); break;
      case "altar": this.updateAltar(t, me.x, me.z); break;
      case "shiny": this.updateShiny(dt, t); break;
      case "treasure_rain": this.updateRain(dt, me.x, me.z); break;
    }
  }

  private start(id: TideEventId) {
    const ev = TIDE_EVENTS[id];
    this.active = id;
    this.evT = 0;
    this.g.feed.announce(`${ev.name}!`, ev.color, ev.icon, true);
    this.g.feed.toast(`<b>${ev.icon} ${ev.name}:</b> ${escapeHtml(ev.text)}`, "good", 4200);
    sfx.announce();
    const scene = this.g.scene;
    if (id === "merchant") {
      const a = Math.random() * Math.PI * 2, off = (Math.random() - 0.5) * ARENA.r * 0.6;
      const R = ARENA.r * 0.92, px = -Math.sin(a) * off, pz = Math.cos(a) * off;
      this.shipFrom = { x: ARENA.x + Math.cos(a) * R + px, z: ARENA.z + Math.sin(a) * R + pz };
      this.shipTo = { x: ARENA.x - Math.cos(a) * R + px, z: ARENA.z - Math.sin(a) * R + pz };
      this.shipPos = { ...this.shipFrom };
      this.ship = merchantMesh();
      this.ship.rotation.y = Math.atan2(this.shipTo.x - this.shipFrom.x, this.shipTo.z - this.shipFrom.z);
      this.shipRing = surfaceRing(10, "#ffd24a", 0.55, 64, 0.35);
      scene.add(this.ship, this.shipRing);
      const r = Math.random;
      this.offers = [rollOffer(this.m.run, r, this.ctx), rollOffer(this.m.run, r, this.ctx)].map((o) => ({ ...o, price: Math.max(1, Math.round(o.price * MERCHANT_DISCOUNT)) }));
      if (Math.random() < 0.5) this.offers.pop();
    } else if (id === "altar") {
      this.altarPos = this.host.arenaPoint(22);
      this.altar = altarMesh();
      this.altarRing = surfaceRing(6.5, "#b05cff", 0.85, 64, 0.5);
      this.altarRing.position.set(this.altarPos.x, 0, this.altarPos.z);
      scene.add(this.altar, this.altarRing);
      const can = ALTAR_DEAL_IDS.filter((d) => d !== "iron_oath" || this.m.run.rigs.some((s) => s.tier < MAX_RIG_TIER));
      this.deals = can.sort(() => Math.random() - 0.5).slice(0, 2);
      this.altarUsed = false;
      this.g.fx.splashAt(this.altarPos.x, this.altarPos.z, 3);
    } else if (id === "shiny") {
      const p = this.host.arenaPoint(18);
      const sp = this.host.biomeSpecies("legendary");
      this.shiny = this.m.schools.spawn({ x: p.x, z: p.z, count: 1, species: sp.length ? sp : this.host.biomeSpecies(), quality: 3, golden: true });
      this.shinyCount = 1;
      this.shinyHooked = false;
      const s = this.shiny;
      this.g.fx.beam(() => (this.shiny === s ? new THREE.Vector3(s.x, 0, s.z) : null), "#ff9df0", SHINY_TIME);
    } else if (id === "treasure_rain") {
      this.rainT = 0;
      this.g.feed.flash("#ffe27a", 0.35);
    }
  }

  // ---------------------------------------------------------------- merchant ship
  private updateMerchant(t: number, bx: number, bz: number) {
    const k = Math.min(1, this.evT / MERCHANT_TIME);
    const x = this.shipFrom.x + (this.shipTo.x - this.shipFrom.x) * k, z = this.shipFrom.z + (this.shipTo.z - this.shipFrom.z) * k;
    this.shipPos = { x, z };
    const fade = k > 0.93 ? (k - 0.93) / 0.07 : 0;
    if (this.ship) {
      this.ship.position.set(x, waveHeight(x, z) - 0.2 - fade * 3, z);
      this.ship.rotation.z = Math.sin(t * 1.3) * 0.05;
      this.ship.rotation.x = Math.sin(t * 0.9) * 0.03;
      this.ship.traverse((o) => { if (o.userData.flag) o.rotation.x = Math.sin(t * 6) * 0.25; });
    }
    this.shipRing?.position.set(x, 0, z);
    const d = Math.hypot(bx - x, bz - z);
    if (d < 10 && this.panelFor !== "merchant" && this.offers.some(Boolean)) this.openMerchant();
    else if (d > 14 && this.panelFor === "merchant") this.closePanel();
    if (k >= 1) { this.g.feed.toast("<b>⛵ The merchant sails away.</b>", "", 1800); this.endEvent(); }
  }
  private openMerchant() {
    const run = this.m.run;
    const list = h("div.en-ev-offers");
    const msg = h("div.en-ev-msg");
    const render = () => {
      list.innerHTML = "";
      this.offers.forEach((o, i) => {
        if (!o) { list.append(h("div.en-ev-offer.sold", null, "SOLD")); return; }
        let icon = "", name = "", sub = "", color = "#fff";
        if (o.kind === "rig") { const d = RIGS_BY_ID[o.id]; icon = d.icon; name = `${d.name} ${RIG_TIER_LABEL[o.tier - 1]}`; sub = d.desc(o.tier, d.power[o.tier - 1]); color = ["#b0b8c0", "#3fa9ff", "#b05cff", "#ff5a1f"][o.tier - 1]; }
        else { const tr = TRINKETS_BY_ID[o.id]; icon = tr.icon; name = tr.name; sub = tr.text ?? statsText(tr.stats); color = RARITY_INFO[tr.rarity].color; }
        list.append(h("div.en-ev-offer", { style: `--rc:${color}` },
          h("span.en-ev-icon", null, icon),
          h("div.en-ev-txt", null, h("b", null, name), h("small", null, sub)),
          h(`button.tb-btn.primary.small${run.coins >= o.price ? "" : ".short"}`, { onclick: () => {
            const why = this.buyOffer(o);
            if (why) { msg.textContent = why; sfx.fail(); return; }
            this.offers[i] = null; sfx.coin(); msg.textContent = `Bought ${name}!`;
            render();
            if (!this.offers.some(Boolean)) setTimeout(() => this.closePanel(), 700);
          } }, `${o.price}●`),
        ));
      });
    };
    render();
    this.openPanel("merchant", "#ffd24a", "⛵ Merchant Ship", `${Math.round((1 - MERCHANT_DISCOUNT) * 100)}% off, today only. Stay close to browse.`, list, msg);
  }
  private buyOffer(o: Offer): string | null {
    const run = this.m.run;
    if (run.coins < o.price) return "Not enough coins";
    if (o.kind === "trinket") {
      const t = TRINKETS_BY_ID[o.id];
      if (t?.max !== undefined && (run.trinkets[o.id] ?? 0) >= t.max) return "You can only carry one";
      run.trinkets[o.id] = (run.trinkets[o.id] ?? 0) + 1;
    } else {
      const twin = run.rigs.find((s) => s.id === o.id && s.tier === o.tier && s.tier < MAX_RIG_TIER);
      const full = run.rigs.length >= rigSlots(run);
      if (twin && (full || captainRules(run).instantMerge)) { twin.tier++; run.counters.merges++; }
      else if (full) return "Rig slots full";
      else run.rigs.push({ id: o.id, tier: o.tier, uid: ++run.uidSeq });
    }
    run.coins -= o.price;
    this.statsChanged();
    return null;
  }

  // ---------------------------------------------------------------- cursed altar
  private updateAltar(t: number, bx: number, bz: number) {
    const { x, z } = this.altarPos;
    const sink = Math.max(0, this.evT - (ALTAR_TIME - 1.5)) * 3;
    if (this.altar) {
      this.altar.position.set(x, waveHeight(x, z) - 0.4 - sink, z);
      this.altar.traverse((o) => { if (o.userData.crystal) { o.rotation.y = t * 1.5; o.position.y = 3.4 + Math.sin(t * 2.2) * 0.3; } });
    }
    if (this.altarRing) (this.altarRing.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.55 + Math.sin(t * 4) * 0.3;
    if (Math.random() < 0.08) this.g.fx.sparkAt(new THREE.Vector3(x + (Math.random() - 0.5) * 4, 3 + Math.random() * 2, z + (Math.random() - 0.5) * 4), "#c77dff", 6);
    const d = Math.hypot(bx - x, bz - z);
    if (!this.altarUsed && d < 6.5 && this.panelFor !== "altar") this.openAltar();
    else if (d > 10 && this.panelFor === "altar") this.closePanel();
    if (this.evT >= ALTAR_TIME) { if (!this.altarUsed) this.g.feed.toast("<b>🗿 The altar sinks back into the deep.</b>", "", 1800); this.endEvent(); }
  }
  private openAltar() {
    const list = h("div.en-ev-offers");
    for (const id of this.deals) {
      const d = ALTAR_DEALS[id];
      list.append(h("button.en-ev-deal", { onclick: () => this.takeDeal(id) },
        h("span.en-ev-icon", null, d.icon),
        h("div.en-ev-txt", null, h("b", null, d.name), h("small.up", null, `✔ ${d.gain}`), h("small.down", null, `✖ ${d.cost}`)),
      ));
    }
    list.append(h("button.tb-btn.ghost.small", { onclick: () => { sfx.click(); this.closePanel(); } }, "Walk away"));
    this.openPanel("altar", "#b05cff", "🗿 Cursed Altar", "The stone whispers. Every gift has a price.", list);
  }
  private takeDeal(id: AltarDealId) {
    if (this.altarUsed) return;
    const run = this.m.run, stats = this.m.stats;
    this.altarUsed = true;
    let gain = "";
    if (id === "blood_pact") {
      const tid = rollTrinketFor(run, Math.random, this.ctx, run.tide + 8, stats.luck, "epic");
      run.trinkets[tid] = (run.trinkets[tid] ?? 0) + 1;
      run.picks.maxHp = (run.picks.maxHp ?? 0) - Math.round(stats.maxHp * 0.2);
      const t = TRINKETS_BY_ID[tid];
      gain = `${t.icon} ${t.name}`;
    } else if (id === "gamblers_tithe") {
      this.doubleHold = true;
      this.host.addMonsters(Math.max(4, Math.round(this.m.spec.monsters * 0.7)));
      this.m.spec.maxAlive += 2;
      gain = "the hold pays double";
    } else {
      const ups = run.rigs.filter((s) => s.tier < MAX_RIG_TIER);
      const s = ups[Math.floor(Math.random() * ups.length)];
      if (s) { s.tier++; run.counters.merges++; gain = `${RIGS_BY_ID[s.id].icon} ${RIGS_BY_ID[s.id].name} → Tier ${RIG_TIER_LABEL[s.tier - 1]}`; }
      run.picks.armor = (run.picks.armor ?? 0) - 4;
    }
    this.statsChanged();
    this.closePanel();
    this.g.feed.announce(`${ALTAR_DEALS[id].name}: ${gain}`, "#c77dff", ALTAR_DEALS[id].icon, true);
    this.g.feed.flash("#7a1fff", 0.6);
    this.g.chase.shake(0.35);
    sfx.roar(false);
    this.g.fx.sparkAt(new THREE.Vector3(this.altarPos.x, 4, this.altarPos.z), "#c77dff", 60);
    this.evT = Math.max(this.evT, ALTAR_TIME - 1.5);
  }

  // ---------------------------------------------------------------- shiny school
  /** EndlessMode.manualRoll asks: is this school the shiny one? (then the hooked fish is Legendary) */
  hooksShiny(s: { id: number } | null): boolean {
    if (!s || !this.shiny || s.id !== this.shiny.id) return false;
    this.shinyHooked = true;
    this.g.feed.toast("<b>🌈 The shiny Legendary bit!</b> Don't lose it!", "good", 2600);
    return true;
  }
  private updateShiny(dt: number, t: number) {
    const s = this.shiny;
    if (!s) { this.active = null; return; }
    (s.ring.material as THREE.ShaderMaterial).uniforms.uColor.value.setHSL((t * 0.6) % 1, 1, 0.62);
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.12;
      const a = Math.random() * Math.PI * 2;
      this.g.fx.sparkAt(new THREE.Vector3(s.x + Math.cos(a) * s.r, 0.8, s.z + Math.sin(a) * s.r), `hsl(${Math.floor(Math.random() * 360)},100%,65%)`, 5);
    }
    if (s.count < this.shinyCount) {
      // a rig (or a net / charge) took it: the Legendary flies in
      if (!this.shinyHooked) { this.host.rigCatch("legendary", s); this.g.feed.announce("Shiny Legendary landed!", "#ff7ae0", "🌈", true); }
      this.shinyHooked = true;
      this.shiny = null; this.active = null;
      return;
    }
    if (this.evT >= SHINY_TIME) { this.g.feed.toast("<b>🌈 The shiny school dove deep…</b>", "bad", 1800); this.endEvent(); }
  }

  // ---------------------------------------------------------------- treasure rain
  private updateRain(dt: number, bx: number, bz: number) {
    this.rainT -= dt;
    const tide = this.m.run.tide;
    while (this.rainT <= 0) {
      this.rainT += 0.2;
      const near = Math.random() < 0.35;
      const a = Math.random() * Math.PI * 2, d = near ? Math.random() * 14 : Math.sqrt(Math.random()) * ARENA.r * 0.85;
      const cx = near ? bx : ARENA.x, cz = near ? bz : ARENA.z;
      const l = this.host.dropCoin(cx + Math.cos(a) * d, cz + Math.sin(a) * d, Math.max(1, Math.round(tide / 3)));
      l.y = 20 + Math.random() * 8; l.vy = -3;
    }
    if (this.evT >= RAIN_TIME) this.active = null;
  }

  // ---------------------------------------------------------------- chests
  dropChest(x: number, z: number, source: "elite" | "boss") {
    const tier = rollChestTier(source, this.m.run.tide, this.m.stats.luck, Math.random);
    const dx = x - ARENA.x, dz = z - ARENA.z, d = Math.hypot(dx, dz), max = ARENA.r * 0.85;
    if (d > max) { x = ARENA.x + (dx / d) * max; z = ARENA.z + (dz / d) * max; }
    const group = chestMesh(tier);
    const ring = surfaceRing(2.4, CHEST_INFO[tier].trim, 0.9, 32, 0.6);
    group.position.set(x, 3, z);
    this.g.scene.add(group, ring);
    this.chests.push({ tier, x, z, y: 3, vy: 6, t: Math.random() * 6, group, ring });
    if (tier !== "wood") this.g.feed.toast(`<b>🎁 ${CHEST_INFO[tier].label} dropped!</b> Sail into it.`, "good", 2400);
  }
  private updateChests(dt: number, t: number, bx: number, bz: number) {
    const magnet = this.m.stats.magnet * 0.8, pull = this.m.specials.lootMagnet ? 2 : 1;
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      c.t += dt;
      const dx = bx - c.x, dz = bz - c.z, d = Math.hypot(dx, dz);
      if (d < magnet && d > 0.01) { const sp = Math.min(d, 6 * pull * dt); c.x += (dx / d) * sp; c.z += (dz / d) * sp; }
      const wy = waveHeight(c.x, c.z) - 0.15;
      c.vy -= 18 * dt; c.y += c.vy * dt;
      if (c.y < wy) { c.y = wy; c.vy = 0; }
      c.group.position.set(c.x, c.y + Math.sin(c.t * 2.4) * 0.15, c.z);
      c.group.rotation.set(Math.sin(c.t * 1.7) * 0.08, c.t * 0.6, Math.sin(c.t * 1.3) * 0.08);
      c.group.traverse((o) => { if (o.userData.beam) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(t * 4 + c.t) * 0.08; });
      c.ring.position.set(c.x, 0, c.z);
      if (d < 3.4) {
        disposeObj(c.group); disposeObj(c.ring);
        this.chests.splice(i, 1);
        this.g.fx.sparkAt(new THREE.Vector3(c.x, 1.5, c.z), CHEST_INFO[c.tier].trim, 50);
        this.g.fx.splashAt(c.x, c.z, 1.2);
        sfx.coin();
        this.reveals.push({ tier: c.tier, reward: rollChestReward(this.m.run, c.tier, this.m.stats.luck, Math.random, this.ctx), applied: false });
        if (!this.revealEl) this.nextReveal();
      }
    }
  }

  // ---------------------------------------------------------------- reward + reveal
  private applyReward(rw: ChestReward) {
    if (rw.kind === "coins") { this.host.addCoins(rw.n); return; }
    applyChestReward(this.m.run, rw);
    this.statsChanged();
  }
  private rewardText(rw: ChestReward): { icon: string; title: string; sub: string; short: string; color: string } {
    if (rw.kind === "coins") return { icon: "💰", title: `+${rw.n} coins`, sub: "A pile of doubloons", short: `+${rw.n}●`, color: "#ffd24a" };
    if (rw.kind === "trinket") {
      const t = TRINKETS_BY_ID[rw.id], r = RARITY_INFO[t.rarity];
      return { icon: t.icon, title: t.name, sub: `${r.label} trinket · ${t.text ?? statsText(t.stats)}`, short: `${t.icon} ${t.name}`, color: r.color };
    }
    const s = this.m.run.rigs.find((x) => x.uid === rw.uid);
    const d = RIGS_BY_ID[s?.id ?? ""];
    const to = RIG_TIER_LABEL[Math.min(MAX_RIG_TIER, rw.from + 1) - 1];
    return { icon: d?.icon ?? "⇪", title: `${d?.name ?? "Rig"} ⇪ ${to}`, sub: `Rig tier-up: ${RIG_TIER_LABEL[rw.from - 1]} → ${to}`, short: `${d?.icon ?? "⇪"} ${d?.name ?? "Rig"} ${to}`, color: "#7dff9a" };
  }
  private nextReveal() {
    const rv = this.reveals[0];
    if (!rv) { this.revealEl = null; return; }
    const info = CHEST_INFO[rv.tier];
    const txt = this.rewardText(rv.reward);
    // the reel: random icons, the reward second to last
    const filler = ["💰", "⇪", ...TRINKETS.filter((t) => !t.cursed).map((t) => t.icon)];
    const N = 22, target = N - 2;
    const icons = Array.from({ length: N }, (_, i) => (i === target ? txt.icon : filler[Math.floor(Math.random() * filler.length)]));
    const strip = h("div.en-chest-strip", null, ...icons.map((ic, i) => h(`span${i === target ? ".hit" : ""}`, null, ic)));
    const label = h("div.en-chest-label", null, h("b", { style: `color:${txt.color}` }, txt.title), h("small", null, txt.sub));
    const el = h("div.en-chest-reveal", { style: `--cc:${info.trim};--cb:${info.color}` },
      h("div.en-chest-k", null, `🎁 ${info.label.toUpperCase()}`),
      h("div.en-chest-window", null, strip),
      label,
    );
    this.revealEl = el;
    this.g.ui.append(el);
    requestAnimationFrame(() => {
      el.classList.add("show");
      requestAnimationFrame(() => { strip.style.transform = `translateX(${-(target - 1) * 56}px)`; });
    });
    let ticks = 0;
    const tick = setInterval(() => { if (++ticks > 12 || !el.isConnected) clearInterval(tick); else sfx.blip(); }, 95);
    setTimeout(() => {
      if (!el.isConnected) return;
      if (!rv.applied) { rv.applied = true; this.applyReward(rv.reward); }
      el.classList.add("landed");
      if (rv.reward.kind === "trinket") sfx.catchJingle(TRINKETS_BY_ID[rv.reward.id].rarity === "legendary" ? "legendary" : TRINKETS_BY_ID[rv.reward.id].rarity === "epic" ? "epic" : "gold");
      else if (rv.reward.kind === "rig") sfx.catchJingle("epic");
      else sfx.coin();
      const bp = this.g.boat()?.position;
      if (bp) this.g.labels.float(txt.short, new THREE.Vector3(bp.x, bp.y + 5, bp.z), "pts", 1.6);
    }, 1450);
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
      if (this.revealEl !== el) return;
      this.reveals.shift();
      this.nextReveal();
    }, 2500);
  }

  // ---------------------------------------------------------------- panel (merchant, altar)
  private openPanel(kind: "merchant" | "altar", color: string, title: string, sub: string, ...body: HTMLElement[]) {
    this.closePanel();
    this.panelFor = kind;
    const el = h("div.en-evpanel", { style: `--ec:${color}` }, h("div.en-ev-h", null, h("b", null, title), h("small", null, sub)), ...body);
    this.panel = el;
    this.g.ui.append(el);
    requestAnimationFrame(() => el.classList.add("show"));
    sfx.announce();
  }
  private closePanel() {
    const p = this.panel;
    this.panel = null; this.panelFor = null;
    if (p) { p.classList.remove("show"); setTimeout(() => p.remove(), 220); }
  }

  private statsChanged() {
    this.m.refreshStats(false);
    const me = this.m.net.me;
    me.hp = Math.min(me.hp, this.m.net.loadout.maxHp);
  }

  // ---------------------------------------------------------------- minimap
  mapExtras(): MapExtra[] {
    const out: MapExtra[] = this.chests.map((c) => ({ x: c.x, z: c.z, icon: "🎁", color: CHEST_INFO[c.tier].trim, pulse: c.tier !== "wood" }));
    if (this.ship) out.push({ x: this.shipPos.x, z: this.shipPos.z, icon: "⛵", color: "#ffd24a", pulse: true });
    if (this.altar && !this.altarUsed) out.push({ x: this.altarPos.x, z: this.altarPos.z, icon: "🗿", color: "#b05cff", pulse: true });
    if (this.shiny) out.push({ x: this.shiny.x, z: this.shiny.z, icon: "🌈", color: "#ff7ae0", pulse: true });
    return out;
  }
}

function statsText(stats: Partial<Record<StatId, number>>) {
  return Object.entries(stats).filter(([, v]) => v).map(([k, v]) => `${(v as number) > 0 ? "+" : ""}${v}${STAT_INFO[k as StatId].unit} ${STAT_INFO[k as StatId].label}`).join(", ");
}
