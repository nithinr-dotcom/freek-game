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

  update(personal: MissionS[], squad: MissionS[], squadColor: string, campaign?: { label: string; items: (MissionS & { optional?: boolean; state?: string; numText?: string })[] }) {
    const all = [...(campaign?.items ?? []).map((m) => ({ m, sq: false, cmp: true })), ...personal.map((m) => ({ m, sq: false, cmp: false })), ...squad.map((m) => ({ m, sq: true, cmp: false }))];
    const sig = all.map(({ m }) => `${m.id}:${m.progress}/${m.target}:${(m as any).state ?? ""}:${(m as any).numText ?? ""}`).join("|") + squadColor + (campaign?.label ?? "");
    if (sig === this.sig) return;
    this.sig = sig;
    this.list.innerHTML = "";
    if (campaign) this.list.append(h("div.mt-campaign-head", null, campaign.label));
    let first = true;
    for (const { m, sq, cmp } of all) {
      if (campaign && !cmp && first) { first = false; this.list.append(h("div.mt-sep", null, "DAILY MISSIONS")); }
      const k = Math.min(1, m.progress / Math.max(1, m.target));
      const key = `${sq ? "s" : "p"}:${m.id}`;
      const prev = this.prevProgress.get(key);
      const bumped = prev !== undefined && m.progress > prev;
      this.prevProgress.set(key, m.progress);
      const ext = m as MissionS & { optional?: boolean; state?: string; numText?: string };
      const tag = cmp ? (ext.optional === undefined ? '<span class="mt-cmp">CAMPAIGN</span>' : ext.optional ? '<span class="mt-cmp opt">★ BONUS</span>' : '<span class="mt-cmp">MAIN</span>') : "";
      const row = h("div.mt-row", { style: sq ? `--sq:${squadColor}` : "" },
        h("div.mt-title", { html: `${tag}${sq ? '<span class="mt-sq">SQUAD</span>' : ""}${escapeHtml(m.title.replace(/^SQUAD:\s*/, ""))}` }),
        h("div.mt-bar", null, h("div.mt-fill", { style: `width:${(k * 100).toFixed(1)}%` }), h("div.mt-num", null, ext.numText ?? `${Math.min(m.progress, m.target)}/${m.target}`)),
      );
      if (ext.state === "broken") row.classList.add("broken");
      if (sq) row.classList.add("squad");
      if (cmp) { row.classList.add("campaign"); if (m.progress >= m.target) row.classList.add("done"); }
      if (bumped) row.classList.add("bump");
      this.list.append(row);
    }
  }

  setCollapsed(c: boolean) { this.collapsed = c; this.el.classList.toggle("collapsed", c); }

  /** burst effect on all bars (mission complete) */
  burst() {
    this.el.classList.remove("burst");
    void this.el.offsetWidth;
    this.el.classList.add("burst");
  }
}
