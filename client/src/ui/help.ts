/** Controls overlay (H). */
import { h } from "../util";

export class Help {
  readonly el: HTMLElement;
  constructor(root: HTMLElement, dev: boolean) {
    const row = (k: string, d: string) => `<div class="hk"><span class="keys">${k}</span><span>${d}</span></div>`;
    this.el = h("div.overlay.help", { onclick: (e: MouseEvent) => { if (e.target === this.el) this.hide(); } }, h("div.modal", { html: `
      <h2>How to play</h2>
      <div class="help-grid">
        <div>
          <h4>Sailing</h4>
          ${row("W A S D / ↑←↓→", "Throttle & steer")}
          ${row("Drag mouse / middle-drag", "Orbit camera")}
          ${row("Mouse wheel", "Zoom")}
          <h4>Fishing</h4>
          ${row("Hold Space / Left-click", "Charge cast, release to throw")}
          ${row("Space / Click on bite", "Set the HOOK!")}
          ${row("Hold Space / Mouse", "Raise the catch zone while reeling")}
          ${row("Esc", "Cancel fishing")}
        </div>
        <div>
          <h4>Combat</h4>
          ${row("Right-click / F", "Fire harpoon at the cursor")}
          <h4>Crew</h4>
          ${row("Tab", "Leaderboards (hold, tap to pin)")}
          ${row("Enter", "Chat")}
          ${row("Q", "Change squad")}
          ${row("M", "Mute sound")}
          ${row("H", "This help")}
          ${dev ? `<h4>Dev (?dev=1)</h4>${row("K", "Toggle storm")}${row("N", "Spawn monster")}${row("G", "Wind gust")}${row("J", "Complete chapter")}` : ""}
        </div>
      </div>
      <p class="help-tip">Bank your catch by sailing into the <b>golden ring</b> at the dock. Sink and you lose everything unbanked!</p>
      <button class="tb-btn primary close-help">Got it</button>` }));
    root.append(this.el);
    this.el.querySelector(".close-help")!.addEventListener("click", () => this.hide());
  }
  toggle() { this.el.classList.toggle("show"); }
  hide() { this.el.classList.remove("show"); }
  get visible() { return this.el.classList.contains("show"); }
}
