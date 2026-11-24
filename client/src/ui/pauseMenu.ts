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

  constructor(root: HTMLElement) {
    this.main = h("div.pause-main", null,
      h("button.tb-btn.primary.big", { onclick: () => this.onResume?.() }, "▶ Resume"),
      h("button.tb-btn", { onclick: () => this.onChapters?.() }, "Chapter select"),
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
  private showSettings(v: boolean) { this.main.style.display = v ? "none" : ""; this.settingsEl.style.display = v ? "" : "none"; }
  show() { this.showSettings(false); this.el.classList.add("show"); }
  hide() { this.el.classList.remove("show"); }
  get visible() { return this.el.classList.contains("show"); }
}
