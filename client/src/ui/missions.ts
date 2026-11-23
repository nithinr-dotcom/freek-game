/** Mission tracker: 3 personal missions + the squad mission, with progress bars. */
import type { MissionS } from "@freek/shared";
import { h, escapeHtml } from "../util";

export class MissionTracker {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private sig = "";
  private prevProgress = new Map<string, number>();
  private collapsed = false;

  constructor(root: HTMLElement) {
    this.list = h("div.mt-list");
    const head = h("div.mt-head", { onclick: () => { this.collapsed = !this.collapsed; this.el.classList.toggle("collapsed", this.collapsed); } }, h("span", null, "MISSIONS"), h("span.mt-toggle", null, "▾"));
    this.el = h("div.panel.missions", null, head, this.list);
    root.append(this.el);
  }

  update(personal: MissionS[], squad: MissionS[], squadColor: string) {
    const all = [...personal.map((m) => ({ m, sq: false })), ...squad.map((m) => ({ m, sq: true }))];
    const sig = all.map(({ m }) => `${m.id}:${m.progress}/${m.target}`).join("|") + squadColor;
    if (sig === this.sig) return;
    this.sig = sig;
    this.list.innerHTML = "";
    for (const { m, sq } of all) {
      const k = Math.min(1, m.progress / Math.max(1, m.target));
      const key = `${sq ? "s" : "p"}:${m.id}`;
      const prev = this.prevProgress.get(key);
      const bumped = prev !== undefined && m.progress > prev;
      this.prevProgress.set(key, m.progress);
      const row = h("div.mt-row", { style: sq ? `--sq:${squadColor}` : "" },
        h("div.mt-title", { html: `${sq ? '<span class="mt-sq">SQUAD</span>' : ""}${escapeHtml(m.title.replace(/^SQUAD:\s*/, ""))}` }),
        h("div.mt-bar", null, h("div.mt-fill", { style: `width:${(k * 100).toFixed(1)}%` }), h("div.mt-num", null, `${Math.min(m.progress, m.target)}/${m.target}`)),
      );
      if (sq) row.classList.add("squad");
      if (bumped) row.classList.add("bump");
      this.list.append(row);
    }
  }

  /** burst effect on all bars (mission complete) */
  burst() {
    this.el.classList.remove("burst");
    void this.el.offsetWidth;
    this.el.classList.add("burst");
  }
}
