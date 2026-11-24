/**
 * Reef Serpent (Act 1 boss). P1: circles the boat, then lunges along a red line telegraph (steer out of it).
 * After a lunge it is sluggish for a moment: the harpoon window. P2 (<50% HP): faster, double lunges.
 */
import { BossBehaviour, registerBossBehaviour, type BossEnv } from "./registry";

type St = "rising" | "circling" | "telegraph" | "lunge" | "recover" | "dive";

class ReefSerpent extends BossBehaviour {
  private st: St = "rising";
  private stT = 0;
  private ang = Math.random() * Math.PI * 2;
  private circleFor = 4;
  private lungeFrom = { x: 0, z: 0 }; private lungeTo = { x: 0, z: 0 };
  private lungeHit = false;
  private chain = 0;
  private dir = 1;
  constructor(env: BossEnv) { super(env); this.hitRadius = 8; }

  private get fast() { return this.phase >= 1 ? 1.35 : 1; }
  private go(s: St) { this.st = s; this.stT = 0; }

  protected enterPhase(p: number) {
    if (p !== 1) return;
    this.env.fx.roar(true);
    this.env.fx.shake(0.8);
    this.env.fx.announce("The Reef Serpent is enraged!");
    this.m.state = "submerged";
    this.go("dive");
  }

  protected tick(dt: number) {
    const m = this.m, me = this.me, net = this.env.net;
    this.stT += dt;
    const dx = me.x - m.x, dz = me.z - m.z, d = Math.hypot(dx, dz) || 1;
    switch (this.st) {
      case "rising":
        m.state = "submerged";
        if (this.stT > 1.2) { m.state = "chasing"; this.env.fx.splash(m.x, m.z, 4); this.go("circling"); this.circleFor = 3; }
        break;
      case "dive":
        // phase change: dive, reappear on the far side
        m.state = "submerged";
        if (this.stT > 2) {
          const a = Math.atan2(m.x - me.x, m.z - me.z) + Math.PI;
          m.x = me.x + Math.sin(a) * 26; m.z = me.z + Math.cos(a) * 26;
          net.keepOutOfHarbour(m);
          m.state = "chasing"; this.env.fx.splash(m.x, m.z, 5); this.env.fx.roar(true);
          this.go("circling"); this.circleFor = 1.5;
        }
        break;
      case "circling": {
        if (me.sunk) { m.state = "chasing"; break; }
        m.state = "chasing";
        const R = 22;
        this.ang += dt * 0.9 * this.fast * this.dir;
        const tx = me.x + Math.sin(this.ang) * R, tz = me.z + Math.cos(this.ang) * R;
        net.moveToward(m, tx, tz, 16 * this.fast, dt);
        net.keepOutOfHarbour(m);
        m.rot = Math.atan2(dx, dz) + this.dir * Math.PI / 2;
        if (this.stT > this.circleFor && Math.hypot(me.x, me.z) > 32) this.startTelegraph(m.x, m.z);
        break;
      }
      case "telegraph":
        m.rot = Math.atan2(this.lungeTo.x - m.x, this.lungeTo.z - m.z);
        if (this.stT >= this.teleDur) { this.go("lunge"); this.lungeHit = false; this.env.fx.attackAnim(); this.env.fx.roar(false); }
        break;
      case "lunge": {
        const dur = 0.55 / this.fast;
        const k = Math.min(1, this.stT / dur);
        m.state = "attacking";
        const px = m.x, pz = m.z;
        m.x = this.lungeFrom.x + (this.lungeTo.x - this.lungeFrom.x) * k;
        m.z = this.lungeFrom.z + (this.lungeTo.z - this.lungeFrom.z) * k;
        if (!this.lungeHit && !me.sunk && segDist(me.x, me.z, px, pz, m.x, m.z) < 4.2) {
          this.lungeHit = true;
          net.damage(this.phase >= 1 ? 26 : 22, m.id);
          this.env.fx.shake(0.7);
        }
        if (k >= 1) {
          this.env.fx.splash(m.x, m.z, 3);
          net.keepOutOfHarbour(m);
          if (this.phase >= 1 && this.chain === 0) { this.chain = 1; this.startTelegraph(m.x, m.z); }
          else { this.chain = 0; this.go("recover"); }
        }
        break;
      }
      case "recover":
        m.state = "chasing";
        // sluggish: drifts and turns slowly — harpoon window
        if (this.stT > 1.8 / this.fast) { this.go("circling"); this.circleFor = (this.phase >= 1 ? 2 : 3.2) + Math.random() * 1.2; this.dir = Math.random() < 0.5 ? -1 : 1; this.ang = Math.atan2(m.x - me.x, m.z - me.z); }
        break;
    }
  }

  private teleDur = 1.1;
  private startTelegraph(fx: number, fz: number) {
    const me = this.me;
    const dx = me.x - fx, dz = me.z - fz, d = Math.hypot(dx, dz) || 1;
    const len = Math.max(36, d + 18);
    this.lungeFrom = { x: fx, z: fz };
    this.lungeTo = { x: fx + (dx / d) * len, z: fz + (dz / d) * len };
    this.teleDur = Math.max(BossBehaviour.MIN_TELEGRAPH, (this.phase >= 1 ? 0.95 : 1.15) - (this.chain ? 0.1 : 0));
    this.env.fx.lineTelegraph(this.lungeFrom.x, this.lungeFrom.z, this.lungeTo.x, this.lungeTo.z, 7, this.teleDur);
    this.m.state = "chasing";
    this.go("telegraph");
  }
}

/** distance from point (x,z) to segment a-b (the lunge swept this frame) */
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

registerBossBehaviour("reef_serpent", (env) => new ReefSerpent(env));
