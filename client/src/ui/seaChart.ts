/** Sea Chart: the five regions (locked ones greyed out), each region's chapters with stars/grades, travel + free roam. */
import { regionList, chaptersOfRegion, getRegion, MATERIALS, GRADE_COLOR, BOSS_NAMES, getBoss, type RegionId, type RegionDef } from "@freek/shared";
import type { SoloSave } from "../solo/save";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";

export interface ChartOpts {
  save: SoloSave;
  /** region the boat is in (in game) */
  current?: RegionId;
  onPlay(chapterId: number): void;
  onFreeRoam(region: RegionId): void;
  onClose?(): void;
}

const fmtTime = (s?: number) => (s === undefined || !isFinite(s) ? "-" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
const REGION_ICON: Record<string, string> = { shallows_bay: "🏝", coral_maze: "🪸", stormbreak: "⛈", frozen_fjord: "🧊", abyss_trench: "🌑" };

export function regionStars(save: SoloSave, r: RegionId) {
  const ch = chaptersOfRegion(r);
  return { got: ch.reduce((a, c) => a + (save.campaign.chapters[c.id]?.stars ?? 0), 0), max: ch.length * 3, done: ch.filter((c) => save.campaign.chapters[c.id]?.done).length, total: ch.length };
}

export function openSeaChart(root: HTMLElement, o: ChartOpts): HTMLElement {
  const save = o.save;
  const regions = regionList();
  let sel: RegionId = o.current ?? save.campaign.region;
  const unlocked = (r: RegionDef) => save.campaign.unlockedRegions.includes(r.id);
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); window.removeEventListener("keydown", onKey, true); o.onClose?.(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };

  const map = h("div.chart-map");
  const detail = h("div.chart-detail");
  // dashed sea routes between consecutive regions
  const pts = regions.map((r) => r.chart);
  map.innerHTML = `<svg class="chart-routes" viewBox="0 0 100 100" preserveAspectRatio="none">${pts.slice(1).map((p, i) => `<path d="M${pts[i].x * 100} ${pts[i].y * 100} Q ${(pts[i].x + p.x) * 50} ${Math.min(pts[i].y, p.y) * 100 - 8} ${p.x * 100} ${p.y * 100}" class="${unlocked(regions[i + 1]) ? "open" : ""}"/>`).join("")}</svg><div class="chart-compass">N</div>`;

  const nodes = regions.map((r) => {
    const st = regionStars(save, r.id);
    const node = h(`button.chart-node${unlocked(r) ? "" : ".locked"}${r.id === o.current ? ".here" : ""}`, {
      style: `left:${r.chart.x * 100}%;top:${r.chart.y * 100}%`,
      onclick: () => { sel = r.id; sfx.click(); render(); },
    }, h("span.cn-icon", null, unlocked(r) ? REGION_ICON[r.id] ?? "🌊" : "🔒"), h("span.cn-name", null, `${r.act}. ${r.name}`), h("span.cn-stars", null, unlocked(r) && st.max ? `★ ${st.got}/${st.max}` : unlocked(r) ? "charted" : "locked"));
    map.append(node);
    return { r, node };
  });

  const render = () => {
    nodes.forEach(({ r, node }) => node.classList.toggle("sel", r.id === sel));
    const r = getRegion(sel)!;
    const open = unlocked(r);
    const chapters = chaptersOfRegion(r.id);
    const st = regionStars(save, r.id);
    const mat = MATERIALS[r.material];
    const prev = regions.find((x) => x.act === r.act - 1);
    detail.innerHTML = "";
    detail.append(h("div.cd-head", { html: `
      <div class="cd-kicker">ACT ${r.act}${r.id === o.current ? " · YOU ARE HERE" : ""}</div>
      <div class="cd-name">${escapeHtml(r.name)}</div>
      <div class="cd-sub">${escapeHtml(r.subtitle)}</div>
      <div class="cd-tags"><span style="--mc:${mat.color}">${mat.icon} ${escapeHtml(mat.name)}</span><span>☠ ${escapeHtml(getBoss(r.bossId)?.name ?? BOSS_NAMES[r.bossId] ?? "???")}</span>${st.max ? `<span>★ ${st.got}/${st.max}</span>` : ""}</div>` }));
    if (!open) {
      detail.append(h("div.cd-locked", null, `🔒 Defeat the ${prev ? getBoss(prev.bossId)?.name ?? BOSS_NAMES[prev.bossId] : "previous boss"} to chart these waters.`));
      return;
    }
    if (!chapters.length) {
      detail.append(h("div.cd-locked.soon", null, "⚓ Charted! The chapters of this sea arrive in a later update."));
      return;
    }
    const list = h("div.cd-chapters");
    chapters.forEach((c, i) => {
      const rec = save.campaign.chapters[c.id];
      const prevDone = i === 0 || !!save.campaign.chapters[chapters[i - 1].id]?.done;
      const locked = !rec?.done && !prevDone;
      const isNext = !rec?.done && prevDone;
      const g = rec?.grade;
      list.append(h(`button.cd-ch${rec?.done ? ".done" : ""}${isNext ? ".next" : ""}${locked ? ".locked" : ""}${c.boss ? ".boss" : ""}`, {
        disabled: locked,
        onclick: () => { close(); o.onPlay(c.id); },
      }, h("div", { html: `
        <span class="cdc-num">${c.boss ? "☠" : c.index}</span>
        <span class="cdc-title">${escapeHtml(c.title.replace(/^BOSS:\s*/, "BOSS · "))}</span>
        <span class="cdc-stars">${[1, 2, 3].map((k) => `<i class="${k <= (rec?.stars ?? 0) ? "on" : ""}">★</i>`).join("")}</span>
        <span class="cdc-grade" style="--gc:${g ? GRADE_COLOR[g] : "transparent"}">${g ?? ""}</span>
        <span class="cdc-status">${locked ? "🔒" : rec?.done ? `best ${fmtTime(rec.bestTime)}` : "▶ Play"}</span>` })));
    });
    detail.append(list);
    detail.append(h("div.cd-actions", null,
      h("button.tb-btn.ghost", { onclick: () => { close(); o.onFreeRoam(r.id); } }, r.id === o.current ? "⛵ Free roam here" : `⛵ Sail to ${r.name}`),
    ));
  };

  const el = h("div.overlay.sea-chart", { onclick: (e: MouseEvent) => { if (e.target === el) close(); } }, h("div.modal.wide.chart-modal", null,
    h("div.chart-top", null, h("h2", null, "🗺 Sea Chart"), h("button.icon-btn", { onclick: close, title: "Close" }, "✕")),
    h("div.chart-body", null, map, detail),
  ));
  render();
  root.append(el);
  window.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => el.classList.add("show"));
  sfx.click();
  return el;
}
