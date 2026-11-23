/** Squad picker modal: 4 squads with colour and live member counts. */
import { SQUADS, SQUAD_IDS, MAX_PER_SQUAD, type SquadId, type PlayerS } from "@freek/shared";
import { h, escapeHtml } from "../util";

export class SquadPicker {
  readonly el: HTMLElement;
  private grid: HTMLElement;
  private sig = "";
  onPick: ((s: SquadId) => void) | null = null;

  constructor(root: HTMLElement) {
    this.grid = h("div.squad-grid");
    this.el = h("div.overlay.squad-picker", null, h("div.modal", null,
      h("h2", null, "Choose your squad"),
      h("p.sub", null, "Squads share points and missions. Up to 4 sailors each."),
      this.grid,
      h("button.tb-btn.ghost.close-sq", { onclick: () => this.hide() }, "Close"),
    ));
    root.append(this.el);
  }

  show() { this.sig = ""; this.el.classList.add("show"); }
  hide() { this.el.classList.remove("show"); }
  get visible() { return this.el.classList.contains("show"); }

  update(players: PlayerS[], meId: string) {
    if (!this.visible) return;
    const me = players.find((p) => p.id === meId);
    const sig = players.map((p) => `${p.id}${p.squad}${p.name}`).join() + (me?.squad ?? "");
    if (sig === this.sig) return;
    this.sig = sig;
    this.grid.innerHTML = "";
    for (const id of SQUAD_IDS) {
      const sq = SQUADS[id];
      const members = players.filter((p) => p.squad === id);
      const full = members.length >= MAX_PER_SQUAD && me?.squad !== id;
      const btn = h("button.squad-card", { style: `--sq:${sq.color}`, disabled: full, onpointerdown: () => { this.onPick?.(id); this.hide(); } },
        h("div.sq-flag"),
        h("div.sq-name", null, sq.name),
        h("div.sq-count", null, `${members.length}/${MAX_PER_SQUAD}`),
        h("div.sq-members", { html: members.map((m) => `<span>${escapeHtml(m.name)}</span>`).join("") || "<span class='empty'>empty</span>" }),
      );
      if (me?.squad === id) btn.classList.add("current");
      this.grid.append(btn);
    }
  }
}
