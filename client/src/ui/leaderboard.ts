/** Leaderboard panel (Tab): squad leaderboard, trophy wall, hall of fame. */
import { SQUADS, SQUAD_IDS, TIER_INFO, MATERIALS, allChapters, getRegion, type PlayerS, type SquadS, type FishCardS, type SquadId, type MaterialId } from "@freek/shared";
import { speciesInfo } from "../solo/species";
import { h, escapeHtml, fmtKg, arr } from "../util";
import { fishSvg } from "./hud";
import type { SoloSave } from "../solo/save";

type Tab = "squads" | "trophies" | "hof" | "campaign";

export function fishChip(c: FishCardS | undefined): string {
  if (!c) return `<span class="fish-chip none">no catch yet</span>`;
  const sp = speciesInfo(c.speciesId);
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
    this.tabs = { squads: mk("squads", "Squad Leaderboard"), trophies: mk("trophies", "Trophy Wall"), hof: mk("hof", "Hall of Fame"), campaign: mk("campaign", "Campaign") };
    this.tabs.campaign.style.display = "none";
    this.body = h("div.lb-body");
    this.el = h("div.leaderboard", null, h("div.lb-panel", null,
      h("div.lb-tabs", null, this.tabs.squads, this.tabs.trophies, this.tabs.hof, this.tabs.campaign, h("button.icon-btn.lb-close", { onclick: () => this.hide(), title: "Close" }, "✕")),
      this.body,
      h("div.lb-foot", null, "Hold TAB to peek · tap TAB to pin"),
    ));
    this.body.addEventListener("click", (e) => this.onClick(e));
    root.append(this.el);
    this.setTab("squads");
  }

  private solo = false;
  /** solo: Trophy Wall + Solo Hall of Fame + Campaign progress (no squads) */
  setSolo(solo: boolean) {
    this.solo = solo;
    this.tabs.squads.style.display = solo ? "none" : "";
    this.tabs.campaign.style.display = solo ? "" : "none";
    this.tabs.hof.textContent = solo ? "Solo Hall of Fame" : "Hall of Fame";
    if (solo) this.setTab("trophies");
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

  update(dt: number, players: PlayerS[], squads: SquadS[], meId: string, solo?: { save: SoloSave; chapterLabel: string }) {
    if (!this.visible) return;
    this.acc += dt;
    if (this.acc < 0.25 && this.sig) return;
    this.acc = 0;
    let html = "";
    if (this.tab === "squads") html = this.renderSquads(players, squads, meId);
    else if (this.tab === "trophies") html = this.renderTrophies(players, meId);
    else if (this.tab === "campaign") html = solo ? this.renderCampaign(solo.save, solo.chapterLabel, players.find((p) => p.id === meId)) : "";
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
    const picker = this.solo ? "" : players.map((x) => `<button class="tp-chip ${x.id === id ? "active" : ""}" data-player="${escapeHtml(x.id)}" style="--sq:${SQUADS[x.squad]?.color ?? "#fff"}">${escapeHtml(x.name)}</button>`).join("");
    const cards = p ? arr(p.trophies) : [];
    return `<div class="tp-picker">${picker}</div>
      <div class="trophy-title">${p ? `${escapeHtml(p.name)}'s trophies` : "Trophies"}</div>
      <div class="trophy-wall">${cards.length ? cards.map((c) => trophyCard(c)).join("") : `<div class="room-empty">No trophies yet — go catch something!</div>`}</div>`;
  }

  private renderCampaign(save: SoloSave, label: string, me?: PlayerS): string {
    const chapters = allChapters();
    const total = chapters.reduce((a, c) => a + (save.campaign.chapters[c.id]?.stars ?? 0), 0);
    const fmt = (s?: number) => (s === undefined || !isFinite(s) ? "-" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
    const next = chapters.find((c) => !save.campaign.chapters[c.id]?.done);
    const rows = chapters.map((c) => {
      const rec = save.campaign.chapters[c.id];
      const st = rec?.stars ?? 0;
      const status = rec?.done ? "done" : c === next ? "current" : "locked";
      return `<div class="cp-row ${status}"><span class="rank">${c.act}-${c.index}</span><span class="cp-title">${escapeHtml(c.title)}<small>${escapeHtml(getRegion(c.region)?.name ?? "")}${rec?.grade ? ` · grade ${rec.grade}` : ""}</small></span>
        <span class="stars">${[1, 2, 3].map((i) => `<i class="${i <= st ? "on" : ""}">★</i>`).join("")}</span>
        <span class="cp-time">${status === "done" ? fmt(rec?.bestTime) : status === "current" ? "next" : "🔒"}</span></div>`;
    }).join("");
    return `<div class="cp-head"><div><b>${escapeHtml(label)}</b><br/><small>${total} / ${chapters.length * 3} stars</small></div>
      <div class="cp-stats"><span>Lv ${me?.level ?? save.level}</span><span>${me?.catches ?? save.catches} fish</span><span>${me?.bankedPoints ?? save.bankedPoints} banked</span><span>● ${me?.coins ?? save.coins}</span></div></div>
      <div class="cp-list">${rows}</div>
      <div class="cp-unlocks">${Object.entries(save.materials).filter(([, n]) => (n ?? 0) > 0).map(([id, n]) => `<span class="on">${MATERIALS[id as MaterialId].icon} ${n} ${escapeHtml(MATERIALS[id as MaterialId].name)}</span>`).join("") || "<span>No materials yet</span>"}</div>`;
  }

  private renderHof(): string {
    if (!this.hof.length) return `<div class="room-empty">The Hall of Fame awaits its first legend.</div>`;
    return `<div class="hof">${this.hof.map((c, i) => {
      const sp = speciesInfo(c.speciesId);
      return `<div class="hof-row tier-${c.tier}" style="--tier:${TIER_INFO[c.tier].color}">
        <span class="rank">${i + 1}</span><span class="hof-fish">${fishSvg(sp?.tint ?? "#ccc")}</span>
        <span class="hof-name">${escapeHtml(sp?.name ?? c.speciesId)}<small>${TIER_INFO[c.tier].label}</small></span>
        <span class="hof-by">${escapeHtml(c.catcher)}</span><span class="hof-kg">${fmtKg(c.weightKg)}</span><span class="hof-pts">${c.points} pts</span></div>`;
    }).join("")}</div>`;
  }
}

export function trophyCard(c: FishCardS): string {
  const sp = speciesInfo(c.speciesId);
  const ti = TIER_INFO[c.tier];
  return `<div class="trophy tier-${c.tier}" style="--tier:${ti.color}">
    <div class="tr-tier">${ti.label}</div>
    <div class="tr-fish">${fishSvg(sp?.tint ?? "#ccc")}</div>
    <div class="tr-name">${escapeHtml(sp?.name ?? c.speciesId)}</div>
    <div class="tr-stats">${fmtKg(c.weightKg)} · ${c.points} pts</div>
  </div>`;
}
