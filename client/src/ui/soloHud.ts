/** Solo-only HUD: clock + chapter timer strip, load bar + bait slot (in the bag panel), dock action bar, bait offer, achievement banner. */
import type { Achievement, TimeOfDay } from "@freek/shared";
import { h, escapeHtml } from "../util";

export interface SoloHudHooks { bait(): void; keepBait(): void; workshop(): void; chart(): void; rest(): void; codex(): void }
export interface SoloHudState {
  clock: string; phase: TimeOfDay;
  timer: { text: string; urgent: boolean; limit: boolean } | null;
  title: string;
  loadKg: number; capKg: number; loadFactor: number;
  bait: { name: string; count: number } | null;
  baitTypes: number;
  atDock: boolean; restLabel: string; skillPoints: number;
}

function setText(el: HTMLElement, s: string) { if (el.textContent !== s) el.textContent = s; }

export class SoloHud {
  private strip: HTMLElement; private clockEl: HTMLElement; private timerEl: HTMLElement; private titleEl: HTMLElement;
  private load: HTMLElement; private loadFill: HTMLElement; private loadText: HTMLElement;
  private baitBtn: HTMLElement; private baitName: HTMLElement; private baitCount: HTMLElement;
  private dock: HTMLElement; private restBtn: HTMLElement; private wsBtn: HTMLElement;
  private offer: HTMLElement; private offerTimer = 0;
  private ach: HTMLElement;
  private lastPhase: TimeOfDay | "" = "";

  constructor(root: HTMLElement, bag: HTMLElement, private hooks: SoloHudHooks) {
    this.clockEl = h("span.ss-clock"); this.timerEl = h("span.ss-timer"); this.titleEl = h("span.ss-title");
    this.strip = h("div.panel.solo-strip", null, this.clockEl, this.timerEl, this.titleEl);
    this.loadFill = h("i"); this.loadText = h("span.ld-text");
    this.load = h("div.load-bar", { title: "Load: unbanked catch slows the boat" }, h("span.ld-icon", null, "⚖"), h("div.ld-track", null, this.loadFill), this.loadText);
    this.baitName = h("span.bt-name", null, "No bait"); this.baitCount = h("span.bt-count");
    this.baitBtn = h("button.bait-slot", { title: "Bait (B): tap to cycle", onpointerdown: (e: PointerEvent) => { e.stopPropagation(); e.preventDefault(); this.hooks.bait(); } }, h("span.bt-icon", null, "🪱"), h("div.bt-body", null, this.baitName, this.baitCount), h("span.bt-key.only-desktop", null, "B"));
    bag.append(h("div.bag-solo", null, this.load, this.baitBtn));
    bag.classList.add("solo-bag");
    const btn = (icon: string, label: string, key: string, fn: () => void) =>
      h("button.dock-btn", { onpointerdown: (e: PointerEvent) => { e.stopPropagation(); e.preventDefault(); fn(); } }, h("span.db-icon", null, icon), h("span.db-label", null, label), h("span.db-key.only-desktop", null, key));
    this.wsBtn = btn("🔨", "Workshop", "1", () => this.hooks.workshop());
    this.restBtn = btn("🌙", "Rest", "R", () => this.hooks.rest());
    this.dock = h("div.dock-bar", null, h("div.dock-title", null, "⚓ Marlow's Dock"), h("div.dock-row", null, this.wsBtn, btn("🗺", "Sea Chart", "2", () => this.hooks.chart()), this.restBtn, btn("📖", "Codex", "C", () => this.hooks.codex())));
    this.offer = h("div.bait-offer");
    this.ach = h("div.ach-banner");
    root.append(this.strip, this.dock, this.offer, this.ach);
  }

  update(dt: number, s: SoloHudState) {
    setText(this.clockEl, `${s.phase === "night" ? "🌙" : s.phase === "dusk" ? "🌇" : "☀"} ${s.clock}`);
    this.strip.classList.toggle("night", s.phase === "night");
    if (s.phase !== this.lastPhase) { this.lastPhase = s.phase; this.clockEl.classList.remove("pop"); void this.clockEl.offsetWidth; this.clockEl.classList.add("pop"); }
    this.timerEl.style.display = s.timer ? "" : "none";
    if (s.timer) { setText(this.timerEl, `${s.timer.limit ? "⏳" : "⏱"} ${s.timer.text}`); this.timerEl.classList.toggle("urgent", s.timer.urgent); }
    setText(this.titleEl, s.title);
    const k = Math.min(1, s.loadKg / Math.max(1, s.capKg));
    this.loadFill.style.width = `${k * 100}%`;
    this.load.classList.toggle("heavy", s.loadFactor < 0.8);
    this.load.classList.toggle("full", s.loadFactor <= 0.56);
    setText(this.loadText, `${s.loadKg.toFixed(s.loadKg < 10 ? 1 : 0)}/${s.capKg} kg${s.loadFactor < 0.99 ? ` · ${Math.round(s.loadFactor * 100)}% speed` : ""}`);
    setText(this.baitName, s.bait ? s.bait.name : s.baitTypes ? "No bait (tap)" : "No bait");
    setText(this.baitCount, s.bait ? `×${s.bait.count}` : "");
    this.baitBtn.classList.toggle("on", !!s.bait);
    this.baitBtn.classList.toggle("has", s.baitTypes > 0);
    this.dock.classList.toggle("show", s.atDock);
    this.restBtn.querySelector(".db-label")!.textContent = `Rest · ${s.restLabel}`;
    this.wsBtn.dataset.badge = s.skillPoints > 0 ? String(s.skillPoints) : "";
    if (this.offerTimer > 0) { this.offerTimer -= dt; if (this.offerTimer <= 0) this.offer.classList.remove("show"); }
  }

  /** "Keep as bait?" prompt after landing a baitable fish */
  offerBait(name: string) {
    this.offer.innerHTML = "";
    this.offer.append(h("span", { html: `🪱 Keep the <b>${escapeHtml(name)}</b> as bait?` }),
      h("button.tb-btn.small.primary", { onpointerdown: (e: PointerEvent) => { e.stopPropagation(); e.preventDefault(); this.hooks.keepBait(); } }, "Keep (B)"));
    this.offer.classList.add("show");
    this.offerTimer = 7;
  }
  get offering() { return this.offerTimer > 0; }
  closeOffer() { this.offerTimer = 0; this.offer.classList.remove("show"); }

  achievement(a: Achievement, rewardText: string) {
    const el = h("div.ach-item", { html: `<span class="ai-icon">${a.icon}</span><div><div class="ai-label">ACHIEVEMENT UNLOCKED</div><div class="ai-name">${escapeHtml(a.name)}</div>${rewardText ? `<div class="ai-reward">${escapeHtml(rewardText)}</div>` : ""}</div>` });
    this.ach.append(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 500); }, 4200);
  }
  setVisible(v: boolean) { for (const e of [this.strip, this.dock]) e.classList.toggle("hidden", !v); }
}
