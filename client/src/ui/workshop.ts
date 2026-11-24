/** Workshop (home dock): gear crafting for 7 slots × T1–T5, skill tree, boat cosmetics and titles. */
import {
  GEAR, GEAR_SLOTS, GEAR_SLOT_INFO, STAT_LABELS, MATERIALS, MATERIAL_IDS, SKILLS, SKILL_BRANCHES, SKILLS_BY_ID, RESPEC_COST,
  COSMETICS, TITLES, TITLES_BY_ID, ACHIEVEMENTS, bossList, skillPointsEarned, levelFromXp,
  type GearSlot, type MaterialId, type CosmeticKind, type SkillBranch,
} from "@freek/shared";
import type { SoloSave } from "../solo/save";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";

export interface WorkshopCtx {
  save: SoloSave;
  coins(): number;
  spend(n: number): void;
  xp(): number;
  atDock: boolean;
  onChanged(what: "gear" | "skills" | "cosmetic" | "title"): void;
}
type Tab = "gear" | "skills" | "boat";

export function skillPointsLeft(save: SoloSave, xp: number) {
  const spent = Object.values(save.skills).reduce((a, b) => a + b, 0);
  return skillPointsEarned(levelFromXp(xp).level, save.bossesBeaten.length) - spent;
}
const matUnlocked = (save: SoloSave, id: MaterialId) => save.campaign.unlockedRegions.includes(MATERIALS[id].region) || (save.materials[id] ?? 0) > 0;

export function openWorkshop(root: HTMLElement, ctx: WorkshopCtx, start: Tab = "gear"): HTMLElement {
  const save = ctx.save;
  let tab: Tab = start;
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); window.removeEventListener("keydown", onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
  const tabs: Record<Tab, HTMLElement> = {
    gear: h("button.lb-tab", { onclick: () => setTab("gear") }, "🔨 Gear"),
    skills: h("button.lb-tab", { onclick: () => setTab("skills") }, "📘 Skills"),
    boat: h("button.lb-tab", { onclick: () => setTab("boat") }, "⛵ Boat & Titles"),
  };
  const coinsEl = h("span.ws-coins");
  const body = h("div.ws-body");
  const setTab = (t: Tab) => { tab = t; sfx.click(); render(); };

  const matBar = () => h("div.ws-mats", null, ...MATERIAL_IDS.map((id) => {
    const m = MATERIALS[id], open = matUnlocked(save, id);
    return h(`span.ws-mat${open ? "" : ".locked"}${m.trophy ? ".trophy" : ""}`, { title: open ? m.name : `${m.name} (later region)`, style: `--mc:${m.color}` }, h("b", null, open ? m.icon : "🔒"), h("span", null, open ? String(save.materials[id] ?? 0) : "—"));
  }));

  const renderGear = () => {
    const grid = h("div.ws-grid");
    for (const slot of GEAR_SLOTS) {
      const tier = save.gear[slot] ?? 1;
      const cur = GEAR[slot][tier - 1], nxt = GEAR[slot][tier];
      const info = GEAR_SLOT_INFO[slot];
      const stats = Object.entries(cur.stats).map(([k, v]) => {
        const nv = nxt ? (nxt.stats as Record<string, number>)[k] : undefined;
        const L = STAT_LABELS[k];
        return `<div class="ws-stat"><span>${L.label}</span><b>${L.fmt(v as number)}</b>${nv !== undefined ? `<i>→ ${L.fmt(nv)}</i>` : ""}</div>`;
      }).join("");
      let costHtml = "", can = false, why = "";
      if (nxt) {
        const lacks: string[] = [];
        const cost = [`<span class="ws-cost ${ctx.coins() >= nxt.cost.coins ? "" : "short"}">● ${nxt.cost.coins}</span>`];
        if (ctx.coins() < nxt.cost.coins) lacks.push("coins");
        for (const [id, n] of Object.entries(nxt.cost.mats)) {
          const m = MATERIALS[id as MaterialId], have = save.materials[id as MaterialId] ?? 0, open = matUnlocked(save, id as MaterialId);
          if (have < (n as number)) lacks.push(m.name);
          cost.push(`<span class="ws-cost ${have >= (n as number) ? "" : "short"} ${open ? "" : "locked"}" style="--mc:${m.color}">${open ? m.icon : "🔒"} ${have}/${n}</span>`);
        }
        costHtml = cost.join("");
        can = !lacks.length && ctx.atDock;
        why = !ctx.atDock ? "Craft at a home dock" : lacks.length ? `Need ${lacks.slice(0, 2).join(", ")}` : "";
      }
      const card = h(`div.ws-card.t${tier}`, null,
        h("div.ws-card-head", { html: `<span class="ws-icon">${info.icon}</span><div><div class="ws-slot">${info.name} <span class="ws-tier">T${tier}</span></div><div class="ws-name">${escapeHtml(cur.name)}</div></div>` }),
        h("div.ws-blurb", null, info.blurb),
        h("div.ws-stats", { html: stats }),
        nxt ? h("div.ws-next", { html: `<div class="ws-next-name">Next: T${nxt.tier} ${escapeHtml(nxt.name)}</div><div class="ws-costs">${costHtml}</div>` }) : h("div.ws-max", null, "★ MAX TIER"),
        nxt ? h("button.tb-btn.small" + (can ? ".primary" : ""), { disabled: !can, title: why, onclick: () => craft(slot, card) }, can ? `🔨 Craft T${nxt.tier}` : why || "Craft") : null,
      );
      grid.append(card);
    }
    return grid;
  };

  const craft = (slot: GearSlot, card: HTMLElement) => {
    const tier = save.gear[slot] ?? 1;
    const nxt = GEAR[slot][tier];
    if (!nxt || ctx.coins() < nxt.cost.coins) return;
    for (const [id, n] of Object.entries(nxt.cost.mats)) if ((save.materials[id as MaterialId] ?? 0) < (n as number)) return;
    ctx.spend(nxt.cost.coins);
    for (const [id, n] of Object.entries(nxt.cost.mats)) save.materials[id as MaterialId] = (save.materials[id as MaterialId] ?? 0) - (n as number);
    save.gear[slot] = tier + 1;
    sfx.slam(); sfx.levelUp();
    ctx.onChanged("gear");
    render();
    const fresh = body.querySelectorAll(".ws-card")[GEAR_SLOTS.indexOf(slot)];
    fresh?.classList.add("crafted");
    void card;
  };

  const renderSkills = () => {
    const pts = skillPointsLeft(save, ctx.xp());
    const wrap = h("div.sk-wrap");
    wrap.append(h("div.sk-head", { html: `<span class="sk-points ${pts > 0 ? "has" : ""}">${pts}</span> skill point${pts === 1 ? "" : "s"} · 1 per level, +1 per boss` },
      h("button.tb-btn.ghost.small", { disabled: !ctx.atDock || ctx.coins() < RESPEC_COST || !Object.keys(save.skills).length, title: ctx.atDock ? "" : "Respec at a home dock", onclick: () => { ctx.spend(RESPEC_COST); save.skills = {}; sfx.coin(); ctx.onChanged("skills"); render(); } }, `↺ Respec (● ${RESPEC_COST})`)));
    const cols = h("div.sk-cols");
    for (const b of Object.keys(SKILL_BRANCHES) as SkillBranch[]) {
      const B = SKILL_BRANCHES[b];
      const col = h("div.sk-col", { style: `--bc:${B.color}` }, h("div.sk-branch", null, `${B.icon} ${B.name}`));
      for (const n of SKILLS.filter((s) => s.branch === b)) {
        const r = save.skills[n.id] ?? 0;
        const reqOk = !n.requires || (save.skills[n.requires] ?? 0) > 0;
        const can = pts > 0 && r < n.maxRank && reqOk;
        col.append(h(`button.sk-node${r ? ".owned" : ""}${r >= n.maxRank ? ".maxed" : ""}${reqOk ? "" : ".locked"}`, {
          disabled: !can, title: reqOk ? "" : `Requires ${SKILLS_BY_ID[n.requires!].name}`,
          onclick: () => { save.skills[n.id] = r + 1; sfx.mission(); ctx.onChanged("skills"); render(); },
        }, h("div", { html: `
          <span class="skn-icon">${n.icon}</span>
          <span class="skn-name">${escapeHtml(n.name)}</span>
          <span class="skn-pips">${Array.from({ length: n.maxRank }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("")}</span>
          <span class="skn-desc">${escapeHtml(n.desc(Math.min(n.maxRank, r + (r < n.maxRank ? 1 : 0))))}${r < n.maxRank && r > 0 ? " (next)" : ""}</span>
          ${reqOk ? "" : `<span class="skn-req">🔒 ${escapeHtml(SKILLS_BY_ID[n.requires!].name)}</span>`}` })));
      }
      cols.append(col);
    }
    wrap.append(cols);
    return wrap;
  };

  const sourceOf = (cid: string) => {
    const a = ACHIEVEMENTS.find((x) => x.reward?.cosmetic === cid || x.reward?.title === cid);
    if (a) return a.hidden ? "a secret" : `“${a.name}”`;
    const b = bossList().find((x) => x.cosmetic === cid || x.title === cid);
    return b ? `defeating the ${b.name}` : "the campaign";
  };
  const renderBoat = () => {
    const wrap = h("div.cos-wrap");
    for (const kind of ["paint", "sail", "flag"] as CosmeticKind[]) {
      const row = h("div.cos-row");
      for (const c of COSMETICS.filter((x) => x.kind === kind)) {
        const owned = save.cosmetics.includes(c.id), on = save.equipped[kind] === c.id;
        row.append(h(`button.cos-swatch${on ? ".on" : ""}${owned ? "" : ".locked"}`, {
          title: owned ? c.name : `${c.name}: unlocked by ${sourceOf(c.id)}`, disabled: !owned,
          onclick: () => { save.equipped[kind] = c.id; sfx.click(); ctx.onChanged("cosmetic"); render(); },
        }, h("span.cs-chip", { style: `--c1:${c.color};--c2:${c.color2 ?? c.color}` }, owned ? "" : "🔒"), h("span.cs-name", null, c.name)));
      }
      wrap.append(h("h4", null, kind === "paint" ? "Hull paint" : kind === "sail" ? "Sail" : "Flag"), row);
    }
    const titles = h("div.title-row");
    for (const t of TITLES) {
      const owned = save.titles.includes(t.id);
      titles.append(h(`button.title-chip${save.title === t.id ? ".on" : ""}${owned ? "" : ".locked"}`, {
        disabled: !owned, title: owned ? "" : `Unlocked by ${sourceOf(t.id)}`,
        onclick: () => { save.title = t.id; sfx.click(); ctx.onChanged("title"); render(); },
      }, owned ? t.name : `🔒 ${t.name}`));
    }
    wrap.append(h("h4", null, `Title · shown as “${TITLES_BY_ID[save.title]?.name ?? ""}”`), titles);
    return wrap;
  };

  const render = () => {
    for (const [k, t] of Object.entries(tabs)) t.classList.toggle("active", k === tab);
    coinsEl.innerHTML = `<span class="coin-icon">●</span> ${ctx.coins()}`;
    body.innerHTML = "";
    if (tab === "gear") body.append(matBar(), renderGear());
    else if (tab === "skills") body.append(renderSkills());
    else body.append(renderBoat());
    tabs.skills.dataset.badge = String(Math.max(0, skillPointsLeft(save, ctx.xp())) || "");
  };

  const el = h("div.overlay.workshop", { onclick: (e: MouseEvent) => { if (e.target === el) close(); } }, h("div.lb-panel.ws-panel", null,
    h("div.lb-tabs", null, tabs.gear, tabs.skills, tabs.boat, coinsEl, h("button.icon-btn.lb-close", { onclick: close, title: "Close" }, "✕")),
    ctx.atDock ? null : h("div.ws-note", null, "Browsing only: craft and respec at a home dock."),
    body,
  ));
  render();
  root.append(el);
  window.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => el.classList.add("show"));
  if (!save.flags.seenWorkshop) save.flags.seenWorkshop = true;
  return el;
}
