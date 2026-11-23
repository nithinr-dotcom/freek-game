/** Chat box: Enter to type, Enter to send, Esc to cancel. */
import { SQUADS, type SquadId } from "@freek/shared";
import { h, escapeHtml } from "../util";

export class Chat {
  readonly el: HTMLElement;
  private log: HTMLElement;
  private input: HTMLInputElement;
  onSend: ((text: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.log = h("div.chat-log");
    this.input = h("input.chat-input", { type: "text", maxlength: 140, placeholder: "Press Enter to chat" }) as HTMLInputElement;
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const t = this.input.value.trim();
        if (t) this.onSend?.(t);
        this.input.value = "";
        this.input.blur();
      } else if (e.key === "Escape") { this.input.value = ""; this.input.blur(); }
    });
    this.input.addEventListener("focus", () => this.el.classList.add("active"));
    this.input.addEventListener("blur", () => this.el.classList.remove("active"));
    this.el = h("div.chat", null, this.log, this.input);
    root.append(this.el);
  }

  focus() { this.input.focus(); }

  add(from: string, text: string, squad?: SquadId | string, system = false) {
    const col = squad && (SQUADS as any)[squad] ? (SQUADS as any)[squad].color : "#9fd8ff";
    const line = h("div.chat-line", { html: system ? `<span class="sys">${escapeHtml(text)}</span>` : `<b style="color:${col}">${escapeHtml(from)}</b> ${escapeHtml(text)}` });
    this.log.append(line);
    while (this.log.children.length > 40) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
    setTimeout(() => line.classList.add("old"), 12000);
  }
}
