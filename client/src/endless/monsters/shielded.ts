/**
 * Armored Crab: slow, turns slowly, carries a front shield (hits from within ±63° of its facing do 20%; side/back hits
 * do full damage). At mid range it digs in (1.0 s red lane telegraph) and charges along the lane; up close it raises a
 * claw (0.8 s circle) and pinches. Flank it.
 */
import { registerEndlessMonster, EndlessMonster } from "./base";
import { buildArmoredCrab, type CrabVis } from "./models";
import { damp, wrapAngle } from "../../util";
import { sfx } from "../../audio";

const FRONT_COS = 0.45;
const SHIELD = 0.2;
const TURN = 1.3; // rad/s
const CHARGE_WIND = 1.0, CHARGE_SPEED = 26, CHARGE_W = 6;
const PINCH_WIND = 0.8, PINCH_R = 6;

type St = "walk" | "windup" | "charge" | "recover" | "pinch";

let shieldHinted = false;

class ArmoredCrab extends EndlessMonster {
  hitRadius = 6;
  protected labelY = 6;
  protected aimY = 1.6;
  private vis: CrabVis = { walk: 0, charge: 0, windup: 0 };
  private st: St = "walk";
  private stT = 0;
  private chargeCd = 3 + Math.random() * 2;
  private pinchCd = 1;
  private dir = { x: 0, z: 1 };
  private left = 0;
  private hitDone = false;
  private pinchAt = { x: 0, z: 0 };
  private blockFx = 0;
  protected buildRig() { return buildArmoredCrab(this.vis); }

  /** the boat (where harpoons and most rigs fire from) is in front of the shield */
  private shielded() {
    const m = this.m, me = this.me;
    const dx = me.x - m.x, dz = me.z - m.z, d = Math.hypot(dx, dz) || 1;
    return (Math.sin(m.rot) * dx + Math.cos(m.rot) * dz) / d > FRONT_COS;
  }
  damageScale() { return this.shielded() ? SHIELD : 1; }

  onHit(dmg: number) {
    if (!this.shielded() || dmg <= 0) return;
    const m = this.m, fx = this.ctx.fx;
    if (this.t - this.blockFx > 0.35) {
      this.blockFx = this.t;
      fx.float?.("BLOCKED", m.x, 4.5, m.z, "clang");
      fx.spark?.(m.x + Math.sin(m.rot) * 2, 1.5, m.z + Math.cos(m.rot) * 2, "#cfe8ff", 24);
    }
    if (!shieldHinted) { shieldHinted = true; fx.toast?.("<b>🛡 Armored Crab:</b> its shield blocks 80% from the front. Hit it from the side or back!", "bad"); }
  }

  private go(s: St) { this.st = s; this.stT = 0; }

  protected tick(dt: number) {
    const m = this.m, me = this.me, tele = this.ctx.tele;
    this.stT += dt;
    this.chargeCd -= dt;
    this.pinchCd -= dt;
    const dx = me.x - m.x, dz = me.z - m.z, d = Math.hypot(dx, dz) || 1;
    let walking = 0;
    switch (this.st) {
      case "walk": {
        m.state = "chasing";
        const want = Math.atan2(dx, dz), diff = wrapAngle(want - m.rot);
        m.rot = wrapAngle(m.rot + Math.max(-TURN * dt, Math.min(TURN * dt, diff)));
        if (d > 5) {
          const sp = this.speed * (d > 60 ? 1.8 : 1) * (Math.abs(diff) > 1.2 ? 0.4 : 1);
          m.x += Math.sin(m.rot) * sp * dt; m.z += Math.cos(m.rot) * sp * dt;
          walking = 1;
        }
        if (d < PINCH_R + 2 && this.pinchCd <= 0) {
          this.pinchAt = { x: m.x + Math.sin(m.rot) * 3, z: m.z + Math.cos(m.rot) * 3 };
          tele.circle(this.pinchAt.x, this.pinchAt.z, PINCH_R, PINCH_WIND);
          this.go("pinch");
        } else if (d > 12 && d < 34 && this.chargeCd <= 0 && Math.abs(diff) < 0.5) {
          this.dir = { x: dx / d, z: dz / d };
          this.left = Math.min(d + 10, 40);
          m.rot = Math.atan2(dx, dz);
          tele.line(m.x, m.z, m.x + this.dir.x * this.left, m.z + this.dir.z * this.left, CHARGE_W, CHARGE_WIND);
          sfx.announce();
          this.go("windup");
        }
        break;
      }
      case "windup":
        m.state = "attacking";
        if (this.stT >= CHARGE_WIND) { this.hitDone = false; this.go("charge"); sfx.roar(false); }
        break;
      case "charge": {
        const step = Math.min(this.left, CHARGE_SPEED * dt);
        m.x += this.dir.x * step; m.z += this.dir.z * step;
        this.left -= step;
        if (!this.hitDone && d < CHARGE_W / 2 + 2.5) {
          this.hitDone = true;
          this.anim(); this.ctx.fx.shake(0.4); sfx.slam();
          this.hurt(this.dmg());
        }
        if (this.stT % 0.15 < dt) this.ctx.fx.splash(m.x, m.z, 1.4);
        if (this.left <= 0.01) { this.go("recover"); this.chargeCd = 5 + Math.random() * 2; }
        break;
      }
      case "recover":
        m.state = "chasing";
        if (this.stT >= 1.4) this.go("walk");
        break;
      case "pinch":
        m.state = "attacking";
        if (this.stT >= PINCH_WIND) {
          this.anim(); sfx.hit();
          if (Math.hypot(me.x - this.pinchAt.x, me.z - this.pinchAt.z) < PINCH_R + 1) this.hurt(this.dmg(Math.round(this.def.dmg * 0.75)));
          this.pinchCd = 2.6;
          this.go("recover");
        }
        break;
    }
    this.vis.walk = damp(this.vis.walk, walking, 5, dt);
    this.vis.windup = damp(this.vis.windup, this.st === "windup" || this.st === "pinch" ? 1 : 0, 8, dt);
    this.vis.charge = damp(this.vis.charge, this.st === "charge" ? 1 : 0, 10, dt);
  }
}

registerEndlessMonster("shielded", (ctx, m, def, elite, i) => new ArmoredCrab(ctx, m, def, elite, i));
