/**
 * Endless monster roster runtime: the context EndlessMode hands over, the base controller every type extends, the
 * type registry and `spawnEndless()`. Each type is a MonsterController on top of the "serpent" MonsterKind with its
 * own rig (MonsterEntity.setVisual). See shared/src/endless/monsters.ts for the data (unlocks, weights, multipliers).
 */
import * as THREE from "three";
import { ENDLESS_MONSTERS, type EndlessMonsterDef, type EndlessMonsterType, type MonsterS, type TideSpec } from "@freek/shared";
import type { MonsterController, SoloNet } from "../../solo/SoloNet";
import type { BossFx } from "../../solo/bosses";
import type { Telegraphs } from "../../fx/telegraphs";
import type { MonsterEntity } from "../../entities/Monster";
import type { MonsterRig } from "../../entities/monsterModels";
import { ARENA } from "../world";

/** every attack is telegraphed for at least this long */
export const MIN_TELE = 0.6;

export interface EndlessMonsterCtx {
  net: SoloNet;
  scene: THREE.Scene;
  tele: Telegraphs;
  fx: BossFx;
  entity(id: string): MonsterEntity | undefined;
  spec(): TideSpec;
  /** the monster counts as one of the tide's (kills pay coins/xp) */
  register(id: string, elite: boolean): void;
  /** the monster left without being killed (a Puffer Mine that went off): stop counting it */
  forget(id: string): void;
  /** the tide is running (no splitting / spawning otherwise) */
  live(): boolean;
}

export interface SpawnOpts { elite?: boolean; hp?: number; spread?: number }

export abstract class EndlessMonster implements MonsterController {
  hitRadius = 6;
  protected t = 0;
  /** seconds spent submerged before surfacing */
  protected rise = 0.9;
  private dressed = false;
  constructor(protected ctx: EndlessMonsterCtx, readonly m: MonsterS, readonly def: EndlessMonsterDef, readonly elite: boolean, readonly index = 0) {}

  get net() { return this.ctx.net; }
  get me() { return this.ctx.net.me; }
  /** current speed: the def's, with the run's slows / elite bonus (EndlessMode.speedFor) */
  get speed() { return this.def.speed * (this.ctx.net.hooks.monsterSpeedMult?.(this.m) ?? 1); }
  /** base damage (serpent scale); SoloNet applies monsterDmgMult + armour */
  protected dmg(base = this.def.dmg) { return Math.round(base * (this.elite ? 1.25 : 1)); }
  protected hurt(amount: number) { if (!this.me.sunk) this.net.damage(amount, this.m.id); }
  protected boatDist() { return Math.hypot(this.me.x - this.m.x, this.me.z - this.m.z); }
  protected anim() { this.ctx.entity(this.m.id)?.attack(); }

  protected abstract buildRig(): MonsterRig;
  protected abstract tick(dt: number): void;
  protected labelY = 5;
  protected aimY = 1.5;
  protected modelScale = 1;

  private dress() {
    const e = this.ctx.entity(this.m.id);
    if (!e) return;
    this.dressed = true;
    e.setVisual(this.buildRig(), this.elite ? `Elite ${this.def.name}` : this.def.name, { labelY: this.labelY, aimY: this.aimY, cls: this.elite ? "elite" : "minion" });
    if (this.modelScale !== 1) e.root.scale.setScalar(this.modelScale);
  }

  update(dt: number, _now: number) {
    const m = this.m;
    this.t += dt;
    if (!this.dressed) this.dress();
    if (this.t < this.rise) { m.state = "submerged"; return; }
    if (m.state === "submerged") m.state = "chasing";
    if (this.me.sunk) return;
    this.tick(dt);
    // stay near the arena (they spawn just outside the ring)
    const dx = m.x - ARENA.x, dz = m.z - ARENA.z, r = Math.hypot(dx, dz), max = ARENA.r + 10;
    if (r > max) { m.x = ARENA.x + (dx / r) * max; m.z = ARENA.z + (dz / r) * max; }
  }

  dispose() {}
}

type Factory = (ctx: EndlessMonsterCtx, m: MonsterS, def: EndlessMonsterDef, elite: boolean, index: number) => EndlessMonster;
const factories = new Map<EndlessMonsterType, Factory>();
export function registerEndlessMonster(type: EndlessMonsterType, f: Factory) { factories.set(type, f); }

/** reward multipliers by monster id, read once by EndlessMode.onKill */
const rewards = new Map<string, { coin: number; xp: number }>();
export function takeEndlessReward(id: string): { coin: number; xp: number } {
  const r = rewards.get(id);
  rewards.delete(id);
  return r ?? { coin: 1, xp: 1 };
}

const hinted = new Set<EndlessMonsterType>();

/** spawn one monster (or a whole pack) of a roster type at (at.x, at.z); returns the spawned monsters */
export function spawnEndless(ctx: EndlessMonsterCtx, type: EndlessMonsterType, at: { x: number; z: number }, opts: SpawnOpts = {}): MonsterS[] {
  const def = ENDLESS_MONSTERS[type], f = factories.get(type);
  if (!def || !f) return [];
  const sp = ctx.spec();
  const elite = !!opts.elite && def.canElite;
  const n = def.group ? def.group[0] + Math.floor(Math.random() * (def.group[1] - def.group[0] + 1)) : 1;
  const spread = opts.spread ?? (n > 1 ? 3.5 : 0);
  const out: MonsterS[] = [];
  if (rewards.size > 400) rewards.clear();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const x = at.x + Math.cos(a) * spread * (n > 1 ? 1 : Math.random()), z = at.z + Math.sin(a) * spread * (n > 1 ? 1 : Math.random());
    const hp = Math.max(1, Math.round(opts.hp ?? sp.monsterHp * def.hpMult * (elite ? 3 : 1)));
    const m = ctx.net.spawnMonster("serpent", { scripted: true, quiet: true, hp, at: { x, z } });
    m.maxHp = m.hp;
    ctx.net.controllers.set(m.id, f(ctx, m, def, elite, i));
    ctx.register(m.id, elite);
    rewards.set(m.id, { coin: def.coinMult, xp: def.xpMult });
    out.push(m);
  }
  if (!hinted.has(type) && def.unlockTide !== Infinity) {
    hinted.add(type);
    ctx.fx.toast?.(`<b>☠ New foe: ${def.name}</b> ${def.blurb}`, "bad");
  }
  return out;
}
