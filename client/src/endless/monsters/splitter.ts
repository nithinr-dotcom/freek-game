/**
 * Jelly Bloom: drifts toward the boat in a lazy zig-zag and stings around itself (0.8 s pink circle). When it dies it
 * splits into 2–3 Jellylets (smaller, faster, same sting, no further split) that count and pay as tide monsters.
 */
import { SPLIT_COUNT } from "@freek/shared";
import { registerEndlessMonster, EndlessMonster, spawnEndless } from "./base";
import { buildJelly } from "./models";

const STING_WIND = 0.8;

class Jelly extends EndlessMonster {
  private child = this.def.id === "splitling";
  hitRadius = this.child ? 3.8 : 5.5;
  protected labelY = this.child ? 3.5 : 5.5;
  protected aimY = this.child ? 0.8 : 1.6;
  protected rise = this.child ? 0.25 : 0.9;
  private stingR = this.child ? 4 : 6;
  private wind = -1;
  private cd = 1.5 + Math.random();
  private wob = Math.random() * 6;
  private split = false;
  protected buildRig() { return this.child ? buildJelly(0.55, "#ffa6e8") : buildJelly(1, "#ff5fd0"); }

  onHit(_dmg: number) {
    const m = this.m;
    if (this.child || this.split || m.hp > 0 || !this.ctx.live()) return;
    this.split = true;
    const n = SPLIT_COUNT[0] + Math.floor(Math.random() * (SPLIT_COUNT[1] - SPLIT_COUNT[0] + 1));
    const kids = [];
    for (let i = 0; i < n; i++) kids.push(...spawnEndless(this.ctx, "splitling", { x: m.x, z: m.z }, { spread: 3.5 }));
    this.ctx.fx.splash(m.x, m.z, 2.5);
    this.ctx.fx.spark?.(m.x, 1.5, m.z, "#ff7ad9", 40);
    this.ctx.fx.float?.(`SPLIT ×${kids.length}`, m.x, 4, m.z, "hit");
  }

  protected tick(dt: number) {
    const m = this.m, me = this.me;
    this.cd -= dt;
    this.wob += dt;
    if (this.wind >= 0) {
      this.wind += dt;
      m.state = "attacking";
      if (this.wind >= STING_WIND) {
        this.wind = -1;
        this.cd = 2.2 + Math.random();
        m.state = "chasing";
        this.anim();
        if (this.boatDist() < this.stingR + 1) this.hurt(this.dmg());
      }
      return;
    }
    const dx = me.x - m.x, dz = me.z - m.z, d = Math.hypot(dx, dz) || 1;
    const side = Math.sin(this.wob * 1.3) * (d > 10 ? 8 : 2);
    const tx = me.x - (dz / d) * side, tz = me.z + (dx / d) * side;
    // pulses: speed swells and fades with the bell
    const pulse = 0.55 + Math.max(0, Math.sin(this.wob * 3)) * 0.9;
    this.net.moveToward(m, tx, tz, this.speed * pulse * (d > 50 ? 1.5 : 1), dt);
    if (d < this.stingR - 0.5 && this.cd <= 0) {
      this.wind = 0;
      this.ctx.tele.circle(m.x, m.z, this.stingR, STING_WIND, undefined, "#ff5fd0");
    }
  }
}

registerEndlessMonster("splitter", (ctx, m, def, elite, i) => new Jelly(ctx, m, def, elite, i));
registerEndlessMonster("splitling", (ctx, m, def, elite, i) => new Jelly(ctx, m, def, elite, i));
