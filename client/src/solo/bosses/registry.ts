/**
 * Boss behaviour registry. A boss file defines a BossBehaviour subclass and calls registerBossBehaviour(id, factory);
 * import it once from ./index.ts. The data (hp, phases, rewards) is in shared/src/campaign/bosses.ts.
 */
import type { BossDef, MonsterS } from "@freek/shared";
import type { MonsterController, SoloNet } from "../SoloNet";

/** effects a boss can trigger (implemented by the game) */
export interface BossFx {
  lineTelegraph(x1: number, z1: number, x2: number, z2: number, width: number, dur: number): void;
  circleTelegraph(x: number, z: number, r: number, dur: number): void;
  roar(big?: boolean): void;
  shake(n: number): void;
  splash(x: number, z: number, size: number): void;
  attackAnim(): void;
  announce(text: string): void;
}

export interface BossEnv {
  net: SoloNet;
  monster: MonsterS;
  def: BossDef;
  fx: BossFx;
  /** phase index to start in (checkpoint) */
  startPhase: number;
  /** called when the boss enters a new phase (checkpoint + UI pips) */
  onPhase(phase: number): void;
}

export abstract class BossBehaviour implements MonsterController {
  phase = 0;
  hitRadius = 8;
  /** seconds since spawn */
  protected t = 0;
  constructor(protected env: BossEnv) { this.phase = env.startPhase; }
  get m() { return this.env.monster; }
  get me() { return this.env.net.me; }
  /** every attack must be telegraphed for at least this long (§6) */
  static readonly MIN_TELEGRAPH = 0.8;

  update(dt: number, _now: number) { this.t += dt; this.tick(dt); }
  protected abstract tick(dt: number): void;
  /** override for phase-entry effects */
  protected enterPhase(_p: number) {}

  onHit(_dmg: number) {
    const pct = this.m.hp / this.m.maxHp;
    const phases = this.env.def.phases;
    for (let i = phases.length - 1; i > this.phase; i--) {
      if (pct <= phases[i].atPct && this.m.hp > 0) {
        this.phase = i;
        this.enterPhase(i);
        this.env.onPhase(i);
        break;
      }
    }
  }
}

type Factory = (env: BossEnv) => BossBehaviour;
const behaviours = new Map<string, Factory>();
export function registerBossBehaviour(id: string, f: Factory) { behaviours.set(id, f); }
export function createBossBehaviour(id: string, env: BossEnv): BossBehaviour | null { return behaviours.get(id)?.(env) ?? null; }
