/**
 * Storm Kraken (Act 3 boss). The head hides underwater, guarded by 4 tentacles that each have their own HP and slam red
 * circle telegraphs at the boat. When every tentacle is cut, the head surfaces (harpoonable) and slams tidal circles.
 * Lightning is forced on for the whole fight (yellow circles; hazards/lightning.ts). P2 (<50% HP): an ink cloud darkens
 * the screen, the head dives and 2 tentacles regrow; cut them again to bring the head back up.
 */
import type { MonsterS } from "@freek/shared";
import { BossBehaviour, registerBossBehaviour, type BossEnv } from "./registry";
import type { MonsterController } from "../SoloNet";
import { activeHazard } from "../hazards";
import type { LightningHazard } from "../hazards/lightning";
import { buildTentacle, type TentacleVis } from "./models";
import { sfx } from "../../audio";
import { damp } from "../../util";

type St = "rising" | "guarded" | "exposed";
const TENTACLE_HP = 110;
const RING = 17;

class StormKraken extends BossBehaviour {
  static readonly TENTACLE_HP = TENTACLE_HP;
  private st: St = "rising";
  private stT = 0;
  private arms: Tentacle[] = [];
  private cx = 0; private cz = 0;
  private slamIn = 3;
  private slam: { x: number; z: number; t: number; dur: number } | null = null;
  private ink = 0;

  constructor(env: BossEnv) {
    super(env);
    this.hitRadius = 9;
    this.cx = env.monster.x; this.cz = env.monster.z;
    env.fx.dress?.(env.monster.id, null, env.def.name, { cls: "storm" });
    this.lightning?.force(true, { every: [2.4, 4.4], aimed: 0.6 });
    if (!env.net.state.storm) env.net.forceStorm(0);
  }
  private get lightning() { return activeHazard<LightningHazard>("lightning"); }
  private go(s: St) { this.st = s; this.stT = 0; }
  private get p2() { return this.phase >= 1; }
  private alive() { return this.arms.filter((a) => this.env.net.state.monsters.has(a.m.id)); }

  /** the head only takes damage once the tentacles are down (it is submerged until then anyway) */
  damageScale() { return this.st === "exposed" ? 1 : 0; }

  private grow(n: number, first = false) {
    const net = this.env.net;
    const base = Math.atan2(this.me.x - this.cx, this.me.z - this.cz);
    for (let i = 0; i < n; i++) {
      const a = base + (n === 4 ? (i / 4) * Math.PI * 2 + Math.PI / 4 : (i === 0 ? -0.7 : 0.7));
      const x = this.cx + Math.sin(a) * RING, z = this.cz + Math.cos(a) * RING;
      const tm = net.spawnMonster("serpent", { scripted: true, quiet: true, hp: TENTACLE_HP, at: { x, z } });
      tm.maxHp = tm.hp; // TENTACLE_HP (Hard: scaled)
      const t = new Tentacle(this.env, tm, this.m.id, i * 1.3, first ? 1.4 + i * 0.9 : 1.2 + i * 1.4);
      net.controllers.set(tm.id, t);
      this.env.fx.dress?.(tm.id, buildTentacle(t.vis), "Tentacle", { labelY: 15, aimY: 6, cls: "minion" });
      this.arms.push(t);
      this.env.fx.splash(x, z, 3);
    }
  }

  protected enterPhase(p: number) {
    if (p !== 1) return;
    const fx = this.env.fx;
    fx.roar(true); fx.shake(1);
    fx.announce("INK! Two tentacles regrow!");
    this.ink = 1;
    this.m.state = "submerged";
    this.slam = null;
    this.grow(2);
    this.go("guarded");
    this.lightning?.force(true, { every: [1.8, 3.4], aimed: 0.65, warn: 1.15 });
  }

  protected tick(dt: number) {
    const m = this.m, me = this.me, net = this.env.net, fx = this.env.fx;
    this.stT += dt;
    if (!net.state.storm) net.forceStorm(0);
    switch (this.st) {
      case "rising":
        m.state = "submerged";
        if (this.stT > 1) {
          this.grow(this.p2 ? 2 : 4, true);
          if (this.p2) this.ink = 1;
          fx.toast?.("<b>🦑 Cut the tentacles!</b> The head comes up when all of them are gone.", "");
          this.go("guarded");
        }
        break;
      case "guarded":
        m.state = "submerged";
        // the head drifts toward the boat under water, slowly
        if (!me.sunk && Math.hypot(me.x - this.cx, me.z - this.cz) > 60) {
          const d = Math.hypot(me.x - this.cx, me.z - this.cz);
          this.cx += ((me.x - this.cx) / d) * 2 * dt; this.cz += ((me.z - this.cz) / d) * 2 * dt;
        }
        m.x = this.cx; m.z = this.cz;
        if (this.stT > 1.5 && this.alive().length === 0) {
          m.state = "chasing";
          fx.splash(m.x, m.z, 6); fx.roar(true); fx.shake(0.7);
          fx.announce("The Kraken's head surfaces: harpoon it!");
          this.go("exposed");
          this.slamIn = 2.2;
        }
        break;
      case "exposed": {
        m.state = this.slam ? "attacking" : "chasing";
        m.rot = Math.atan2(me.x - m.x, me.z - m.z);
        if (me.sunk) break;
        this.slamIn -= dt;
        if (!this.slam && this.slamIn <= 0) {
          const dur = Math.max(BossBehaviour.MIN_TELEGRAPH, this.p2 ? 1.1 : 1.35);
          this.slam = { x: me.x, z: me.z, t: 0, dur };
          fx.circleTelegraph(me.x, me.z, 10, dur);
          fx.attackAnim();
          sfx.roar(false);
        }
        if (this.slam) {
          this.slam.t += dt;
          if (this.slam.t >= this.slam.dur) {
            const s = this.slam; this.slam = null;
            sfx.slam(); fx.splash(s.x, s.z, 5); fx.shake(0.6);
            if (Math.hypot(me.x - s.x, me.z - s.z) < 11) net.damage(this.p2 ? 26 : 22, m.id);
            this.slamIn = (this.p2 ? 3 : 4) + Math.random() * 1.5;
          }
        }
        break;
      }
    }
    // ink cloud: dark pulse that settles to a heavy gloom
    if (this.p2) this.ink = Math.max(0.5, this.ink - dt * 0.15);
    fx.tint?.("rgba(8,4,20,0.96)", this.p2 ? this.ink * (0.88 + Math.sin(this.t * 1.7) * 0.08) : 0);
  }

  dispose() {
    const net = this.env.net;
    for (const a of this.arms) if (net.state.monsters.has(a.m.id)) net.removeMonster(a.m);
    this.arms = [];
    this.env.fx.tint?.("#000", 0);
    this.lightning?.force(false);
  }
}

/** one tentacle: rooted in place, sways, and slams a red circle at the boat every few seconds */
class Tentacle implements MonsterController {
  hitRadius = 5;
  vis: TentacleVis = { slam: 0, hurt: 0, phase: 0 };
  private t = 0;
  private next: number;
  private slam: { x: number; z: number; t: number; dur: number } | null = null;
  private ax: number; private az: number;
  private lastHp: number;
  constructor(private env: BossEnv, readonly m: MonsterS, private headId: string, phase: number, firstIn: number) {
    this.vis.phase = phase;
    this.next = firstIn + 1;
    this.ax = m.x; this.az = m.z;
    this.lastHp = m.hp;
  }
  damageScale() { return 1; }
  onHit(dmg: number) { if (dmg > 0) { this.vis.hurt = 1; this.env.fx.spark?.(this.m.x, 5, this.m.z, "#c79cff", 30); } }
  update(dt: number) {
    const net = this.env.net, m = this.m, me = net.me, fx = this.env.fx;
    this.t += dt;
    if (!net.state.monsters.has(this.headId)) { net.removeMonster(m); return; }
    m.state = this.t < 0.8 ? "submerged" : this.slam ? "attacking" : "chasing";
    m.x = this.ax; m.z = this.az;
    m.rot = Math.atan2(me.x - m.x, me.z - m.z);
    this.vis.hurt = Math.max(0, this.vis.hurt - dt * 3);
    if (m.hp < this.lastHp) this.lastHp = m.hp;
    if (this.t < 0.8 || me.sunk) return;
    if (!this.slam) {
      this.next -= dt;
      if (this.next <= 0 && Math.hypot(me.x - m.x, me.z - m.z) < 55) {
        const dur = Math.max(0.8, 1.2);
        this.slam = { x: me.x, z: me.z, t: 0, dur };
        fx.circleTelegraph(me.x, me.z, 6.5, dur);
      }
    } else {
      this.slam.t += dt;
      this.vis.slam = Math.min(1, this.slam.t / this.slam.dur);
      if (this.slam.t >= this.slam.dur) {
        const s = this.slam; this.slam = null;
        sfx.slam(); fx.splash(s.x, s.z, 3.2);
        if (Math.hypot(me.x - s.x, me.z - s.z) < 7.5) { net.damage(16, m.id); fx.shake(0.5); }
        this.next = 4.5 + Math.random() * 2.5;
      }
    }
    this.vis.slam = this.slam ? this.vis.slam : damp(this.vis.slam, 0, 4, dt);
  }
}

registerBossBehaviour("storm_kraken", (env) => new StormKraken(env));
