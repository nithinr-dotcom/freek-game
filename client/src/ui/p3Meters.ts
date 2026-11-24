/** P3 HUD: small meter chips (warmth, lantern fuel) inside the solo clock strip, plus full-screen frost / darkness vignettes. */
import { h } from "../util";

export class MeterChip {
  readonly el: HTMLElement;
  private fill: HTMLElement; private txt: HTMLElement;
  private last = "";
  constructor(ui: HTMLElement, icon: string, cls: string, title: string) {
    this.fill = h("i"); this.txt = h("span.mc-txt");
    this.el = h(`span.p3-meter.${cls}`, { title }, h("span.mc-icon", null, icon), h("span.mc-track", null, this.fill), this.txt);
    const strip = ui.querySelector(".solo-strip");
    if (strip) { strip.append(this.el); strip.classList.add("has-meters"); } else ui.append(this.el);
  }
  set(v: number, warnAt = 0.3) {
    const k = Math.max(0, Math.min(1, v));
    this.fill.style.width = `${(k * 100).toFixed(1)}%`;
    const t = `${Math.round(k * 100)}%`;
    if (t !== this.last) { this.last = t; this.txt.textContent = t; }
    this.el.classList.toggle("warn", k < warnAt);
    this.el.classList.toggle("empty", k <= 0);
  }
  pulse() { this.el.classList.remove("pulse"); void this.el.offsetWidth; this.el.classList.add("pulse"); }
  dispose() { this.el.remove(); }
}

/** full-screen vignette (frost or darkness); strength 0..1 */
export class Vignette {
  readonly el: HTMLElement;
  private v = -1;
  constructor(ui: HTMLElement, cls: string) { this.el = h(`div.p3-vignette.${cls}`); ui.prepend(this.el); }
  set(strength: number) {
    const s = Math.round(Math.max(0, Math.min(1, strength)) * 100) / 100;
    if (s === this.v) return;
    this.v = s;
    this.el.style.opacity = String(s);
  }
  dispose() { this.el.remove(); }
}
