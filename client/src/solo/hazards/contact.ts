/**
 * Contact damage: solid surfaces that hurt the hull when the boat scrapes them (Coral Maze coral walls; reusable for
 * spiked ice, reef rocks, …). The region client registers its surfaces with `registerContactSurfaces(hazardKey, …)`;
 * they must also be layout obstacles so the boat is pushed out (it then sits exactly on the surface edge).
 * Towed / moored NPC boats are pushed out of the same surfaces and take (lighter) damage too.
 */
import * as THREE from "three";
import { resolveObstacles, type Obstacle } from "../../world/layout";
import { sfx } from "../../audio";
import { registerHazard, type Hazard, type HazardEnv } from "./registry";

export interface ContactOpts {
  /** hull damage per scrape */
  damage: number;
  /** seconds between two scrapes */
  cooldown: number;
  /** damage to NPC boats per scrape */
  npcDamage: number;
  /** damage source id (SoloNet.damage "by") */
  source: string;
  color: string;
  /** first-contact toast */
  warn: string;
}

const BOAT_R = 2.4, NPC_R = 2.2, SLOP = 0.35, CELL = 16;
const surfaces = new Map<string, { list: Obstacle[]; opts: ContactOpts }>();
export function registerContactSurfaces(key: string, list: Obstacle[], opts: ContactOpts) { surfaces.set(key, { list, opts }); }

class ContactHazard implements Hazard {
  private grid = new Map<string, Obstacle[]>();
  private cd = 0;
  private npcCd = new Map<string, number>();
  private warned = false;
  private p = { x: 0, z: 0 };
  private v = new THREE.Vector3();
  constructor(private env: HazardEnv, private list: Obstacle[], private opts: ContactOpts) {
    for (const o of list) {
      const k = `${Math.floor(o.x / CELL)},${Math.floor(o.z / CELL)}`;
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(o);
    }
  }
  /** nearest surface touching a circle at (x,z) of radius r */
  touching(x: number, z: number, r: number): Obstacle | null {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best: Obstacle | null = null, bd = Infinity;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const o of this.grid.get(`${cx + i},${cz + j}`) ?? []) {
        const d = Math.hypot(x - o.x, z - o.z) - o.r - r;
        if (d < SLOP && d < bd) { bd = d; best = o; }
      }
    }
    return best;
  }
  update(dt: number) {
    const env = this.env, me = env.net.me;
    this.cd -= dt;
    for (const [k, v] of this.npcCd) this.npcCd.set(k, v - dt);
    if (!env.live()) return;
    const b = env.boat();
    const hit = !me.sunk ? this.touching(b.x, b.z, BOAT_R) : null;
    if (hit && this.cd <= 0) {
      this.cd = this.opts.cooldown;
      env.net.damage(this.opts.damage, this.opts.source);
      const dx = b.x - hit.x, dz = b.z - hit.z, d = Math.hypot(dx, dz) || 1;
      const px = hit.x + (dx / d) * hit.r, pz = hit.z + (dz / d) * hit.r;
      env.fx.sparkAt(this.v.set(px, 1, pz), this.opts.color, 26);
      env.fx.splashAt(px, pz, 0.8);
      b.knockback(hit.x, hit.z, 4);
      sfx.hit();
      if (!this.warned) { this.warned = true; env.toast(this.opts.warn, "bad"); }
    }
    for (const n of env.npcs()) {
      if (!n.alive) continue;
      this.p.x = n.x; this.p.z = n.z;
      const t = this.touching(n.x, n.z, NPC_R);
      if (!t) continue;
      resolveObstacles(this.p, NPC_R);
      n.x = this.p.x; n.z = this.p.z;
      if ((this.npcCd.get(n.id) ?? 0) <= 0) {
        this.npcCd.set(n.id, this.opts.cooldown * 1.4);
        n.damage(this.opts.npcDamage);
        env.fx.sparkAt(this.v.set(n.x, 1, n.z), this.opts.color, 16);
      }
    }
  }
  reset() { this.cd = 0.5; this.npcCd.clear(); }
  dispose() { this.grid.clear(); }
}

/** one hazard key per surface set; Coral Maze registers "coralDamage" */
export function registerContactHazard(key: string) {
  registerHazard(key, (env) => {
    const s = surfaces.get(key);
    return s ? new ContactHazard(env, s.list, s.opts) : { update() {}, dispose() {} };
  });
}
registerContactHazard("coralDamage");
