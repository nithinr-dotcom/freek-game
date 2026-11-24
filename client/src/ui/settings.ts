/** Settings controls (volume, camera sensitivity, graphics), used by the pause menu and the settings modal. */
import { h } from "../util";
import { loadSettings, saveSettings, type Settings, type GraphicsSetting } from "../solo/save";
import { autoIsLow } from "../game/device";

export function settingsControls(onChange: (s: Settings) => void): HTMLElement {
  const s = loadSettings();
  const vol = h("input", { type: "range", min: 0, max: 1, step: 0.05 }) as HTMLInputElement;
  const sens = h("input", { type: "range", min: 0.3, max: 2.5, step: 0.1 }) as HTMLInputElement;
  vol.value = String(s.volume); sens.value = String(s.camSensitivity);
  let gfx: GraphicsSetting = s.graphics;
  const apply = () => { const ns: Settings = { volume: Number(vol.value), camSensitivity: Number(sens.value), graphics: gfx }; saveSettings(ns); onChange(ns); };
  vol.addEventListener("input", apply);
  sens.addEventListener("input", apply);
  const seg = h("div.seg");
  const note = h("small.setting-note", null, "");
  const renderSeg = () => {
    seg.innerHTML = "";
    for (const g of ["auto", "low", "high"] as GraphicsSetting[]) {
      seg.append(h(`button.seg-btn${g === gfx ? ".on" : ""}`, { onclick: () => { gfx = g; renderSeg(); apply(); note.textContent = "Resolution and shadows change now; ocean detail and particles on next load."; } },
        g === "auto" ? `Auto (${autoIsLow() ? "Low" : "High"})` : g === "low" ? "Low" : "High"));
    }
  };
  renderSeg();
  return h("div.settings-controls", null,
    h("label.setting", null, h("span", null, "Volume"), vol),
    h("label.setting", null, h("span", null, "Camera sensitivity"), sens),
    h("div.setting", null, h("span", null, "Graphics"), seg, note),
  );
}

export function openSettingsModal(root: HTMLElement, onChange: (s: Settings) => void) {
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); };
  const el = h("div.overlay.settings-modal", { onclick: (e: MouseEvent) => { if (e.target === el) close(); } },
    h("div.modal.small", null, h("h2", null, "Settings"), settingsControls(onChange), h("button.tb-btn.primary", { onclick: close, style: "margin-top:14px" }, "Done")));
  root.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
}
