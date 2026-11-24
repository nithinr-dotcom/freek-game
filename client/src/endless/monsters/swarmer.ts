/**
 * Piranha Pack: groups of 3–5 tiny, fast biters. Each fish circles its own spot around the boat, stops and flashes an
 * orange bite circle (0.6 s) and chomps if the boat is still inside. Any hit kills one.
 */
import { registerEndlessMonster, EndlessMonster, MIN_TELE } from "./base";
import { buildPiranha } from "./models";

const BITE_R = 4.2;

class Piranha extends EndlessMonster {
  hitRadius = 4;
  protected labelY = 3.2;
  protected aimY = 0.8;
  private off = this.index * 1.3 + Math.random() * 0.5;
  private wind = -1;
  private cd = 1 + Math.random();
  protected rise = 0.6 + this.index * 0.15;
  protected buildRig() { return buildPiranha(); }

  /** one bite of any kind kills it */
  onHit(dmg: number) { if (dmg > 0) this.m.hp = 0; }

  protected tick(dt: number) {
    const m = this.m, me = this.me;
    this.cd -= dt;
    if (this.wind >= 0) {
      this.wind += dt;
      m.state = "attacking";
      m.rot = Math.atan2(me.x - m.x, me.z - m.z);
      if (this.wind >= MIN_TELE) {
        this.wind = -1;
        this.cd = 1.4 + Math.random() * 0.8;
        m.state = "chasing";
        this.anim();
        if (this.boatDist() < BITE_R + 0.8) this.hurt(this.dmg());
      }
      return;
    }
    // circle a personal point around the boat so the pack surrounds you instead of stacking
    this.off += dt * 0.9;
    const d = this.boatDist();
    const ring = d > 12 ? 0 : 2.6;
    const tx = me.x + Math.cos(this.off) * ring, tz = me.z + Math.sin(this.off) * ring;
    this.net.moveToward(m, tx, tz, this.speed * (d > 40 ? 1.3 : 1), dt);
    if (d < BITE_R && this.cd <= 0) {
      this.wind = 0;
      this.ctx.tele.circle(m.x, m.z, BITE_R, MIN_TELE, undefined, "#ff8a2a");
    }
  }
}

registerEndlessMonster("swarmer", (ctx, m, def, elite, i) => new Piranha(ctx, m, def, elite, i));
