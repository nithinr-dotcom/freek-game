/** Catch reveal card: flips in with a rotating 3D fish, tier badge, weight/points, NEW BEST ribbon, XP float, confetti for Legendary. */
import { TIER_INFO, ZONES, type FishCardS, type Tier, type ZoneId } from "@freek/shared";
import { FishPreview } from "./fishPreview";
import { speciesInfo } from "../solo/species";
import { h, escapeHtml, fmtKg } from "../util";

export class Reveal {
  readonly el: HTMLElement;
  private card: HTMLElement;
  private previewHost: HTMLElement;
  private info: HTMLElement;
  private confetti: HTMLCanvasElement;
  private preview: FishPreview | null = null;
  private queue: (() => void)[] = [];
  private showing = false;
  private hideTimer = 0;
  private confettiParts: { x: number; y: number; vx: number; vy: number; r: number; vr: number; c: string; s: number }[] = [];

  constructor(root: HTMLElement) {
    this.previewHost = h("div.rv-preview");
    this.info = h("div.rv-info");
    this.card = h("div.rv-card", null, h("div.rv-shine"), this.previewHost, this.info);
    this.confetti = h("canvas.confetti") as HTMLCanvasElement;
    this.el = h("div.reveal", { onclick: () => this.dismiss() }, h("div.rv-rays"), this.card);
    root.append(this.el, this.confetti);
  }

  show(card: FishCardS, opts: { newBest?: boolean; xp?: number; perfect?: boolean; zone?: ZoneId; title?: string }) {
    const run = () => this.display(card, opts);
    if (this.showing) this.queue.push(run);
    else run();
  }

  private display(card: FishCardS, opts: { newBest?: boolean; xp?: number; perfect?: boolean; zone?: ZoneId; title?: string }) {
    this.showing = true;
    const sp = speciesInfo(card.speciesId);
    const tier: Tier = card.tier;
    const ti = TIER_INFO[tier];
    if (!this.preview) {
      this.preview = new FishPreview(320, 200);
      this.previewHost.append(this.preview.canvas);
    }
    this.preview.show(card.speciesId, ti.color);
    this.el.style.setProperty("--tier", ti.color);
    this.el.className = `reveal show tier-${tier}`;
    const label = tier === "legendary" ? "LEGENDARY!" : tier === "epic" ? "EPIC!" : tier === "gold" ? "GOLD!" : tier === "rare" ? "RARE" : "COMMON";
    this.info.innerHTML = `
      ${opts.title ? `<div class="rv-title">${escapeHtml(opts.title)}</div>` : ""}
      <div class="rv-tier">${label}</div>
      <div class="rv-name">${escapeHtml(sp?.name ?? card.speciesId)}</div>
      <div class="rv-stats">
        <div><span class="v">${fmtKg(card.weightKg)}</span><span class="k">weight</span></div>
        <div><span class="v">${card.points}</span><span class="k">points</span></div>
        ${opts.zone ? `<div><span class="v">${ZONES[opts.zone].name}</span><span class="k">zone</span></div>` : ""}
      </div>
      ${opts.perfect ? `<div class="rv-perfect">PERFECT REEL</div>` : ""}
      ${opts.xp ? `<div class="rv-xp">+${opts.xp} XP</div>` : ""}
      ${opts.newBest ? `<div class="rv-ribbon">NEW BEST!</div>` : ""}
      <div class="rv-dismiss">click to continue</div>`;
    this.card.classList.remove("flip");
    void this.card.offsetWidth;
    this.card.classList.add("flip");
    if (tier === "legendary" || tier === "epic") this.startConfetti(tier === "legendary");
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.dismiss(), tier === "legendary" ? 6500 : tier === "epic" ? 5000 : 3600);
  }

  dismiss() {
    if (!this.showing) return;
    clearTimeout(this.hideTimer);
    this.el.classList.add("out");
    setTimeout(() => {
      this.el.classList.remove("show", "out");
      this.showing = false;
      if (this.preview) this.preview.active = false;
      const next = this.queue.shift();
      if (next) next();
    }, 350);
  }

  private startConfetti(big: boolean) {
    const W = (this.confetti.width = window.innerWidth), H = (this.confetti.height = window.innerHeight);
    const cols = big ? ["#ff4fd8", "#ffd24a", "#3fd0ff", "#7dff6a", "#ff5a1f", "#b05cff"] : ["#b05cff", "#d9a8ff", "#ffffff"];
    const n = big ? 260 : 110;
    for (let i = 0; i < n; i++) {
      this.confettiParts.push({ x: W / 2 + (Math.random() - 0.5) * 200, y: H * 0.45, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 700, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: cols[i % cols.length], s: 5 + Math.random() * 7 });
    }
  }

  update(dt: number) {
    if (this.showing && this.preview) this.preview.render(dt);
    if (!this.confettiParts.length) return;
    const c = this.confetti.getContext("2d")!;
    c.clearRect(0, 0, this.confetti.width, this.confetti.height);
    for (const p of this.confettiParts) {
      p.vy += 900 * dt; p.vx *= Math.exp(-1.2 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      c.save(); c.translate(p.x, p.y); c.rotate(p.r);
      c.fillStyle = p.c; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      c.restore();
    }
    this.confettiParts = this.confettiParts.filter((p) => p.y < this.confetti.height + 30);
    if (!this.confettiParts.length) c.clearRect(0, 0, this.confetti.width, this.confetti.height);
  }
}
