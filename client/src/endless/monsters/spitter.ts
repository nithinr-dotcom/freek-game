/**
 * Spitter Eel: keeps 24–31 m from the boat (strafing), rears up and lobs a glob of acid. The landing circle shows the
 * moment it starts charging (0.5 s charge + 0.9 s flight = 1.4 s); the boat takes damage if still inside on impact.
 */
import * as THREE from "three";
import { registerEndlessMonster, EndlessMonster } from "./base";
import { buildSpitterEel, type SpitterVis } from "./models";
import { damp } from "../../util";
import { sfx } from "../../audio";

const NEAR = 24, FAR = 31, SPIT_R = 5;
const CHARGE = 0.5, FLIGHT = 0.9;

interface Glob { mesh: THREE.Mesh; sx: number; sz: number; tx: number; tz: number; t: number }

class SpitterEel extends EndlessMonster {
  hitRadius = 5.5;
  protected labelY = 6.5;
  protected aimY = 1.5;
  private vis: SpitterVis = { charge: 0 };
  private cd = 2 + Math.random();
  private charging = -1;
  private aim = { x: 0, z: 0 };
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private strafeT = 3;
  private globs: Glob[] = [];
  protected buildRig() { return buildSpitterEel(this.vis); }

  update(dt: number, now: number) {
    super.update(dt, now);
    this.flyGlobs(dt);
  }

  protected tick(dt: number) {
    const m = this.m, me = this.me;
    const dx = me.x - m.x, dz = me.z - m.z, d = Math.hypot(dx, dz) || 1;
    this.cd -= dt;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 2.5 + Math.random() * 3; if (Math.random() < 0.5) this.strafe *= -1; }
    if (this.charging >= 0) {
      this.charging += dt;
      m.state = "attacking";
      this.vis.charge = Math.min(1, this.charging / CHARGE);
      if (this.charging >= CHARGE) { this.charging = -1; this.launch(); m.state = "chasing"; }
    } else {
      this.vis.charge = damp(this.vis.charge, 0, 6, dt);
      const ux = dx / d, uz = dz / d;
      let tx: number, tz: number;
      if (d < NEAR) { tx = m.x - ux * 10; tz = m.z - uz * 10; }
      else if (d > FAR) { tx = me.x; tz = me.z; }
      else { tx = m.x - uz * this.strafe * 10; tz = m.z + ux * this.strafe * 10; }
      this.net.moveToward(m, tx, tz, this.speed * (d > 60 ? 1.5 : d < NEAR ? 1.1 : 0.6), dt);
      if (this.cd <= 0 && d < FAR + 10) this.startSpit();
    }
    m.rot = Math.atan2(dx, dz);
  }

  private startSpit() {
    const me = this.me;
    // aim a little ahead of a moving boat
    const lead = Math.max(-6, Math.min(6, me.speed * 0.45));
    this.aim = { x: me.x + Math.sin(me.rot) * lead, z: me.z + Math.cos(me.rot) * lead };
    this.charging = 0;
    this.cd = (this.elite ? 2.6 : 3.4) + Math.random() * 0.8;
    this.ctx.tele.circle(this.aim.x, this.aim.z, SPIT_R, CHARGE + FLIGHT, undefined, "#7dff2a");
  }

  private launch() {
    const m = this.m;
    this.anim();
    sfx.cast();
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: "#9dff5a", emissive: "#5aff1a", emissiveIntensity: 2, flatShading: true }));
    mesh.position.set(m.x, 3, m.z);
    this.ctx.scene.add(mesh);
    this.globs.push({ mesh, sx: m.x, sz: m.z, tx: this.aim.x, tz: this.aim.z, t: 0 });
  }

  private flyGlobs(dt: number) {
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i];
      g.t += dt;
      const u = Math.min(1, g.t / FLIGHT);
      g.mesh.position.set(g.sx + (g.tx - g.sx) * u, 3 + Math.sin(u * Math.PI) * 11 - u * 2.5, g.sz + (g.tz - g.sz) * u);
      g.mesh.rotation.x += dt * 8;
      if (u >= 1) {
        this.drop(g);
        this.globs.splice(i, 1);
        const me = this.me;
        this.ctx.fx.splash(g.tx, g.tz, 2.2);
        this.ctx.fx.spark?.(g.tx, 1, g.tz, "#9dff5a", 30);
        if (Math.hypot(me.x - g.tx, me.z - g.tz) < SPIT_R + 1) this.hurt(this.dmg());
      }
    }
  }
  private drop(g: Glob) { this.ctx.scene.remove(g.mesh); g.mesh.geometry.dispose(); (g.mesh.material as THREE.Material).dispose(); }

  dispose() { for (const g of this.globs) this.drop(g); this.globs = []; }
}

registerEndlessMonster("spitter", (ctx, m, def, elite, i) => new SpitterEel(ctx, m, def, elite, i));
