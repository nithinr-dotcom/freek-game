/**
 * Reel minigame: keep the erratic fish marker inside your catch zone.
 * Hold to raise the zone (gravity drops it). Progress fills inside, drains outside; tension rises outside.
 * Tier is hidden ("???"); the bar glows with the tier colour only for Epic+.
 * Solo campaign passes ReelMods: species behaviour, line rating vs weight, reel speed, skills, assist.
 * Without mods the minigame behaves exactly as in multiplayer.
 */
import { TIER_INFO, tierRank, type Tier, type Behaviour } from "@freek/shared";
import { h } from "../util";
import { ReelSim, type ReelMods } from "./reelSim";

export interface ReelResult { success: boolean; maxTension: number }

export type { ReelMods };

export const BEHAVIOUR_INFO: Record<Behaviour, { label: string; icon: string; tip: string }> = {
  steady: { label: "Steady", icon: "〰", tip: "Smooth swimmer" },
  darter: { label: "Darter", icon: "⚡", tip: "Fast short dashes" },
  feinter: { label: "Feinter", icon: "🎭", tip: "Slows as if tired, then surges" },
  diver: { label: "Diver", icon: "⤓", tip: "Pulls down hard; tension builds fast" },
  thrasher: { label: "Thrasher", icon: "💥", tip: "Random violent jerks" },
  legend: { label: "Legend", icon: "🌟", tip: "Switches patterns every few seconds" },
};

export class ReelGame {
  readonly el: HTMLElement;
  private zoneEl: HTMLElement; private fishEl: HTMLElement; private progFill: HTMLElement; private tensFill: HTMLElement; private tensWrap: HTMLElement;
  private label: HTMLElement; private tag: HTMLElement;
  active = false;
  /** the physics (shared with the headless balance script) */
  readonly sim = new ReelSim();
  get progress() { return this.sim.progress; } set progress(v: number) { this.sim.progress = v; }
  get tension() { return this.sim.tension; } set tension(v: number) { this.sim.tension = v; }
  get maxTension() { return this.sim.maxTension; }
  private onDone: ((r: ReelResult) => void) | null = null;
  private clickTimer = 0;
  onClick: (() => void) | null = null;
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
    const sim = this.sim;
    sim.start(difficulty, durationMs, level, mods);
    sim.onBehaviour = (b) => { const el = this.tag.querySelector(".rt-beh"); if (el) el.textContent = `🌟 Legend · ${BEHAVIOUR_INFO[b].label}`; };
    sim.onSecondWind = () => this.tag.insertAdjacentHTML("beforeend", `<span class="rt-wind">💨 SECOND WIND!</span>`);
    const glow = tier && tierRank(tier) >= tierRank("epic") ? TIER_INFO[tier].color : "";
    this.el.style.setProperty("--glow", glow || "transparent");
    this.el.classList.toggle("glowing", !!glow);
    this.el.classList.toggle("legendary", tier === "legendary");
    this.label.textContent = glow ? "??? — something BIG" : "???";
    this.tag.innerHTML = "";
    this.tag.className = "reel-tag";
    if (sim.mods) {
      const m = sim.mods;
      const b = BEHAVIOUR_INFO[m.behaviour ?? "steady"];
      this.tag.innerHTML = `<span class="rt-beh">${b.icon} ${b.label}</span>${sim.lineMult > 1.01 ? `<span class="rt-heavy">⚠ Line ${m.ratingKg} kg · tension ×${sim.lineMult.toFixed(1)}</span>` : ""}`;
      this.tag.classList.add("show");
    }
    this.el.classList.remove("done", "fail");
    this.el.classList.add("show");
  }

  stop() { this.active = false; this.el.classList.remove("show"); }

  /** held: player input; gust: 0..1 extra jitter from wind gusts */
  update(dt: number, held: boolean, gust: number) {
    if (!this.active) return;
    const sim = this.sim;
    if (this.autoplay) held = sim.autoHeld();
    const res = sim.step(dt, held, gust);
    const inside = sim.inside;
    this.clickTimer -= dt;
    if (inside && this.clickTimer <= 0) { this.clickTimer = 0.09; this.onClick?.(); }
    // render
    this.zoneEl.style.bottom = `${sim.zonePos * 100}%`;
    this.zoneEl.style.height = `${sim.zoneSize * 100}%`;
    this.zoneEl.classList.toggle("on", inside);
    this.fishEl.style.bottom = `calc(${sim.fishPos * 100}% - 12px)`;
    this.fishEl.classList.toggle("wiggle", !inside);
    this.fishEl.classList.toggle("surge", sim.surgeT > 0);
    this.progFill.style.height = `${Math.max(0, Math.min(1, sim.progress)) * 100}%`;
    this.tensFill.style.width = `${Math.min(1, sim.tension) * 100}%`;
    this.tensWrap.classList.toggle("danger", sim.tension > 0.7);
    this.el.classList.toggle("shaky", sim.tension > 0.7);
    if (res !== null) this.finish(res);
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

