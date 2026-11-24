/**
 * Photo mode (solo, key P): freezes the game, hides the HUD, keeps the orbit camera (drag / wheel), adds colour
 * filters and a vignette, and saves a PNG (the filter is baked into the image).
 */
import type * as THREE from "three";
import { h } from "../util";
import { sfx } from "../audio";

const FILTERS: { id: string; label: string; css: string }[] = [
  { id: "none", label: "Natural", css: "none" },
  { id: "vivid", label: "Vivid", css: "saturate(1.45) contrast(1.08)" },
  { id: "golden", label: "Golden hour", css: "sepia(0.35) saturate(1.3) brightness(1.05) hue-rotate(-8deg)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.25) brightness(0.95)" },
  { id: "deep", label: "Deep sea", css: "hue-rotate(18deg) saturate(1.2) brightness(0.9) contrast(1.1)" },
  { id: "retro", label: "Retro", css: "sepia(0.6) contrast(0.95) brightness(1.08) saturate(0.8)" },
];

export class PhotoMode {
  active = false;
  private bar: HTMLElement;
  private vignette: HTMLElement;
  private filter = FILTERS[0];
  private snapNext = false;
  private vig = true;
  constructor(private renderer: THREE.WebGLRenderer, private ui: HTMLElement, private onToggle: (on: boolean) => void) {
    const filters = h("div.photo-filters", null, ...FILTERS.map((f) => h("button.photo-f", { "data-id": f.id, onclick: () => this.setFilter(f.id) }, f.label)));
    this.vignette = h("div.photo-vignette");
    this.bar = h("div.photo-bar", null,
      h("div.photo-title", null, "📸 PHOTO MODE"),
      filters,
      h("label.photo-toggle", null, h("input", { type: "checkbox", checked: true, onchange: (e: Event) => { this.vig = (e.target as HTMLInputElement).checked; this.vignette.style.display = this.vig ? "" : "none"; } }), " Vignette"),
      h("button.tb-btn.primary.small", { onclick: () => { this.snapNext = true; } }, "📷 Snap"),
      h("button.tb-btn.ghost.small", { onclick: () => this.toggle() }, "Exit (Esc)"),
      h("div.photo-hint", null, "Drag to orbit · wheel to zoom · the game is paused"),
    );
    document.body.append(this.vignette, this.bar);
    this.setFilter("none");
  }
  private setFilter(id: string) {
    this.filter = FILTERS.find((f) => f.id === id) ?? FILTERS[0];
    this.bar.querySelectorAll(".photo-f").forEach((b) => b.classList.toggle("sel", (b as HTMLElement).dataset.id === id));
    if (this.active) this.renderer.domElement.style.filter = this.filter.css === "none" ? "" : this.filter.css;
  }
  toggle() {
    this.active = !this.active;
    sfx.click();
    this.ui.style.visibility = this.active ? "hidden" : "";
    this.bar.classList.toggle("show", this.active);
    this.vignette.classList.toggle("show", this.active);
    this.renderer.domElement.style.filter = this.active && this.filter.css !== "none" ? this.filter.css : "";
    this.onToggle(this.active);
  }
  /** call right after renderer.render (the drawing buffer is still valid then) */
  afterRender() {
    if (!this.snapNext) return;
    this.snapNext = false;
    const src = this.renderer.domElement;
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext("2d")!;
    if (this.filter.css !== "none") ctx.filter = this.filter.css;
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
    if (this.vig) {
      const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.font = `600 ${Math.round(c.height / 40)}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "right";
    ctx.fillText("TIDEBREAKERS", c.width - c.height / 40, c.height - c.height / 40);
    const a = document.createElement("a");
    a.download = `tidebreakers-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
    sfx.coin();
    const flash = h("div.photo-flash");
    document.body.append(flash);
    setTimeout(() => flash.remove(), 500);
  }
}
