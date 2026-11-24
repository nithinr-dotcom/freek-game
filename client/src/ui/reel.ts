/**
 * Reel minigame: keep the erratic fish marker inside your catch zone.
 * Hold to raise the zone (gravity drops it). Progress fills inside, drains outside; tension rises outside.
 * Tier is hidden ("???"); the bar glows with the tier colour only for Epic+.
 */
import { TIER_INFO, tierRank, type Tier } from "@freek/shared";
import { h } from "../util";

export interface ReelResult { success: boolean; maxTension: number }

export class ReelGame {
  readonly el: HTMLElement;
  private zoneEl: HTMLElement; private fishEl: HTMLElement; private progFill: HTMLElement; private tensFill: HTMLElement; private tensWrap: HTMLElement;
  private label: HTMLElement;
  active = false;
  // state (0..1 along the bar, 0 = bottom)
  private zonePos = 0.2; private zoneVel = 0; private zoneSize = 0.28;
  private fishPos = 0.4; private fishVel = 0; private fishTarget = 0.5; private retarget = 0;
  progress = 0.25; tension = 0; maxTension = 0;
  private difficulty = 0.3; private duration = 6000; private elapsed = 0;
  private onDone: ((r: ReelResult) => void) | null = null;
  private clickTimer = 0;
  onClick: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.zoneEl = h("div.reel-zone");
    this.fishEl = h("div.reel-fish", { html: `<svg viewBox="0 0 64 32"><path d="M4 16 C14 2 38 2 50 16 C38 30 14 30 4 16 Z" fill="currentColor"/><path d="M48 16 L62 5 L58 16 L62 27 Z" fill="currentColor"/><circle cx="14" cy="13" r="3" fill="#102030"/></svg>` });
    this.progFill = h("div.reel-prog-fill");
    this.tensFill = h("div.reel-tens-fill");
    this.tensWrap = h("div.reel-tension", null, h("div.reel-tens-lbl", null, "TENSION"), h("div.reel-tens-track", null, this.tensFill));
    this.label = h("div.reel-label", null, "???");
    this.el = h("div.reel", null,
      this.label,
      h("div.reel-body", null,
        h("div.reel-track", null, h("div.reel-water"), this.zoneEl, this.fishEl),
        h("div.reel-prog", null, this.progFill),
      ),
      this.tensWrap,
      h("div.reel-hint", { html: `<span class="only-desktop">Hold SPACE / mouse to raise</span><span class="only-touch">Hold REEL to raise</span>` }),
    );
    root.append(this.el);
  }

  start(tier: Tier | undefined, difficulty: number, durationMs: number, level: number, onDone: (r: ReelResult) => void) {
    this.active = true;
    this.onDone = onDone;
    this.difficulty = Math.max(0.05, Math.min(1, difficulty));
    this.duration = Math.max(2500, durationMs || 6000);
    this.zoneSize = 0.3 - this.difficulty * 0.13 + Math.min(0.06, (level - 1) * 0.008);
    this.zonePos = 0.1; this.zoneVel = 0;
    this.fishPos = 0.35; this.fishVel = 0; this.fishTarget = 0.5; this.retarget = 0.6;
    this.progress = 0.25; this.tension = 0; this.maxTension = 0; this.elapsed = 0;
    const glow = tier && tierRank(tier) >= tierRank("epic") ? TIER_INFO[tier].color : "";
    this.el.style.setProperty("--glow", glow || "transparent");
    this.el.classList.toggle("glowing", !!glow);
    this.el.classList.toggle("legendary", tier === "legendary");
    this.label.textContent = glow ? "??? — something BIG" : "???";
    this.el.classList.remove("done", "fail");
    this.el.classList.add("show");
  }

  stop() { this.active = false; this.el.classList.remove("show"); }

  /** held: player input; gust: 0..1 extra jitter from wind gusts */
  update(dt: number, held: boolean, gust: number) {
    if (!this.active) return;
    this.elapsed += dt * 1000;
    const d = this.difficulty;
    // catch zone physics
    this.zoneVel += (held ? 4.0 : -3.0) * dt;
    this.zoneVel *= Math.exp(-1.8 * dt);
    this.zonePos += this.zoneVel * dt;
    if (this.zonePos < 0) { this.zonePos = 0; this.zoneVel = Math.abs(this.zoneVel) * 0.3; }
    if (this.zonePos > 1 - this.zoneSize) { this.zonePos = 1 - this.zoneSize; this.zoneVel = -Math.abs(this.zoneVel) * 0.3; }
    // fish AI: wander to targets; darts more often & faster with difficulty
    this.retarget -= dt;
    if (this.retarget <= 0) {
      const dart = Math.random() < d * 0.6;
      this.fishTarget = dart ? Math.random() : Math.max(0.02, Math.min(0.98, this.fishPos + (Math.random() - 0.5) * (0.3 + d * 0.7)));
      this.retarget = (dart ? 0.4 : 0.9) + Math.random() * (1.4 - d);
    }
    const speed = 0.8 + d * 3.4;
    this.fishVel += (this.fishTarget - this.fishPos) * speed * dt * 6;
    this.fishVel *= Math.exp(-(4 - d * 1.5) * dt);
    this.fishPos += this.fishVel * dt + (Math.random() - 0.5) * gust * 0.04;
    this.fishPos = Math.max(0, Math.min(1, this.fishPos));
    // progress & tension. Fill time (always inside) ~= 0.65 * duration so the game never ends
    // before 55% of durationMs (server rule).
    const inside = this.fishPos >= this.zonePos && this.fishPos <= this.zonePos + this.zoneSize;
    const fillRate = 0.75 / (this.duration * 0.65 / 1000);
    if (inside) {
      this.progress += fillRate * dt;
      this.tension = Math.max(0, this.tension - 0.6 * dt);
    } else {
      this.progress -= fillRate * 0.5 * dt;
      this.tension += (0.16 + d * 0.32 + gust * 0.12) * dt;
    }
    this.maxTension = Math.max(this.maxTension, this.tension);
    this.clickTimer -= dt;
    if (inside && this.clickTimer <= 0) { this.clickTimer = 0.09; this.onClick?.(); }
    // render
    this.zoneEl.style.bottom = `${this.zonePos * 100}%`;
    this.zoneEl.style.height = `${this.zoneSize * 100}%`;
    this.zoneEl.classList.toggle("on", inside);
    this.fishEl.style.bottom = `calc(${this.fishPos * 100}% - 12px)`;
    this.fishEl.classList.toggle("wiggle", !inside);
    this.progFill.style.height = `${Math.max(0, Math.min(1, this.progress)) * 100}%`;
    this.tensFill.style.width = `${Math.min(1, this.tension) * 100}%`;
    this.tensWrap.classList.toggle("danger", this.tension > 0.7);
    this.el.classList.toggle("shaky", this.tension > 0.7);

    if (this.progress >= 1) this.finish(true);
    else if (this.tension >= 1) this.finish(false);
    else if (this.progress <= 0 && this.elapsed > this.duration * 0.6) this.finish(false);
    else if (this.elapsed > this.duration * 3) this.finish(false);
  }

  private finish(success: boolean) {
    if (!this.active) return;
    this.active = false;
    this.el.classList.add(success ? "done" : "fail");
    const cb = this.onDone;
    this.onDone = null;
    setTimeout(() => this.el.classList.remove("show"), success ? 350 : 700);
    cb?.({ success, maxTension: Math.min(1, this.maxTension) });
  }
}
