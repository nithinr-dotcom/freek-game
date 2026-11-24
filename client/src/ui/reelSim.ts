/**
 * Reel minigame physics, DOM-free (P4: extracted from ReelGame so the headless balance script can run the exact same
 * model). ReelGame owns one ReelSim and only renders it. Without mods it behaves exactly as in multiplayer.
 */
import type { Behaviour } from "@freek/shared";

export interface ReelMods {
  behaviour?: Behaviour;
  weightKg: number;
  ratingKg: number;
  fillMult: number;
  liftMult: number;
  /** catch zone size multiplier bonus (0.04 = +4%) */
  zoneBonus: number;
  tensionMult: number;
  secondWind: boolean;
  onSecondWind?: () => void;
}

export const REEL_CYCLE: Behaviour[] = ["darter", "feinter", "diver", "thrasher", "steady"];
const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v));

export class ReelSim {
  // state (0..1 along the bar, 0 = bottom)
  zonePos = 0.2; zoneVel = 0; zoneSize = 0.28;
  fishPos = 0.4; fishVel = 0; fishTarget = 0.5; retarget = 0;
  progress = 0.25; tension = 0; maxTension = 0;
  difficulty = 0.3; duration = 6000; elapsed = 0;
  mods: ReelMods | null = null;
  beh: Behaviour = "steady";
  behT = 0; surgeT = 0; tiredT = 0; jerkT = 0;
  lineMult = 1;
  secondWindUsed = false;
  inside = false;
  /** null while running, then the outcome */
  result: boolean | null = null;
  /** hooks for the renderer */
  onBehaviour: ((b: Behaviour) => void) | null = null;
  onSecondWind: (() => void) | null = null;

  constructor(private rng: () => number = Math.random) {}

  start(difficulty: number, durationMs: number, level: number, mods?: ReelMods | null) {
    this.mods = mods ?? null;
    this.difficulty = Math.max(0.05, Math.min(1, difficulty));
    this.duration = Math.max(2500, durationMs || 6000);
    this.zoneSize = 0.3 - this.difficulty * 0.13 + Math.min(0.06, (level - 1) * 0.008);
    this.zonePos = 0.1; this.zoneVel = 0;
    this.fishPos = 0.35; this.fishVel = 0; this.fishTarget = 0.5; this.retarget = 0.6;
    this.progress = 0.25; this.tension = 0; this.maxTension = 0; this.elapsed = 0;
    this.secondWindUsed = false;
    this.result = null;
    if (this.mods) {
      const m = this.mods;
      this.zoneSize *= 1 + m.zoneBonus;
      this.beh = m.behaviour === "legend" ? REEL_CYCLE[0] : m.behaviour ?? "steady";
      this.behT = 3 + this.rng() * 2; this.surgeT = 0; this.tiredT = 1.2; this.jerkT = 0.8;
      this.lineMult = Math.min(3.5, 1 + Math.max(0, (m.weightKg - m.ratingKg) / Math.max(1, m.ratingKg)));
    }
  }

  /** the dev autoplay rule (also the balance script's baseline bot) */
  autoHeld() { return this.fishPos > this.zonePos + this.zoneSize * 0.5 || (this.zoneVel < -0.4 && this.fishPos > this.zonePos + this.zoneSize * 0.25); }

  /** one frame; returns the outcome once finished (true = landed) */
  step(dt: number, held: boolean, gust: number): boolean | null {
    if (this.result !== null) return this.result;
    const rng = this.rng;
    this.elapsed += dt * 1000;
    const d = this.difficulty;
    const m = this.mods;
    // catch zone physics
    this.zoneVel += (held ? 4.0 * (m?.liftMult ?? 1) : -3.0) * dt;
    this.zoneVel *= Math.exp(-1.8 * dt);
    this.zonePos += this.zoneVel * dt;
    if (this.zonePos < 0) { this.zonePos = 0; this.zoneVel = Math.abs(this.zoneVel) * 0.3; }
    if (this.zonePos > 1 - this.zoneSize) { this.zonePos = 1 - this.zoneSize; this.zoneVel = -Math.abs(this.zoneVel) * 0.3; }
    if (m) this.behaviourAI(dt, d, gust);
    else {
      // fish AI: wander to targets; darts more often & faster with difficulty
      this.retarget -= dt;
      if (this.retarget <= 0) {
        const dart = rng() < d * 0.6;
        this.fishTarget = dart ? rng() : Math.max(0.02, Math.min(0.98, this.fishPos + (rng() - 0.5) * (0.3 + d * 0.7)));
        this.retarget = (dart ? 0.4 : 0.9) + rng() * (1.4 - d);
      }
      const speed = 0.8 + d * 3.4;
      this.fishVel += (this.fishTarget - this.fishPos) * speed * dt * 6;
      this.fishVel *= Math.exp(-(4 - d * 1.5) * dt);
      this.fishPos += this.fishVel * dt + (rng() - 0.5) * gust * 0.04;
    }
    this.fishPos = Math.max(0, Math.min(1, this.fishPos));
    // progress & tension. Fill time (always inside) ~= 0.65 * duration so the game never ends
    // before 55% of durationMs (server rule).
    const inside = this.fishPos >= this.zonePos && this.fishPos <= this.zonePos + this.zoneSize;
    this.inside = inside;
    const fillRate = (0.75 / (this.duration * 0.65 / 1000)) * (m ? m.fillMult : 1);
    if (inside) {
      this.progress += fillRate * dt;
      this.tension = Math.max(0, this.tension - 0.6 * dt);
    } else {
      this.progress -= fillRate * 0.5 * dt;
      let gain = (0.16 + d * 0.32 + gust * 0.12) * dt;
      if (m) gain *= m.tensionMult * this.lineMult * (this.beh === "diver" ? 1.35 : 1);
      this.tension += gain;
    }
    if (m && this.tension >= 1 && m.secondWind && !this.secondWindUsed) {
      this.secondWindUsed = true;
      this.tension = 0.6;
      this.onSecondWind?.();
      m.onSecondWind?.();
    }
    this.maxTension = Math.max(this.maxTension, this.tension);
    if (this.progress >= 1) this.result = true;
    else if (this.tension >= 1) this.result = false;
    else if (this.progress <= 0 && this.elapsed > this.duration * 0.6) this.result = false;
    else if (this.elapsed > this.duration * 3) this.result = false;
    return this.result;
  }

  /** §3 species behaviours */
  private behaviourAI(dt: number, d: number, gust: number) {
    const m = this.mods!, rng = this.rng;
    if (m.behaviour === "legend") {
      this.behT -= dt;
      if (this.behT <= 0) {
        this.behT = 3 + rng() * 2;
        this.beh = REEL_CYCLE[(REEL_CYCLE.indexOf(this.beh) + 1 + Math.floor(rng() * (REEL_CYCLE.length - 1))) % REEL_CYCLE.length];
        this.onBehaviour?.(this.beh);
      }
    }
    let speed = 0.8 + d * 3.4, damping = 4 - d * 1.5, bias = 0;
    this.retarget -= dt;
    this.surgeT = Math.max(0, this.surgeT - dt);
    switch (this.beh) {
      case "steady":
        if (this.retarget <= 0) { this.fishTarget = clamp01(this.fishPos + (rng() - 0.5) * (0.3 + d * 0.4)); this.retarget = 1 + rng() * 1.2; }
        speed *= 0.65;
        break;
      case "darter":
        if (this.retarget <= 0) {
          const dir = this.fishPos > 0.8 ? -1 : this.fishPos < 0.2 ? 1 : rng() < 0.5 ? -1 : 1;
          this.fishTarget = clamp01(this.fishPos + dir * (0.14 + rng() * 0.2));
          this.retarget = 0.3 + rng() * 0.45;
        }
        speed = (0.9 + d * 2.4) * 1.5; damping += 1.5; // P4 balance: was speed ×1.8 (rare+ darters were near-impossible)
        break;
      case "feinter":
        if (this.surgeT > 0) speed *= 2.4;
        else {
          this.tiredT -= dt;
          speed *= 0.35;
          if (this.tiredT <= 0) {
            this.surgeT = 0.55 + rng() * 0.3;
            this.tiredT = 1.4 + rng() * 1.4;
            this.fishTarget = this.fishPos > 0.5 ? rng() * 0.25 : 0.75 + rng() * 0.25;
          } else if (this.retarget <= 0) { this.fishTarget = clamp01(this.fishPos + (rng() - 0.5) * 0.12); this.retarget = 0.8; }
        }
        break;
      case "diver":
        if (this.retarget <= 0) { this.fishTarget = clamp01(this.fishPos - 0.05 - rng() * 0.25); this.retarget = 0.7 + rng() * 0.8; if (this.fishPos < 0.12) this.fishTarget = 0.3 + rng() * 0.4; }
        bias = -0.22;
        break;
      case "thrasher":
        if (this.retarget <= 0) { this.fishTarget = clamp01(this.fishPos + (rng() - 0.5) * 0.4); this.retarget = 0.8 + rng(); }
        this.jerkT -= dt;
        if (this.jerkT <= 0) { this.fishVel += (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.9); this.jerkT = 0.4 + rng() * 0.8; this.surgeT = 0.15; }
        break;
    }
    this.fishVel += (this.fishTarget - this.fishPos) * speed * dt * 6 + bias * dt;
    this.fishVel *= Math.exp(-damping * dt);
    this.fishPos += this.fishVel * dt + (rng() - 0.5) * gust * 0.04;
  }
}
