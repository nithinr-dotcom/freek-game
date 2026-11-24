/**
 * Reel minigame: keep the erratic fish marker inside your catch zone.
 * Hold to raise the zone (gravity drops it). Progress fills inside, drains outside; tension rises outside.
 * Tier is hidden ("???"); the bar glows with the tier colour only for Epic+.
 * Solo campaign passes ReelMods: species behaviour, line rating vs weight, reel speed, skills, assist.
 * Without mods the minigame behaves exactly as in multiplayer.
 */
import { TIER_INFO, tierRank, type Tier, type Behaviour } from "@freek/shared";
import { h } from "../util";

export interface ReelResult { success: boolean; maxTension: number }

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

export const BEHAVIOUR_INFO: Record<Behaviour, { label: string; icon: string; tip: string }> = {
  steady: { label: "Steady", icon: "〰", tip: "Smooth swimmer" },
  darter: { label: "Darter", icon: "⚡", tip: "Fast short dashes" },
  feinter: { label: "Feinter", icon: "🎭", tip: "Slows as if tired, then surges" },
  diver: { label: "Diver", icon: "⤓", tip: "Pulls down hard; tension builds fast" },
  thrasher: { label: "Thrasher", icon: "💥", tip: "Random violent jerks" },
  legend: { label: "Legend", icon: "🌟", tip: "Switches patterns every few seconds" },
};
const CYCLE: Behaviour[] = ["darter", "feinter", "diver", "thrasher", "steady"];

export class ReelGame {
  readonly el: HTMLElement;
  private zoneEl: HTMLElement; private fishEl: HTMLElement; private progFill: HTMLElement; private tensFill: HTMLElement; private tensWrap: HTMLElement;
  private label: HTMLElement; private tag: HTMLElement;
  active = false;
  // state (0..1 along the bar, 0 = bottom)
  private zonePos = 0.2; private zoneVel = 0; private zoneSize = 0.28;
  private fishPos = 0.4; private fishVel = 0; private fishTarget = 0.5; private retarget = 0;
  progress = 0.25; tension = 0; maxTension = 0;
  private difficulty = 0.3; private duration = 6000; private elapsed = 0;
  private onDone: ((r: ReelResult) => void) | null = null;
  private clickTimer = 0;
  onClick: (() => void) | null = null;
  // campaign behaviour state
  private mods: ReelMods | null = null;
  private beh: Behaviour = "steady";
  private behT = 0; private surgeT = 0; private tiredT = 0; private jerkT = 0;
  private lineMult = 1;
  private secondWindUsed = false;
  /** dev: auto-play the minigame (keeps the zone on the fish) */
  autoplay = false;

  constructor(root: HTMLElement) {
    this.zoneEl = h("div.reel-zone");
    this.fishEl = h("div.reel-fish", { html: `<svg viewBox="0 0 64 32"><path d="M4 16 C14 2 38 2 50 16 C38 30 14 30 4 16 Z" fill="currentColor"/><path d="M48 16 L62 5 L58 16 L62 27 Z" fill="currentColor"/><circle cx="14" cy="13" r="3" fill="#102030"/></svg>` });
    this.progFill = h("div.reel-prog-fill");
    this.tensFill = h("div.reel-tens-fill");
    this.tensWrap = h("div.reel-tension", null, h("div.reel-tens-lbl", null, "TENSION"), h("div.reel-tens-track", null, this.tensFill));
    this.label = h("div.reel-label", null, "???");
    this.tag = h("div.reel-tag");
    this.el = h("div.reel", null,
      this.label,
      this.tag,
      h("div.reel-body", null,
        h("div.reel-track", null, h("div.reel-water"), this.zoneEl, this.fishEl),
        h("div.reel-prog", null, this.progFill),
      ),
      this.tensWrap,
      h("div.reel-hint", { html: `<span class="only-desktop">Hold SPACE / mouse to raise</span><span class="only-touch">Hold REEL to raise</span>` }),
    );
    root.append(this.el);
  }

  start(tier: Tier | undefined, difficulty: number, durationMs: number, level: number, onDone: (r: ReelResult) => void, mods?: ReelMods | null) {
    this.active = true;
    this.onDone = onDone;
    this.mods = mods ?? null;
    this.difficulty = Math.max(0.05, Math.min(1, difficulty));
    this.duration = Math.max(2500, durationMs || 6000);
    this.zoneSize = 0.3 - this.difficulty * 0.13 + Math.min(0.06, (level - 1) * 0.008);
    this.zonePos = 0.1; this.zoneVel = 0;
    this.fishPos = 0.35; this.fishVel = 0; this.fishTarget = 0.5; this.retarget = 0.6;
    this.progress = 0.25; this.tension = 0; this.maxTension = 0; this.elapsed = 0;
    this.secondWindUsed = false;
    const glow = tier && tierRank(tier) >= tierRank("epic") ? TIER_INFO[tier].color : "";
    this.el.style.setProperty("--glow", glow || "transparent");
    this.el.classList.toggle("glowing", !!glow);
    this.el.classList.toggle("legendary", tier === "legendary");
    this.label.textContent = glow ? "??? — something BIG" : "???";
    this.tag.innerHTML = "";
    this.tag.className = "reel-tag";
    if (this.mods) {
      const m = this.mods;
      this.zoneSize *= 1 + m.zoneBonus;
      this.beh = m.behaviour === "legend" ? CYCLE[0] : m.behaviour ?? "steady";
      this.behT = 3 + Math.random() * 2; this.surgeT = 0; this.tiredT = 1.2; this.jerkT = 0.8;
      this.lineMult = Math.min(3.5, 1 + Math.max(0, (m.weightKg - m.ratingKg) / Math.max(1, m.ratingKg)));
      const b = BEHAVIOUR_INFO[m.behaviour ?? "steady"];
      this.tag.innerHTML = `<span class="rt-beh">${b.icon} ${b.label}</span>${this.lineMult > 1.01 ? `<span class="rt-heavy">⚠ Line ${m.ratingKg} kg · tension ×${this.lineMult.toFixed(1)}</span>` : ""}`;
      this.tag.classList.add("show");
    }
    this.el.classList.remove("done", "fail");
    this.el.classList.add("show");
  }

  stop() { this.active = false; this.el.classList.remove("show"); }

  /** held: player input; gust: 0..1 extra jitter from wind gusts */
  update(dt: number, held: boolean, gust: number) {
    if (!this.active) return;
    this.elapsed += dt * 1000;
    const d = this.difficulty;
    const m = this.mods;
    if (this.autoplay) held = this.fishPos > this.zonePos + this.zoneSize * 0.5 || (this.zoneVel < -0.4 && this.fishPos > this.zonePos + this.zoneSize * 0.25);
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
        const dart = Math.random() < d * 0.6;
        this.fishTarget = dart ? Math.random() : Math.max(0.02, Math.min(0.98, this.fishPos + (Math.random() - 0.5) * (0.3 + d * 0.7)));
        this.retarget = (dart ? 0.4 : 0.9) + Math.random() * (1.4 - d);
      }
      const speed = 0.8 + d * 3.4;
      this.fishVel += (this.fishTarget - this.fishPos) * speed * dt * 6;
      this.fishVel *= Math.exp(-(4 - d * 1.5) * dt);
      this.fishPos += this.fishVel * dt + (Math.random() - 0.5) * gust * 0.04;
    }
    this.fishPos = Math.max(0, Math.min(1, this.fishPos));
    // progress & tension. Fill time (always inside) ~= 0.65 * duration so the game never ends
    // before 55% of durationMs (server rule).
    const inside = this.fishPos >= this.zonePos && this.fishPos <= this.zonePos + this.zoneSize;
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
      this.tag.insertAdjacentHTML("beforeend", `<span class="rt-wind">💨 SECOND WIND!</span>`);
      m.onSecondWind?.();
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
    this.fishEl.classList.toggle("surge", this.surgeT > 0);
    this.progFill.style.height = `${Math.max(0, Math.min(1, this.progress)) * 100}%`;
    this.tensFill.style.width = `${Math.min(1, this.tension) * 100}%`;
    this.tensWrap.classList.toggle("danger", this.tension > 0.7);
    this.el.classList.toggle("shaky", this.tension > 0.7);

    if (this.progress >= 1) this.finish(true);
    else if (this.tension >= 1) this.finish(false);
    else if (this.progress <= 0 && this.elapsed > this.duration * 0.6) this.finish(false);
    else if (this.elapsed > this.duration * 3) this.finish(false);
  }

  /** §3 species behaviours */
  private behaviourAI(dt: number, d: number, gust: number) {
    const m = this.mods!;
    if (m.behaviour === "legend") {
      this.behT -= dt;
      if (this.behT <= 0) {
        this.behT = 3 + Math.random() * 2;
        this.beh = CYCLE[(CYCLE.indexOf(this.beh) + 1 + Math.floor(Math.random() * (CYCLE.length - 1))) % CYCLE.length];
        this.tag.querySelector(".rt-beh")!.textContent = `🌟 Legend · ${BEHAVIOUR_INFO[this.beh].label}`;
      }
    }
    let speed = 0.8 + d * 3.4, damping = 4 - d * 1.5, bias = 0;
    this.retarget -= dt;
    this.surgeT = Math.max(0, this.surgeT - dt);
    switch (this.beh) {
      case "steady":
        if (this.retarget <= 0) { this.fishTarget = clamp01(this.fishPos + (Math.random() - 0.5) * (0.3 + d * 0.4)); this.retarget = 1 + Math.random() * 1.2; }
        speed *= 0.65;
        break;
      case "darter":
        if (this.retarget <= 0) {
          const dir = this.fishPos > 0.8 ? -1 : this.fishPos < 0.2 ? 1 : Math.random() < 0.5 ? -1 : 1;
          this.fishTarget = clamp01(this.fishPos + dir * (0.14 + Math.random() * 0.2));
          this.retarget = 0.3 + Math.random() * 0.45;
        }
        speed *= 1.8; damping += 1.5;
        break;
      case "feinter":
        if (this.surgeT > 0) speed *= 2.4;
        else {
          this.tiredT -= dt;
          speed *= 0.35;
          if (this.tiredT <= 0) {
            this.surgeT = 0.55 + Math.random() * 0.3;
            this.tiredT = 1.4 + Math.random() * 1.4;
            this.fishTarget = this.fishPos > 0.5 ? Math.random() * 0.25 : 0.75 + Math.random() * 0.25;
          } else if (this.retarget <= 0) { this.fishTarget = clamp01(this.fishPos + (Math.random() - 0.5) * 0.12); this.retarget = 0.8; }
        }
        break;
      case "diver":
        if (this.retarget <= 0) { this.fishTarget = clamp01(this.fishPos - 0.05 - Math.random() * 0.25); this.retarget = 0.7 + Math.random() * 0.8; if (this.fishPos < 0.12) this.fishTarget = 0.3 + Math.random() * 0.4; }
        bias = -0.22;
        break;
      case "thrasher":
        if (this.retarget <= 0) { this.fishTarget = clamp01(this.fishPos + (Math.random() - 0.5) * 0.4); this.retarget = 0.8 + Math.random(); }
        this.jerkT -= dt;
        if (this.jerkT <= 0) { this.fishVel += (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.9); this.jerkT = 0.4 + Math.random() * 0.8; this.surgeT = 0.15; }
        break;
    }
    this.fishVel += (this.fishTarget - this.fishPos) * speed * dt * 6 + bias * dt;
    this.fishVel *= Math.exp(-damping * dt);
    this.fishPos += this.fishVel * dt + (Math.random() - 0.5) * gust * 0.04;
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

const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v));
