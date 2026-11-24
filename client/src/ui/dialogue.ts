/** NPC dialogue box: portrait, typewriter text, click/Space to advance, Skip. */
import { CAMPAIGN_NPC } from "@freek/shared";
import { h } from "../util";
import { sfx } from "../audio";

export const MARLOW_SVG = `<svg viewBox="0 0 100 100" class="portrait-svg">
  <defs><radialGradient id="pbg" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#2f6f9a"/><stop offset="1" stop-color="#0b2240"/></radialGradient></defs>
  <rect width="100" height="100" rx="14" fill="url(#pbg)"/>
  <path d="M14 100 C18 78 34 70 50 70 C66 70 82 78 86 100 Z" fill="#f2c14e"/>
  <path d="M40 70 L50 84 L60 70 Z" fill="#d9433b"/>
  <ellipse cx="50" cy="50" rx="21" ry="23" fill="#f0c4a0"/>
  <path d="M29 52 C30 76 70 76 71 52 C66 64 58 66 50 66 C42 66 34 64 29 52 Z" fill="#f4f1ea"/>
  <path d="M38 60 C44 56 56 56 62 60 C56 62 44 62 38 60 Z" fill="#e6e1d6"/>
  <circle cx="42" cy="46" r="2.6" fill="#1b2a38"/><circle cx="58" cy="46" r="2.6" fill="#1b2a38"/>
  <path d="M36 40 L46 41 M54 41 L64 40" stroke="#f4f1ea" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="50" cy="53" rx="4" ry="3" fill="#e0a882"/>
  <path d="M24 36 C26 20 74 20 76 36 Z" fill="#203a5c"/>
  <rect x="20" y="33" width="60" height="6" rx="3" fill="#152a44"/>
  <path d="M46 26 L50 22 L54 26 L50 30 Z" fill="#ffd24a"/>
  <circle cx="58" cy="46" r="6" fill="none" stroke="#c9a24a" stroke-width="1.5"/>
</svg>`;

export class Dialogue {
  readonly el: HTMLElement;
  private text: HTMLElement;
  private titleEl: HTMLElement;
  private lines: string[] = [];
  private idx = 0;
  private shown = 0;
  private typing = false;
  private timer = 0;
  private onDone: (() => void) | null = null;
  private keyHandler = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.advance(); }
    else if (e.code === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); this.finish(); }
  };
  active = false;

  constructor(root: HTMLElement) {
    this.text = h("div.dlg-text");
    this.titleEl = h("div.dlg-chapter");
    this.el = h("div.dialogue", { onclick: (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".dlg-skip")) this.advance(); } },
      this.titleEl,
      h("div.dlg-box", null,
        h("div.dlg-portrait", { html: MARLOW_SVG }),
        h("div.dlg-body", null,
          h("div.dlg-name", null, `${CAMPAIGN_NPC.name}, ${CAMPAIGN_NPC.title}`),
          this.text,
          h("div.dlg-foot", null, h("span.dlg-next", null, "Click / SPACE ▶"), h("button.dlg-skip", { onclick: () => this.finish() }, "Skip (Esc)")),
        ),
      ),
    );
    root.append(this.el);
    window.addEventListener("keydown", this.keyHandler, true);
  }

  show(lines: string[], onDone: () => void, title = "") {
    this.lines = lines; this.idx = 0; this.onDone = onDone; this.active = true;
    this.titleEl.textContent = title;
    this.titleEl.style.display = title ? "" : "none";
    this.el.classList.add("show");
    this.startLine();
  }

  private startLine() {
    this.shown = 0; this.typing = true;
    clearInterval(this.timer);
    const line = this.lines[this.idx] ?? "";
    this.text.textContent = "";
    this.timer = window.setInterval(() => {
      this.shown += 1;
      this.text.textContent = line.slice(0, this.shown);
      if (this.shown % 3 === 0 && line[this.shown - 1] !== " ") sfx.blip();
      if (this.shown >= line.length) { this.typing = false; clearInterval(this.timer); }
    }, 24);
  }

  advance() {
    if (!this.active) return;
    if (this.typing) {
      clearInterval(this.timer);
      this.typing = false;
      this.text.textContent = this.lines[this.idx] ?? "";
      return;
    }
    this.idx++;
    if (this.idx >= this.lines.length) this.finish();
    else this.startLine();
  }

  finish() {
    if (!this.active) return;
    clearInterval(this.timer);
    this.active = false;
    this.el.classList.remove("show");
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }
}
