/** Leaderboard panel (Tab): squad leaderboard, trophy wall, hall of fame. */
import { SQUADS, SQUAD_IDS, SPECIES_BY_ID, TIER_INFO, type PlayerS, type SquadS, type FishCardS, type SquadId } from "@freek/shared";
import { h, escapeHtml, fmtKg, arr } from "../util";
import { fishSvg } from "./hud";

type Tab = "squads" | "trophies" | "hof";

export function fishChip(c: FishCardS | undefined): string {
  if (!c) return `<span class="fish-chip none">no catch yet</span>`;
  const sp = SPECIES_BY_ID[c.speciesId];
  return `<span class="fish-chip tier-${c.tier}" style="--tier:${TIER_INFO[c.tier].color}">${escapeHtml(sp?.name ?? c.speciesId)} · ${fmtKg(c.weightKg)}</span>`;
}

export class Leaderboard {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private tabs: Record<Tab, HTMLElement>;
  private tab: Tab = "squads";
  private expanded = new Set<SquadId>();
  private trophyPlayer = "";
  private sig = "";
  private hof: FishCardS[] = [];
  private acc = 0;
  pinned = false;
  private autoExpanded = false;

  constructor(root: HTMLElement) {
    const mk = (t: Tab, label: string) => h("button.lb-tab", { onclick: () => this.setTab(t) }, label);
    this.tabs = { squads: mk("squads", "Squad Leaderboard"), trophies: mk("trophies", "Trophy Wall"), hof: mk("hof", "Hall of Fame") };
    this.body = h("div.lb-body");
    this.el = h("div.leaderboard", null, h("div.lb-panel", null,
      h("div.lb-tabs", null, this.tabs.squads, this.tabs.trophies, this.tabs.hof, h("button.icon-btn.lb-close", { onclick: () => this.hide(), title: "Close" }, "✕")),
      this.body,
      h("div.lb-foot", null, "Hold TAB to peek · tap TAB to pin"),
    ));
    this.body.addEventListener("click", (e) => this.onClick(e));
    root.append(this.el);
    this.setTab("squads");
  }

  setHallOfFame(entries: FishCardS[]) { this.hof = entries ?? []; this.sig = ""; }
  get visible() { return this.el.classList.contains("show"); }
  show() { this.el.classList.add("show"); this.sig = ""; }
  hide() { this.el.classList.remove("show"); this.pinned = false; }
  setTab(t: Tab) {
    this.tab = t;
    for (const [k, el] of Object.entries(this.tabs)) el.classList.toggle("active", k === t);
    this.sig = "";
  }
  showTrophiesOf(playerId: string) { this.trophyPlayer = playerId; this.setTab("trophies"); this.show(); }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const sq = t.closest("[data-squad]") as HTMLElement | null;
    const pl = t.closest("[data-player]") as HTMLElement | null;
    if (pl) { this.trophyPlayer = pl.dataset.player!; this.setTab("trophies"); return; }
    if (sq) {
      const id = sq.dataset.squad as SquadId;
      if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
      this.sig = "";
    }
  }

  update(dt: number, players: PlayerS[], squads: SquadS[], meId: string) {
    if (!this.visible) return;
    this.acc += dt;
    if (this.acc < 0.25 && this.sig) return;
    this.acc = 0;
    let html = "";
    if (this.tab === "squads") html = this.renderSquads(players, squads, meId);
    else if (this.tab === "trophies") html = this.renderTrophies(players, meId);
    else html = this.renderHof();
    if (html !== this.sig) { this.sig = html; this.body.innerHTML = html; }
  }

  private renderSquads(players: PlayerS[], squads: SquadS[], meId: string): string {
    const me = players.find((p) => p.id === meId);
    if (me && !this.autoExpanded) { this.autoExpanded = true; this.expanded.add(me.squad); }
    const rows = SQUAD_IDS.map((id) => {
      const s = squads.find((x) => x.id === id);
      const members = players.filter((p) => p.squad === id);
      const unbanked = members.reduce((a, p) => a + (p.unbankedPoints || 0), 0);
      return { id, points: s?.points ?? 0, kills: s?.kills ?? 0, members, unbanked };
    }).sort((a, b) => b.points - a.points);
    const max = Math.max(1, ...rows.map((r) => r.points));
    return `<div class="lb-squads">${rows.map((r, i) => {
      const sq = SQUADS[r.id];
      const open = this.expanded.has(r.id);
      const mine = me?.squad === r.id;
      const members = r.members.slice().sort((a, b) => b.bankedPoints - a.bankedPoints).map((p) => {
        const best = arr(p.trophies)[0];
        return `<div class="lb-member ${p.id === meId ? "me" : ""}" data-player="${escapeHtml(p.id)}" title="Show trophies">
          <span class="lvl">${p.level}</span><span class="nm">${escapeHtml(p.name)}</span>
          <span class="pts">${p.bankedPoints} <small>banked</small></span>${fishChip(best)}</div>`;
      }).join("") || `<div class="lb-member empty">No sailors yet</div>`;
      return `<div class="lb-squad ${open ? "open" : ""} ${mine ? "mine" : ""}" style="--sq:${sq.color}">
        <div class="lb-squad-row" data-squad="${r.id}">
          <span class="rank">#${i + 1}</span><span class="sq-dot"></span><span class="sq-nm">${sq.name}</span>
          <span class="sq-meta">${r.members.length} sailors · ☠ ${r.kills}${r.unbanked ? ` · <i>${r.unbanked} at sea</i>` : ""}</span>
          <span class="sq-pts">${r.points}</span><span class="chev">${open ? "▴" : "▾"}</span>
          <span class="sq-bar" style="width:${(r.points / max) * 100}%"></span>
        </div>
        ${open ? `<div class="lb-members">${members}</div>` : ""}
      </div>`;
    }).join("")}</div>`;
  }

  private renderTrophies(players: PlayerS[], meId: string): string {
    const id = this.trophyPlayer && players.some((p) => p.id === this.trophyPlayer) ? this.trophyPlayer : meId;
    const p = players.find((x) => x.id === id);
    const picker = players.map((x) => `<button class="tp-chip ${x.id === id ? "active" : ""}" data-player="${escapeHtml(x.id)}" style="--sq:${SQUADS[x.squad]?.color ?? "#fff"}">${escapeHtml(x.name)}</button>`).join("");
    const cards = p ? arr(p.trophies) : [];
    return `<div class="tp-picker">${picker}</div>
      <div class="trophy-title">${p ? `${escapeHtml(p.name)}'s trophies` : "Trophies"}</div>
      <div class="trophy-wall">${cards.length ? cards.map((c) => trophyCard(c)).join("") : `<div class="room-empty">No trophies yet — go catch something!</div>`}</div>`;
  }

  private renderHof(): string {
    if (!this.hof.length) return `<div class="room-empty">The Hall of Fame awaits its first legend.</div>`;
    return `<div class="hof">${this.hof.map((c, i) => {
      const sp = SPECIES_BY_ID[c.speciesId];
      return `<div class="hof-row tier-${c.tier}" style="--tier:${TIER_INFO[c.tier].color}">
        <span class="rank">${i + 1}</span><span class="hof-fish">${fishSvg(sp?.tint ?? "#ccc")}</span>
        <span class="hof-name">${escapeHtml(sp?.name ?? c.speciesId)}<small>${TIER_INFO[c.tier].label}</small></span>
        <span class="hof-by">${escapeHtml(c.catcher)}</span><span class="hof-kg">${fmtKg(c.weightKg)}</span><span class="hof-pts">${c.points} pts</span></div>`;
    }).join("")}</div>`;
  }
}

export function trophyCard(c: FishCardS): string {
  const sp = SPECIES_BY_ID[c.speciesId];
  const ti = TIER_INFO[c.tier];
  return `<div class="trophy tier-${c.tier}" style="--tier:${ti.color}">
    <div class="tr-tier">${ti.label}</div>
    <div class="tr-fish">${fishSvg(sp?.tint ?? "#ccc")}</div>
    <div class="tr-name">${escapeHtml(sp?.name ?? c.speciesId)}</div>
    <div class="tr-stats">${fmtKg(c.weightKg)} · ${c.points} pts</div>
  </div>`;
}
