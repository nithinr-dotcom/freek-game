/** Achievement tracking: bump save stats on events, unlock achievements and grant titles/cosmetics/coins. */
import { ACHIEVEMENTS, type Achievement } from "@freek/shared";
import type { SoloSave } from "./save";

export class AchievementTracker {
  onUnlock: ((a: Achievement) => void) | null = null;
  /** coin rewards are paid through the game state */
  payCoins: ((n: number) => void) | null = null;
  constructor(private save: SoloSave) {}

  bump(stat: string, n = 1) { this.save.stats[stat] = (this.save.stats[stat] ?? 0) + n; this.check(); }
  max(stat: string, v: number) { if (v > (this.save.stats[stat] ?? 0)) { this.save.stats[stat] = v; this.check(); } }
  set(stat: string, v: number) { this.save.stats[stat] = v; this.check(); }

  /** unlock everything whose condition holds (also used after migration) */
  check(silent = false) {
    for (const a of ACHIEVEMENTS) {
      if (this.save.achievements[a.id]) continue;
      if ((this.save.stats[a.cond.stat] ?? 0) < a.cond.gte) continue;
      this.save.achievements[a.id] = Date.now();
      const r = a.reward;
      if (r?.title && !this.save.titles.includes(r.title)) this.save.titles.push(r.title);
      if (r?.cosmetic && !this.save.cosmetics.includes(r.cosmetic)) this.save.cosmetics.push(r.cosmetic);
      if (r?.coins) this.payCoins?.(r.coins);
      if (!silent) this.onUnlock?.(a);
    }
  }
}
