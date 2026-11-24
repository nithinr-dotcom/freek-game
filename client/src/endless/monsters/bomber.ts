/**
 * Puffer Mine: drifts toward the boat; within 10 m it stops, inflates (1.3 s red circle) and explodes, hurting the
 * boat and any monster in the blast. Harpoon it before that and it pops safely: the boat is spared and the blast
 * hits the monsters around it instead (popping other mines too: chain reactions!). A mine that goes off by itself
 * pays nothing.
 */
import { registerEndlessMonster, EndlessMonster } from "./base";
import { buildPuffer, type PufferVis } from "./models";
import { damp } from "../../util";
import { sfx } from "../../audio";

const TRIGGER = 10, BLAST_R = 9, INFLATE = 1.3;

class PufferMine extends EndlessMonster {
  hitRadius = 4.5;
  protected labelY = 4.5;
  protected aimY = 1.2;
  private vis: PufferVis = { inflate: 0 };
  private inflating = -1;
  private wob = Math.random() * 6;
  private gone = false;
  protected buildRig() { return buildPuffer(this.vis); }

  onHit(_dmg: number) {
    if (this.m.hp > 0 || this.gone) return;
    this.blast(false);
  }

  /** self: it went off on its own (hurts the boat, no reward); otherwise it was popped */
  private blast(self: boolean) {
    this.gone = true;
    const m = this.m, fx = this.ctx.fx, net = this.net;
    fx.splash(m.x, m.z, self ? 4 : 3);
    fx.spark?.(m.x, 1.5, m.z, self ? "#ff6a2a" : "#ffd24a", 60);
    fx.shake(self ? 0.55 : 0.3);
    sfx.slam();
    if (!self) fx.float?.("POP!", m.x, 4, m.z, "crit");
    if (self && this.boatDist() < BLAST_R + 1) this.hurt(this.dmg());
    const sp = this.ctx.spec();
    const dmg = Math.round(sp.monsterHp * (self ? 0.6 : 1.1));
    net.state.monsters.forEach((o) => {
      if (o.id === m.id || o.state === "submerged" || net.isBoss(o.id)) return;
      if (Math.hypot(o.x - m.x, o.z - m.z) < BLAST_R) net.strike(o, dmg, { fx: false });
    });
    if (self) { this.ctx.forget(m.id); net.removeMonster(m); }
  }

  protected tick(dt: number) {
    const m = this.m, me = this.me;
    this.wob += dt;
    if (this.inflating >= 0) {
      this.inflating += dt;
      m.state = "attacking";
      this.vis.inflate = Math.min(1, this.inflating / INFLATE);
      if (this.inflating >= INFLATE && !this.gone) this.blast(true);
      return;
    }
    this.vis.inflate = damp(this.vis.inflate, 0, 4, dt);
    const d = this.boatDist();
    const tx = me.x + Math.sin(this.wob * 0.7) * 6, tz = me.z + Math.cos(this.wob * 0.9) * 6;
    this.net.moveToward(m, tx, tz, this.speed * (d > 50 ? 2 : 1), dt);
    if (d < TRIGGER) {
      this.inflating = 0;
      this.ctx.tele.circle(m.x, m.z, BLAST_R, INFLATE);
      sfx.announce();
    }
  }
}

registerEndlessMonster("bomber", (ctx, m, def, elite, i) => new PufferMine(ctx, m, def, elite, i));
