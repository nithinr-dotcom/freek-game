/** Solo pause menu: resume, chapter select, settings (volume, camera sensitivity), quit to lobby. */
import { h } from "../util";
import type { Settings } from "../solo/save";
import { settingsControls } from "./settings";

export class PauseMenu {
  readonly el: HTMLElement;
  private main: HTMLElement;
  private settingsEl: HTMLElement;
  onResume: (() => void) | null = null;
  onChapters: (() => void) | null = null;
  onQuit: (() => void) | null = null;
  onSettings: ((s: Settings) => void) | null = null;
  onChart: (() => void) | null = null;
  onCodex: (() => void) | null = null;
  onWorkshop: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onAquarium: (() => void) | null = null;
  onPhoto: (() => void) | null = null;
  private campaignEls: HTMLElement[] = [];
  private abandonBtn: HTMLElement;

  constructor(root: HTMLElement) {
    const chart = h("button.tb-btn", { onclick: () => this.onChart?.() }, "🗺 Sea Chart");
    const row = h("div.pause-row", null,
      h("button.tb-btn", { onclick: () => this.onCodex?.() }, "📖 Codex"),
      h("button.tb-btn", { onclick: () => this.onWorkshop?.() }, "🔨 Workshop"),
    );
    const restart = h("button.tb-btn.ghost", { onclick: () => this.onRestart?.() }, "↻ Restart chapter");
    this.campaignEls = [chart, row, restart];
    this.abandonBtn = h("button.tb-btn.ghost", { style: "display:none", onclick: () => this.onAbandon?.() }, "🏳 Abandon run");
    this.main = h("div.pause-main", null,
      h("button.tb-btn.primary.big", { onclick: () => this.onResume?.() }, "▶ Resume"),
      chart,
      row,
      h("div.pause-row", null,
        h("button.tb-btn", { onclick: () => this.onAquarium?.() }, "🐠 Aquarium"),
        h("button.tb-btn", { onclick: () => this.onPhoto?.() }, "📸 Photo (P)"),
      ),
      restart,
      this.abandonBtn,
      h("button.tb-btn", { onclick: () => this.showSettings(true) }, "Settings"),
      h("button.tb-btn.ghost", { onclick: () => this.onQuit?.() }, "Quit to lobby"),
    );
    this.settingsEl = h("div.pause-settings", null,
      settingsControls((ns) => this.onSettings?.(ns)),
      h("button.tb-btn", { onclick: () => this.showSettings(false) }, "Back"),
    );
    this.el = h("div.overlay.pause-menu", null, h("div.modal.small", null, h("h2", null, "Paused"), h("p.sub", null, "Progress is saved automatically."), this.main, this.settingsEl));
    root.append(this.el);
    this.showSettings(false);
  }
  private onAbandon: (() => void) | null = null;
  /** Endless Tide: no chart/codex/workshop/restart; an abandon button instead */
  configureEndless(onAbandon: () => void) {
    this.onAbandon = onAbandon;
    for (const e of this.campaignEls) e.style.display = "none";
    this.abandonBtn.style.display = "";
    this.el.querySelector(".sub")!.textContent = "The run is saved between tides.";
  }
  private showSettings(v: boolean) { this.main.style.display = v ? "none" : ""; this.settingsEl.style.display = v ? "" : "none"; }
  show() { this.showSettings(false); this.el.classList.add("show"); }
  hide() { this.el.classList.remove("show"); }
  get visible() { return this.el.classList.contains("show"); }
}
