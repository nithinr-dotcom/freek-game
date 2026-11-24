/** Sea Chart: the five regions (locked ones greyed out), each region's chapters with stars/grades, travel + free roam. */
import { regionList, chaptersOfRegion, getRegion, MATERIALS, GRADE_COLOR, BOSS_NAMES, getBoss, MODE_INFO, CAMPAIGN_MODES, type RegionId, type RegionDef, type CampaignMode } from "@freek/shared";
import type { SoloSave, ChapterRecord } from "../solo/save";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";

export interface ChartOpts {
  save: SoloSave;
  /** region the boat is in (in game) */
  current?: RegionId;
  onPlay(chapterId: number): void;
  onFreeRoam(region: RegionId): void;
  onClose?(): void;
  /** P4: replay Marlow's farewell + the credits (shown once the ending has been seen) */
  onReplayEnding?(): void;
}

/** P4: a chapter's record on a mode */
function modeRec(save: SoloSave, id: number, m: CampaignMode): ChapterRecord | undefined {
  return m === "normal" ? save.campaign.chapters[id] : save.campaign.modeRecords?.[m]?.[id];
}
const modeUnlocked = (save: SoloSave, m: CampaignMode) => m === "normal" || (m === "hard" ? !!save.flags.hardUnlocked : !!save.flags.legendaryUnlocked);

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

  // P4: difficulty selector (Normal / Hard / Legendary)
  const modeBar = h("div.chart-modes");
  const renderModes = () => {
    modeBar.innerHTML = "";
    const cur = save.campaign.mode ?? "normal";
    for (const m of CAMPAIGN_MODES) {
      const info = MODE_INFO[m], open = modeUnlocked(save, m);
      modeBar.append(h(`button.cm-btn.m-${m}${cur === m && open ? ".on" : ""}${open ? "" : ".locked"}`, {
        disabled: !open, title: open ? info.blurb : m === "hard" ? "Beat chapter 30 to unlock Hard" : "Finish every chapter on Hard to unlock Legendary",
        onclick: () => { save.campaign.mode = m; sfx.click(); renderModes(); render(); },
      }, `${open ? info.icon : "🔒"} ${info.name}`));
    }
    if (save.flags.hardUnlocked) modeBar.append(h("div.cm-blurb", null, MODE_INFO[cur].blurb));
  };
  const mode = () => (modeUnlocked(save, save.campaign.mode ?? "normal") ? save.campaign.mode ?? "normal" : "normal");

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
    const md = mode();
    chapters.forEach((c, i) => {
      const rec = modeRec(save, c.id, md);
      const prevDone = md !== "normal" || i === 0 || !!save.campaign.chapters[chapters[i - 1].id]?.done;
      const locked = !rec?.done && !prevDone;
      const isNext = !rec?.done && prevDone;
      const g = rec?.grade;
      // mode badges: best grade on Hard / Legendary (and Normal when another mode is selected)
      const badges = CAMPAIGN_MODES.filter((m) => m !== md).map((m) => ({ m, r: modeRec(save, c.id, m) })).filter((x) => x.r?.done && x.r.grade)
        .map((x) => `<span class="cdc-mode m-${x.m}" title="${MODE_INFO[x.m].name}: ${x.r!.grade}">${MODE_INFO[x.m].icon}${x.r!.grade}</span>`).join("");
      list.append(h(`button.cd-ch${rec?.done ? ".done" : ""}${isNext ? ".next" : ""}${locked ? ".locked" : ""}${c.boss ? ".boss" : ""}`, {
        disabled: locked,
        onclick: () => { close(); o.onPlay(c.id); },
      }, h("div", { html: `
        <span class="cdc-num">${c.boss ? "☠" : c.index}</span>
        <span class="cdc-title">${escapeHtml(c.title.replace(/^BOSS:\s*/, "BOSS · "))}${badges ? `<span class="cdc-modes">${badges}</span>` : ""}</span>
        <span class="cdc-stars">${[1, 2, 3].map((k) => `<i class="${k <= (rec?.stars ?? 0) ? "on" : ""}">★</i>`).join("")}</span>
        <span class="cdc-grade" style="--gc:${g ? GRADE_COLOR[g] : "transparent"}">${g ?? ""}</span>
        <span class="cdc-status">${locked ? "🔒" : rec?.done ? `best ${fmtTime(rec.bestTime)}` : "▶ Play"}</span>` })));
    });
    detail.append(list);
    detail.append(h("div.cd-actions", null,
      h("button.tb-btn.ghost", { onclick: () => { close(); o.onFreeRoam(r.id); } }, r.id === o.current ? "⛵ Free roam here" : `⛵ Sail to ${r.name}`),
      o.onReplayEnding && (save.flags.creditsSeen || save.flags.campaignDone) ? h("button.tb-btn.ghost", { onclick: () => { close(); o.onReplayEnding!(); } }, "🎬 Replay ending") : null,
    ));
  };

  const el = h("div.overlay.sea-chart", { onclick: (e: MouseEvent) => { if (e.target === el) close(); } }, h("div.modal.wide.chart-modal", null,
    h("div.chart-top", null, h("h2", null, "🗺 Sea Chart"), h("button.icon-btn", { onclick: close, title: "Close" }, "✕")),
    modeBar,
    h("div.chart-body", null, map, detail),
  ));
  renderModes();
  render();
  root.append(el);
  window.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => el.classList.add("show"));
  sfx.click();
  return el;
}
