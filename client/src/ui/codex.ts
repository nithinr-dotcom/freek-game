/** Fish Codex (silhouettes until caught, clue or conditions, record weight, region) + achievements list. */
import { regionList, speciesOfRegion, getRegion, TIER_INFO, ACHIEVEMENTS, TITLES_BY_ID, COSMETICS_BY_ID, TITLES, COSMETICS, achievementGroup, tierRank, type CampaignSpecies, type RegionId } from "@freek/shared";
import type { SoloSave } from "../solo/save";
import { regionCompletion, totalCompletion } from "../solo/codex";
import { speciesInfo } from "../solo/species";
import { BEHAVIOUR_INFO } from "./reel";
import { fishSvg } from "./hud";
import { h, escapeHtml, fmtKg } from "../util";
import { sfx } from "../audio";

export function conditionText(s: CampaignSpecies): string {
  const k = s.conditions;
  if (!k) return "";
  const parts: string[] = [];
  if (k.time) parts.push(k.time.map((t) => (t === "night" ? "🌙 Night" : t === "dusk" ? "🌇 Dusk" : "☀ Day")).join(" / "));
  if (k.weather) parts.push(k.weather.map((w) => ({ storm: "⛈ Storm", rain: "🌧 Rain", gust: "💨 Gusts", aurora: "🌌 Aurora", clear: "☀ Clear" })[w]).join(" / "));
  if (k.near) { const lm = getRegion(s.region)?.landmarks.find((l) => l.id === k.near); parts.push(`📍 near ${lm?.name ?? k.near}`); }
  if (k.bait) parts.push(`🪱 bait: ${speciesInfo(k.bait)?.name ?? k.bait}`);
  return parts.join(" · ");
}

export function openCodex(root: HTMLElement, save: SoloSave, start: "fish" | "ach" = "fish"): HTMLElement {
  let tab = start;
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); window.removeEventListener("keydown", onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
  const tFish = h("button.lb-tab", { onclick: () => { tab = "fish"; sfx.click(); render(); } }, "📖 Fish Codex");
  const tAch = h("button.lb-tab", { onclick: () => { tab = "ach"; sfx.click(); render(); } }, "🏅 Achievements");
  const body = h("div.lb-body.codex-body");

  const fishTab = () => {
    const tot = totalCompletion(save);
    const out = h("div");
    out.append(h("div.cx-total", { html: `<div class="cx-pct">${tot.pct}%</div><div><b>${tot.caught} / ${tot.total}</b> species discovered<div class="cx-bar"><i style="width:${tot.pct}%"></i></div></div>` }));
    for (const r of regionList()) {
      const open = save.campaign.unlockedRegions.includes(r.id);
      const list = speciesOfRegion(r.id as RegionId).slice().sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
      const c = regionCompletion(save, r.id);
      out.append(h("div.cx-region", { html: `<span>${escapeHtml(r.name)}</span><span>${open ? (list.length ? `${c.caught}/${c.total} · ${c.pct}%${c.pct >= 100 ? " ✔ title + paint earned" : " · complete for a title + paint"}` : "species arrive in a later update") : "🔒 locked"}</span>` }));
      if (!open || !list.length) continue;
      const grid = h("div.cx-grid");
      for (const s of list) {
        const e = save.codex[s.id];
        const col = TIER_INFO[s.tier].color;
        const cond = conditionText(s);
        const b = BEHAVIOUR_INFO[s.behaviour];
        grid.append(h(`div.cx-card${e ? ".caught" : ""}`, { style: `--tier:${col}` },
          h("div.cx-fish", { html: fishSvg(e ? col : "#0a1626") }),
          h("div.cx-name", null, e ? s.name : "???"),
          h("div.cx-tier", null, `${TIER_INFO[s.tier].label}${e ? ` · ${b.icon} ${b.label}` : ""}`),
          h("div.cx-info", { html: e ? `${cond ? `<div class="cx-cond">${escapeHtml(cond)}</div>` : ""}<div>Record <b>${fmtKg(e.recordKg)}</b> · caught ×${e.n}</div>` : `<div class="cx-clue">“${escapeHtml(s.clue)}”</div>${cond ? `<div class="cx-hunt">✦ hunt species</div>` : ""}` }),
        ));
      }
      out.append(grid);
    }
    return out;
  };
  const achTab = () => {
    const got = ACHIEVEMENTS.filter((a) => save.achievements[a.id]).length;
    const out = h("div");
    out.append(h("div.cx-total", { html: `<div class="cx-pct">${got}</div><div><b>${got} / ${ACHIEVEMENTS.length}</b> achievements · ${save.titles.length}/${TITLES.length} titles · ${save.cosmetics.length}/${COSMETICS.length} cosmetics<div class="cx-bar"><i style="width:${(got / ACHIEVEMENTS.length) * 100}%"></i></div></div>` }));
    const GROUPS: [ReturnType<typeof achievementGroup>, string][] = [["voyage", "⚓ The Voyage"], ["angler", "🎣 Angler"], ["collector", "📖 Collector"], ["hunter", "🔱 Hunter & Bounties"], ["modes", "💀 Hard & Legendary"]];
    for (const [g, label] of GROUPS) {
      const list = ACHIEVEMENTS.filter((a) => achievementGroup(a) === g && (!a.hidden || save.achievements[a.id]));
      if (!list.length) continue;
      const n = list.filter((a) => save.achievements[a.id]).length;
      out.append(h("div.cx-region.ach-group", { html: `<span>${label}</span><span>${n}/${list.length}</span>` }));
      const grid = h("div.ach-grid");
      for (const a of list) {
        const on = !!save.achievements[a.id];
        const prog = Math.min(a.cond.gte, save.stats[a.cond.stat] ?? 0);
        const r = a.reward;
        const reward = [r?.title ? `🎖 ${TITLES_BY_ID[r.title]?.name}` : "", r?.cosmetic ? `🎨 ${COSMETICS_BY_ID[r.cosmetic]?.name}` : "", r?.coins ? `● ${r.coins}` : ""].filter(Boolean).join(" · ");
        const when = on ? new Date(save.achievements[a.id]).toLocaleDateString() : "";
        grid.append(h(`div.ach-card${on ? ".on" : ""}`, { html: `<span class="ach-icon">${on ? a.icon : "🔒"}</span><div><div class="ach-name">${escapeHtml(a.name)}</div><div class="ach-desc">${escapeHtml(a.desc)}</div>${!on && a.cond.gte > 1 ? `<div class="ach-prog"><i style="width:${(prog / a.cond.gte) * 100}%"></i><span>${prog}/${a.cond.gte}</span></div>` : ""}${reward ? `<div class="ach-reward">${escapeHtml(reward)}</div>` : ""}${when ? `<div class="ach-when">✔ ${escapeHtml(when)}</div>` : ""}</div>` }));
      }
      out.append(grid);
    }
    out.append(h("div.ach-foot", null, "Titles and cosmetics are equipped in the Workshop → Boat & Titles."));
    return out;
  };
  const render = () => {
    tFish.classList.toggle("active", tab === "fish"); tAch.classList.toggle("active", tab === "ach");
    body.innerHTML = "";
    body.append(tab === "fish" ? fishTab() : achTab());
  };
  const el = h("div.overlay.codex", { onclick: (e: MouseEvent) => { if (e.target === el) close(); } }, h("div.lb-panel.codex-panel", null,
    h("div.lb-tabs", null, tFish, tAch, h("button.icon-btn.lb-close", { onclick: close, title: "Close" }, "✕")),
    body,
  ));
  render();
  root.append(el);
  window.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => el.classList.add("show"));
  sfx.click();
  return el;
}
