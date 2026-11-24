/**
 * Crab Titan (Act 2 boss). Immune while its shell is closed (harpoons spark off with a CLANG). It stalks the boat,
 * raises its claws and slams two red circle telegraphs (≥0.8 s); after a slam the shell opens for 3 s and the glowing
 * heart takes critical hits (×2). P2 (<50% HP): it summons brood crabs that scuttle to the boat, latch on and nibble
 * the hull (damage over time) until harpooned off. A crab latched for more than 3 s reports the flag
 * "crab_latched_long" (breaks the chapter's optional objective).
 */
import type { MonsterS } from "@freek/shared";
import { BossBehaviour, registerBossBehaviour, type BossEnv } from "./registry";
import type { MonsterController, SoloNet } from "../SoloNet";
import { buildCrabTitan, buildCrabling, type CrabVis, type TitanVis } from "./models";
import { sfx } from "../../audio";
import { damp } from "../../util";

type St = "rising" | "stalk" | "windup" | "open" | "closing";

const OPEN_S = 3;
const SLAM_R = 7.5;

class CrabTitan extends BossBehaviour {
  private st: St = "rising";
  private stT = 0;
  private vis: TitanVis = { open: 0, raise: 0, walk: 0 };
  private stalkFor = 3;
  private slams: { x: number; z: number }[] = [];
  private cycles = 0;
  private brood: Crabling[] = [];
  private clangToast = false;

  constructor(env: BossEnv) {
    super(env);
    this.hitRadius = 8.5;
    env.fx.dress?.(env.monster.id, buildCrabTitan(this.vis), env.def.name, { labelY: 12, aimY: 3.5, cls: "titan" });
  }
  private go(s: St) { this.st = s; this.stT = 0; }
  private get p2() { return this.phase >= 1; }

  /** closed shell: immune; open shell: every hit is a crit */
  damageScale() { return this.st === "open" ? 2 : 0; }

  onHit(dmg: number) {
    const m = this.m, fx = this.env.fx;
    if (dmg <= 0) {
      fx.float?.("CLANG!", m.x, 5, m.z, "clang");
      fx.spark?.(m.x, 4, m.z, "#cfe8ff", 40);
      sfx.hit();
      if (!this.clangToast) { this.clangToast = true; fx.toast?.("<b>🛡 The shell is closed!</b> Wait for the claw slam, then hit the glowing heart.", "bad"); }
      return;
    }
    fx.float?.("CRIT!", m.x, 6.5, m.z, "crit");
    fx.spark?.(m.x, 3, m.z, "#ffd24a", 60);
    super.onHit(dmg);
  }

  protected enterPhase(p: number) {
    if (p !== 1) return;
    const fx = this.env.fx;
    fx.roar(true); fx.shake(0.8);
    fx.announce("The Crab Titan calls its brood!");
    // phase change while open: snap shut and summon at once
    this.go("closing");
    this.summon(2);
  }

  private summon(n: number) {
    const net = this.env.net, m = this.m;
    this.brood = this.brood.filter((c) => net.state.monsters.has(c.m.id));
    const k = Math.min(n, 4 - this.brood.length);
    for (let i = 0; i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const cm = net.spawnMonster("serpent", { scripted: true, quiet: true, hp: 1, at: { x: m.x + Math.cos(a) * 7, z: m.z + Math.sin(a) * 7 } });
      cm.maxHp = cm.hp; // 1 (Hard: scaled)
      const c = new Crabling(this.env, cm, m.id);
      net.controllers.set(cm.id, c);
      this.env.fx.dress?.(cm.id, buildCrabling(c.vis), "Brood Crab", { labelY: 3.5, aimY: 1, cls: "minion" });
      this.brood.push(c);
    }
    if (k) { this.env.fx.splash(m.x, m.z, 3); this.env.fx.toast?.("<b>🦀 Brood crabs!</b> They latch onto your hull: harpoon them off (aim at your boat).", "bad"); }
  }

  protected tick(dt: number) {
    const m = this.m, me = this.me, net = this.env.net, fx = this.env.fx;
    this.stT += dt;
    const dx = me.x - m.x, dz = me.z - m.z, d = Math.hypot(dx, dz) || 1;
    const speed = this.p2 ? 7.5 : 6;
    let walking = 0;
    switch (this.st) {
      case "rising":
        m.state = "submerged";
        if (this.stT > 1.4) { m.state = "chasing"; fx.splash(m.x, m.z, 5); fx.roar(true); this.go("stalk"); this.stalkFor = 2.5; }
        break;
      case "stalk": {
        m.state = "chasing";
        if (me.sunk) break;
        // close in to slam range, then keep a little distance (it's a crab: it sidles)
        if (d > 24) { net.moveToward(m, me.x - (dx / d) * 22, me.z - (dz / d) * 22, speed * (d > 60 ? 1.8 : 1), dt); walking = 1; }
        net.keepOutOfHarbour(m);
        m.rot = Math.atan2(dx, dz);
        if (this.stT > this.stalkFor && d < 40) this.startWindup();
        break;
      }
      case "windup": {
        m.rot = Math.atan2(this.slams[0].x - m.x, this.slams[0].z - m.z);
        if (this.stT >= this.teleDur) {
          // SLAM
          fx.attackAnim(); fx.shake(0.6); sfx.slam();
          let hit = false;
          for (const s of this.slams) {
            fx.splash(s.x, s.z, 3.5);
            if (!hit && !me.sunk && Math.hypot(me.x - s.x, me.z - s.z) < SLAM_R + 1.2) { hit = true; net.damage(this.p2 ? 26 : 22, m.id); }
          }
          this.go("open");
          fx.announce("The shell is open: strike the heart!");
          fx.spark?.(m.x, 3, m.z, "#ffd24a", 50);
        }
        break;
      }
      case "open":
        // stunned, shell wide open
        if (this.stT >= OPEN_S) { this.go("closing"); sfx.hit(); }
        break;
      case "closing":
        if (this.stT >= 0.6) {
          this.cycles++;
          if (this.p2 && this.cycles % 2 === 0) this.summon(3);
          this.go("stalk"); this.stalkFor = (this.p2 ? 1.6 : 2.6) + Math.random() * 1.2;
        }
        break;
    }
    this.vis.open = damp(this.vis.open, this.st === "open" ? 1 : 0, this.st === "open" ? 10 : 6, dt);
    this.vis.raise = damp(this.vis.raise, this.st === "windup" ? 1 : 0, 8, dt);
    this.vis.walk = damp(this.vis.walk, walking, 5, dt);
  }

  private teleDur = 1.3;
  private startWindup() {
    const me = this.me;
    // one claw on the boat, the other where the boat will be
    const lead = Math.max(6, Math.min(16, Math.abs(me.speed) * 1.1));
    const ax = me.x, az = me.z;
    const bx = me.x + Math.sin(me.rot) * lead, bz = me.z + Math.cos(me.rot) * lead;
    this.slams = [{ x: ax, z: az }, Math.hypot(bx - ax, bz - az) < 5 ? { x: ax + (Math.random() - 0.5) * 16, z: az + (Math.random() - 0.5) * 16 } : { x: bx, z: bz }];
    this.teleDur = Math.max(BossBehaviour.MIN_TELEGRAPH, this.p2 ? 1.05 : 1.3);
    for (const s of this.slams) this.env.fx.circleTelegraph(s.x, s.z, SLAM_R, this.teleDur);
    this.env.fx.roar(false);
    this.go("windup");
  }

  dispose() {
    const net = this.env.net;
    for (const c of this.brood) if (net.state.monsters.has(c.m.id)) net.removeMonster(c.m);
    this.brood = [];
  }
}

/** brood crab: scuttles to the boat, latches on, nibbles; one harpoon hit knocks it off (kills it) */
class Crabling implements MonsterController {
  hitRadius = 3.4;
  vis: CrabVis = { latched: false };
  private t = 0;
  private latchT = 0;
  private acc = 0;
  private flagged = false;
  private off = Math.random() * Math.PI * 2;
  constructor(private env: BossEnv, readonly m: MonsterS, private bossId: string) {}
  private get net(): SoloNet { return this.env.net; }
  damageScale() { return 1; }
  update(dt: number) {
    const net = this.net, m = this.m, me = net.me;
    this.t += dt;
    if (!net.state.monsters.has(this.bossId) || me.sunk) { net.removeMonster(m); return; }
    m.state = this.t < 0.5 ? "submerged" : "chasing";
    if (this.t < 0.5) return;
    if (!this.vis.latched) {
      net.moveToward(m, me.x, me.z, 12, dt);
      if (Math.hypot(me.x - m.x, me.z - m.z) < 3) { this.vis.latched = true; sfx.hit(); this.env.fx.toast?.("<b>🦀 A crab latched on!</b> Harpoon it off!", "bad"); }
      return;
    }
    // riding the hull
    this.off += dt * 0.6;
    m.x = me.x + Math.cos(this.off) * 1.4; m.z = me.z + Math.sin(this.off) * 1.4;
    m.rot = this.off;
    this.latchT += dt;
    this.acc += dt * 4;
    if (this.acc >= 2) { this.acc -= 2; net.damage(2, m.id); }
    if (this.latchT > 3 && !this.flagged) {
      this.flagged = true;
      this.env.emit?.({ t: "flag", flag: "crab_latched_long" });
    }
  }
}

registerBossBehaviour("crab_titan", (env) => new CrabTitan(env));
