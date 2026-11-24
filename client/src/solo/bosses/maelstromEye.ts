/**
 * Maelstrom Eye (final boss). The Eye sits at the bottom of a whirlpool that drags the boat toward its core (sail
 * against it). It is immune while closed and fires gaze beams (red line telegraphs); every few seconds it glows and
 * opens (harpoon it!). P2 "Abyssal Tide" (<60%): stronger pull, faster beams, deep horrors rise to defend it.
 * P3 "The Eye Duel" (<25%): the Eye hooks your line; a giant reel minigame with legend behaviour and a long progress
 * bar (touch: hold REEL). Landing it kills the Eye; a snap throws you back and the duel restarts.
 */
import * as THREE from "three";
import { getRegion } from "@freek/shared";
import { BossBehaviour, registerBossBehaviour, type BossEnv } from "./registry";
import { envHost, queueLook } from "../hazards/host";
import type { Whirlpool } from "../hazards/whirlpool";
import type { Horrors } from "../hazards/horrors";
import { sfx } from "../../audio";

const R = 95, CORE = 12;
const OPEN_TELE = 1.1, OPEN_FOR = 4.5;
const DUEL_MS = 34_000;

/** giant eyeball with lids and a ring of tentacles */
export function buildEyeModel(): { root: THREE.Group; setOpen(k: number): void; setGlow(k: number): void; animate(t: number): void } {
  const root = new THREE.Group();
  const lidMat = new THREE.MeshStandardMaterial({ color: "#2a1238", emissive: "#3a0d4a", emissiveIntensity: 0.4, flatShading: true, roughness: 0.7, side: THREE.DoubleSide });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 18), new THREE.MeshStandardMaterial({ color: "#f0d8e8", emissive: "#5a1a3a", emissiveIntensity: 0.3, roughness: 0.4 }));
  const irisMat = new THREE.MeshStandardMaterial({ color: "#ff5ad8", emissive: "#ff2ab8", emissiveIntensity: 1.2, roughness: 0.3 });
  const iris = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), irisMat);
  iris.position.z = 4.95;
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: "#050008" }));
  pupil.position.z = 5.0;
  pupil.scale.y = 1.6;
  const eye = new THREE.Group();
  eye.add(ball, iris, pupil);
  eye.position.y = 4;
  const lidTop = new THREE.Mesh(new THREE.SphereGeometry(5.35, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
  const lidBot = new THREE.Mesh(new THREE.SphereGeometry(5.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
  lidBot.rotation.x = Math.PI;
  const lids = new THREE.Group();
  lids.add(lidTop, lidBot);
  lids.position.y = 4;
  root.add(eye, lids);
  const tents: THREE.Mesh[] = [];
  const tMat = new THREE.MeshStandardMaterial({ color: "#3a1d6e", emissive: "#1a0533", emissiveIntensity: 0.5, flatShading: true });
  for (let i = 0; i < 8; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(1.1, 11, 6), tMat);
    const a = (i / 8) * Math.PI * 2;
    t.position.set(Math.cos(a) * 7, 3, Math.sin(a) * 7);
    t.userData.a = a;
    root.add(t);
    tents.push(t);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(7.5, 16, 12), new THREE.MeshBasicMaterial({ color: "#ff5ad8", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.y = 4;
  root.add(glow);
  let open = 0;
  return {
    root,
    setOpen(k) { open = k; lidTop.rotation.x = -k * 1.15; lidBot.rotation.x = Math.PI + k * 1.15; },
    setGlow(k) { (glow.material as THREE.MeshBasicMaterial).opacity = 0.08 + k * 0.35; irisMat.emissiveIntensity = 1.2 + k * 2; },
    animate(t) {
      eye.rotation.y = Math.sin(t * 0.7) * 0.15 * (1 - open);
      tents.forEach((m, i) => { const a = m.userData.a as number; m.rotation.set(Math.sin(a) * 0.6 + Math.sin(t * 2 + i) * 0.25, 0, -Math.cos(a) * 0.6 + Math.cos(t * 1.7 + i) * 0.25); });
    },
  };
}

type St = "closed" | "opening" | "open" | "duelIntro" | "duel" | "duelLost";

class MaelstromEye extends BossBehaviour {
  private cx = 70; private cz = -215;
  private st: St = "closed";
  private stT = 0;
  private closedFor = 5;
  private nextBeam = 3;
  private nextHorror = 6;
  private look: ReturnType<typeof buildEyeModel> | null = null;
  private openK = 0;
  private glowK = 0;
  private duelResult: boolean | null = null;
  private duelRunning = false;
  private duelTries = 0;

  constructor(env: BossEnv) {
    super(env);
    this.hitRadius = 0;
    const pt = getRegion("abyss_trench")?.points.maelstrom;
    if (pt) { this.cx = pt.x; this.cz = pt.z; }
    const m = this.m;
    m.x = this.cx; m.z = this.cz; m.state = "chasing";
    this.whirl?.enable(this.cx, this.cz, R, this.phase >= 1 ? 6 : 4.5);
    if (this.whirl) this.whirl.core = CORE;
    const look = buildEyeModel();
    this.look = look;
    queueLook(m.id, (e) => { e.setLook(env.def.name, look.root, 22); e.root.scale.setScalar(1.6); });
    envHost.current?.addTicker((dt, paused) => this.frame(dt, paused));
    if (this.phase >= 2) { this.st = "duelIntro"; this.stT = 0.5; }
  }

  private get whirl() { return envHost.current?.get<Whirlpool>("whirlpool"); }
  private get horrors() { return envHost.current?.get<Horrors>("horrors"); }
  private go(s: St) { this.st = s; this.stT = 0; }

  protected enterPhase(p: number) {
    const fx = this.env.fx;
    fx.roar(true); fx.shake(0.9);
    if (p === 1) {
      fx.announce("The Abyssal Tide rises: horrors are coming!");
      if (this.whirl) this.whirl.strength = 6;
      this.nextHorror = 2;
    }
    if (p === 2) {
      fx.announce("THE EYE DUEL: the Maelstrom has hooked your line!");
      this.close();
      this.go("duelIntro");
    }
  }

  private close() { this.hitRadius = 0; }

  protected tick(dt: number) {
    const m = this.m, me = this.me, fx = this.env.fx;
    this.stT += dt;
    m.x = this.cx; m.z = this.cz; m.state = "chasing";
    m.rot = Math.atan2(me.x - m.x, me.z - m.z);
    if (this.st === "duelIntro" || this.st === "duel" || this.st === "duelLost") { this.duelTick(dt); return; }
    // gaze beams while closed / opening
    const d = Math.hypot(me.x - this.cx, me.z - this.cz);
    if (this.st !== "open" && !me.sunk) {
      this.nextBeam -= dt;
      if (this.nextBeam <= 0 && d < 140) {
        this.nextBeam = (this.phase >= 1 ? 3.2 : 4.5) + Math.random() * 1.5;
        this.beam();
      }
    }
    // horrors defend the Eye in P2
    if (this.phase >= 1 && !me.sunk) {
      this.nextHorror -= dt;
      const hz = this.horrors;
      if (hz && this.nextHorror <= 0) {
        this.nextHorror = 14 + Math.random() * 6;
        if (hz.alive < 2) {
          const a = Math.random() * Math.PI * 2;
          hz.spawn(this.cx + Math.cos(a) * (R + 10), this.cz + Math.sin(a) * (R + 10), 120);
          fx.announce("A horror rises from the Maelstrom!");
        }
      }
    }
    switch (this.st) {
      case "closed":
        this.openK = Math.max(0, this.openK - dt * 2);
        this.glowK = Math.max(0, this.glowK - dt);
        if (this.stT > this.closedFor && !me.sunk) { this.go("opening"); fx.roar(false); envHost.current?.ctx.feed.toast("<b>👁 The Eye is opening…</b>", "", 1200); }
        break;
      case "opening":
        this.glowK = Math.min(1, this.stT / OPEN_TELE);
        this.openK = Math.min(0.35, this.stT / OPEN_TELE * 0.35);
        if (this.stT >= OPEN_TELE) { this.go("open"); this.hitRadius = 10; fx.announce("The Eye is open! Harpoon it!"); sfx.announce(); }
        break;
      case "open":
        this.openK = Math.min(1, this.openK + dt * 4);
        this.glowK = 1;
        if (this.stT > OPEN_FOR) { this.go("closed"); this.close(); this.closedFor = (this.phase >= 1 ? 4 : 5) + Math.random() * 2; }
        break;
    }
  }

  private beam() {
    const me = this.me, fx = this.env.fx, net = this.env.net;
    const dx = me.x - this.cx, dz = me.z - this.cz, d = Math.hypot(dx, dz) || 1;
    const len = Math.max(R, d + 25);
    const x2 = this.cx + (dx / d) * len, z2 = this.cz + (dz / d) * len;
    const dur = this.phase >= 1 ? 0.95 : 1.15;
    fx.lineTelegraph(this.cx, this.cz, x2, z2, 6, dur);
    net.later(dur * 1000, () => {
      if (!net.state.monsters.has(this.m.id) || this.st.startsWith("duel")) return;
      const p = net.me;
      fx.splash(x2 * 0.5 + this.cx * 0.5, z2 * 0.5 + this.cz * 0.5, 3);
      sfx.slam();
      if (!p.sunk && segDist(p.x, p.z, this.cx, this.cz, x2, z2) < 3.8) { net.damage(this.phase >= 1 ? 16 : 13, this.m.id); fx.shake(0.6); }
      for (const n of envHost.current?.ctx.actors.npcs ?? []) if (n.alive && segDist(n.x, n.z, this.cx, this.cz, x2, z2) < 4) n.damage(12);
    });
  }

  // ------------------------------------------------------------------ the Eye Duel
  private duelTick(dt: number) {
    const m = this.m, host = envHost.current;
    if (!host) return;
    const w = this.whirl;
    if (w) w.enabledPull = false;
    this.openK = Math.min(1, this.openK + dt * 2);
    this.glowK = 0.6 + 0.4 * Math.sin(this.stT * 6);
    this.hitRadius = 0;
    const me = this.me;
    if (me.sunk) { this.stopDuel(); return; }
    switch (this.st) {
      case "duelIntro":
        if (this.stT > 2.2) this.startDuel();
        break;
      case "duel": {
        const reel = host.ctx.reel;
        // the Eye's health follows the reel progress
        const k = Math.max(0, Math.min(1, (reel.progress - 0.25) / 0.75));
        m.hp = Math.max(1, Math.round(m.maxHp * 0.25 * (1 - k)));
        if (this.duelResult === true) { this.duelRunning = false; this.endDuel(true); return; }
        if (this.duelResult === false || (!reel.active && this.duelRunning)) { this.duelRunning = false; this.endDuel(false); }
        break;
      }
      case "duelLost":
        if (this.stT > 3.5) this.startDuel();
        break;
    }
  }

  private startDuel() {
    const host = envHost.current;
    if (!host) return;
    const { fishing, reel, net } = host.ctx;
    fishing.cancel();
    const L = net.loadout;
    this.duelResult = null;
    this.duelRunning = true;
    this.duelTries++;
    reel.el.classList.add("eye-duel");
    reel.start("legendary", 0.86, DUEL_MS, net.me.level, (r) => { this.duelResult = r.success; }, {
      behaviour: "legend", weightKg: 0, ratingKg: 1, fillMult: L.fillMult, liftMult: L.liftMult,
      zoneBonus: L.skills.zoneBonus + 0.05, tensionMult: L.skills.tensionMult * 0.85, secondWind: L.skills.secondWind,
    });
    const label = reel.el.querySelector(".reel-label");
    if (label) label.textContent = "👁 THE EYE DUEL";
    fishing.phase = "reeling";
    // a previous duel's fade-out timer may hide the reel: make sure it shows
    setTimeout(() => { if (reel.active && this.duelRunning) reel.el.classList.add("show"); }, 800);
    // the Maelstrom drags its horrors down: the duel is one on one
    net.state.monsters.forEach((mm) => { if (mm.id !== this.m.id) net.removeMonster(mm); });
    host.ctx.feed.toast(this.duelTries > 1 ? "<b>👁 Again!</b> Hold the zone on the Eye" : "<b>👁 THE EYE DUEL</b> · keep the zone on the Eye until the bar is full!", "good", 3200);
    sfx.hook();
    this.go("duel");
  }

  private endDuel(won: boolean) {
    const host = envHost.current;
    if (!host) return;
    host.ctx.fishing.phase = "idle";
    host.ctx.reel.el.classList.remove("eye-duel");
    if (won) {
      host.ctx.feed.flash("#ff5ad8", 0.9);
      this.env.net.kill(this.m);
      return;
    }
    // thrown back: the Eye recovers
    this.m.hp = Math.round(this.m.maxHp * 0.25);
    this.env.net.damage(22, this.m.id);
    this.env.fx.roar(true); this.env.fx.shake(0.8);
    host.ctx.local.knockback(this.cx, this.cz, 16);
    host.ctx.feed.toast("<b>👁 The Eye threw you off!</b> Brace for another pull…", "bad", 2600);
    this.go("duelLost");
  }

  private stopDuel() {
    const host = envHost.current;
    if (!host || !this.duelRunning) return;
    this.duelRunning = false;
    host.ctx.reel.stop();
    host.ctx.reel.el.classList.remove("eye-duel");
    host.ctx.fishing.phase = "idle";
    this.go("duelLost");
  }

  /** dev: win the duel now */
  devWinDuel() { if (this.st === "duel") this.duelResult = true; }

  /** visuals + cleanup (runs even while the game is paused) */
  private frame(dt: number, _paused: boolean): boolean {
    const net = this.env.net;
    if (!net.state.monsters.has(this.m.id)) { this.dispose(); return false; }
    const t = performance.now() / 1000;
    this.look?.setOpen(this.openK);
    this.look?.setGlow(this.glowK);
    this.look?.animate(t);
    void dt;
    return true;
  }
  private dispose() {
    this.whirl?.disable();
    const host = envHost.current;
    if (host && this.duelRunning) { host.ctx.reel.stop(); host.ctx.fishing.phase = "idle"; }
    host?.ctx.reel.el.classList.remove("eye-duel");
    this.duelRunning = false;
  }
}

function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

registerBossBehaviour("maelstrom_eye", (env) => new MaelstromEye(env));
