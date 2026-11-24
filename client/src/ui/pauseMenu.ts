/** Solo pause menu: resume, chapter select, settings (volume, camera sensitivity), quit to lobby. */
import { h } from "../util";
import { loadSettings, saveSettings, type Settings } from "../solo/save";

export class PauseMenu {
  readonly el: HTMLElement;
  private main: HTMLElement;
  private settingsEl: HTMLElement;
  onResume: (() => void) | null = null;
  onChapters: (() => void) | null = null;
  onQuit: (() => void) | null = null;
  onSettings: ((s: Settings) => void) | null = null;

  constructor(root: HTMLElement) {
    const s = loadSettings();
    const vol = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: s.volume }) as HTMLInputElement;
    const sens = h("input", { type: "range", min: 0.3, max: 2.5, step: 0.1, value: s.camSensitivity }) as HTMLInputElement;
    vol.value = String(s.volume); sens.value = String(s.camSensitivity);
    const apply = () => { const ns = { volume: Number(vol.value), camSensitivity: Number(sens.value) }; saveSettings(ns); this.onSettings?.(ns); };
    vol.addEventListener("input", apply);
    sens.addEventListener("input", apply);
    this.main = h("div.pause-main", null,
      h("button.tb-btn.primary.big", { onclick: () => this.onResume?.() }, "▶ Resume"),
      h("button.tb-btn", { onclick: () => this.onChapters?.() }, "Chapter select"),
      h("button.tb-btn", { onclick: () => this.showSettings(true) }, "Settings"),
      h("button.tb-btn.ghost", { onclick: () => this.onQuit?.() }, "Quit to lobby"),
    );
    this.settingsEl = h("div.pause-settings", null,
      h("label.setting", null, h("span", null, "Volume"), vol),
      h("label.setting", null, h("span", null, "Camera sensitivity"), sens),
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
