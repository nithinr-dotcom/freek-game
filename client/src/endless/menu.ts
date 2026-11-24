/** Endless Tide menus (lobby): captain + danger + companion select, the Daily Tide tournament, the Almanac. */
import {
  CAPTAINS, CAPTAINS_BY_ID, DANGER_LEVELS, COMPANIONS, RIGS, TRINKETS, RARITY_INFO, RIG_CLASS_INFO, STAT_INFO,
  todayKey, dailyCaptain, dailyRivals, DAILY_DANGER, type StatId,
} from "@freek/shared";
import { loadMeta, writeMeta, captainRecord, captainUnlocked, maxDanger, companionUnlocked, isUnlocked, unlockText, checkUnlocks, type EndlessMeta } from "./meta";
import { openHarbour, harbourLabel } from "./harbour";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";
import { renderAlmanacCombos } from "./combos";

export interface EndlessStart { captain: string; danger: number; daily: boolean; resume: boolean }

function modal(root: HTMLElement, cls: string, ...kids: (HTMLElement | null)[]) {
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); window.removeEventListener("keydown", onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key !== "Escape") return; const open = [...document.querySelectorAll(".overlay.show")]; if (open.length && open[open.length - 1] !== el) return; e.stopImmediatePropagation(); close(); };
  const el = h(`div.overlay.en-menu.${cls}`, { onclick: (e: MouseEvent) => { if (e.target === el) close(); } }, h("div.modal", null, h("button.icon-btn.en-x", { onclick: close, title: "Close" }, "✕"), ...kids));
  root.append(el);
  window.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => el.classList.add("show"));
  return { el, close };
}

export function openEndlessMenu(root: HTMLElement, onStart: (s: EndlessStart) => void) {
  const meta = loadMeta();
  if (checkUnlocks(meta).length) writeMeta(meta);
  let captain = captainUnlocked(meta, localStorage.getItem("tb_en_captain") ?? "marlow") ? localStorage.getItem("tb_en_captain") ?? "marlow" : "marlow";
  let danger = 0;
  const grid = h("div.en-cap-grid");
  const detail = h("div.en-cap-detail");
  const dangerRow = h("div.en-danger-row");
  const compRow = h("div.en-comp-row");
  const go = (s: EndlessStart) => { localStorage.setItem("tb_en_captain", captain); m.close(); sfx.unlock(); onStart(s); };
  const render = () => {
    grid.innerHTML = "";
    for (const c of CAPTAINS) {
      const open = captainUnlocked(meta, c.id), rec = captainRecord(meta, c.id);
      grid.append(h(`button.en-cap${open ? "" : ".locked"}${c.id === captain ? ".sel" : ""}`, { style: `--cc:${c.color}`, onclick: () => { if (!open) { sfx.fail(); return; } captain = c.id; danger = Math.min(danger, maxDanger(meta, c.id)); sfx.click(); render(); } },
        h("span.en-cap-icon", null, open ? c.icon : "🔒"),
        h("b", null, open ? c.name : "???"),
        h("span.en-cap-rec", null, open ? (rec.danger >= 0 ? `☠${rec.danger} won · best T${rec.bestTide}` : rec.bestTide ? `best tide ${rec.bestTide}` : "new") : unlockText(c.unlock)),
      ));
    }
    const c = CAPTAINS_BY_ID[captain], rec = captainRecord(meta, captain);
    detail.innerHTML = `<div class="en-cap-big" style="--cc:${c.color}">${c.icon}</div><div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.blurb)}</p>
      <div class="en-statline">${Object.entries(c.stats).map(([k, v]) => `<span class="${(v as number) > 0 ? "up" : "down"}">${STAT_INFO[k as StatId].icon} ${(v as number) > 0 ? "+" : ""}${v} ${STAT_INFO[k as StatId].label}</span>`).join("")}</div>
      <p class="muted">Starts with: ${escapeHtml(RIGS.find((r) => r.id === c.startRig)?.name ?? c.startRig)} · Runs ${rec.runs} · Wins ${rec.wins} · Best score ${rec.bestScore}</p></div>`;
    dangerRow.innerHTML = "";
    const maxD = maxDanger(meta, captain);
    for (const d of DANGER_LEVELS) {
      const open = d.n <= maxD;
      dangerRow.append(h(`button.en-danger${open ? "" : ".locked"}${d.n === danger ? ".sel" : ""}`, { title: open ? d.text : `Win Danger ${d.n - 1} with ${c.name}`, onclick: () => { if (!open) { sfx.fail(); return; } danger = d.n; sfx.click(); render(); } }, h("b", null, open ? `☠${d.n}` : "🔒"), h("span", null, d.name)));
    }
    const dd = DANGER_LEVELS[danger];
    dangerRow.append(h("div.en-danger-text", null, danger ? `Danger ${danger}: ${DANGER_LEVELS.slice(1, danger + 1).map((x) => x.text).join(" ")}` : dd.text));
    compRow.innerHTML = "";
    for (const p of COMPANIONS) {
      const open = companionUnlocked(meta, p.id);
      compRow.append(h(`button.en-comp${open ? "" : ".locked"}${meta.companion === p.id ? ".sel" : ""}`, { title: open ? p.perk : unlockText(p.unlock), onclick: () => { if (!open) { sfx.fail(); return; } meta.companion = p.id; writeMeta(meta); sfx.click(); render(); } }, h("span", null, open ? p.icon : "🔒"), h("small", null, open ? p.name : unlockText(p.unlock))));
    }
  };
  const resume = meta.run ? h("div.en-resume", null,
    h("span", { html: `⏸ Run in progress: <b>${escapeHtml(CAPTAINS_BY_ID[meta.run.captain]?.name ?? "")}</b> · tide ${meta.run.tide} · ${meta.run.coins}●` }),
    h("button.tb-btn.primary", { onclick: () => go({ captain: meta.run!.captain, danger: meta.run!.danger, daily: !!meta.run!.daily, resume: true }) }, "▶ Resume"),
  ) : null;
  const key = todayKey();
  const dCap = CAPTAINS_BY_ID[dailyCaptain(key)];
  const myDaily = meta.daily[key];
  // Harbour (permanent upgrades): on close, pull its pearl/level changes into this menu's meta so later writes keep them
  const harbourBtn = h("button.tb-btn.ghost", { title: "Spend pearls on permanent upgrades", onclick: () => openHarbour(root, () => {
    const f = loadMeta(); meta.pearls = f.pearls; meta.pearlsEarned = f.pearlsEarned; meta.harbour = f.harbour; harbourBtn.textContent = harbourLabel(f.pearls);
  }) }, harbourLabel(meta.pearls));
  const m = modal(root, "en-start",
    h("div.en-cash-k", null, "SINGLE PLAYER · ROGUELITE"),
    h("h2", null, "🌊 Endless Tide"),
    h("p.sub", null, "Survive tides of fish and monsters. Cash in your hold, buy rigs and trinkets, merge, and go deeper. Best tide: " + (meta.stats.bestTide ?? 0)),
    resume,
    h("div.en-side-h", null, "Captain"), grid, detail,
    h("div.en-side-h", null, "Danger"), dangerRow,
    h("div.en-side-h", null, "Companion"), compRow,
    h("div.en-start-foot", null,
      h("button.tb-btn.ghost", { onclick: () => openAlmanac(root) }, "📚 Almanac"),
      harbourBtn,
      h("button.tb-btn", { onclick: () => openDaily(root, () => go({ captain: dCap.id, danger: DAILY_DANGER, daily: true, resume: false })) }, `📅 Daily Tide${myDaily ? ` · ${myDaily.best}` : ""}`),
      h("button.tb-btn.primary.big", { onclick: () => go({ captain, danger, daily: false, resume: false }) }, meta.run ? "▶ New run" : "▶ Set sail"),
    ),
  );
  render();
}

export function openDaily(root: HTMLElement, play: () => void) {
  const meta = loadMeta();
  const key = todayKey();
  const cap = CAPTAINS_BY_ID[dailyCaptain(key)];
  const mine = meta.daily[key];
  const rows = [...dailyRivals(key).map((r) => ({ ...r, me: false })), ...(mine ? [{ name: `${localStorage.getItem("tb_name") || "You"} (you)`, tide: mine.tide, score: mine.best, me: true }] : [])].sort((a, b) => b.score - a.score);
  const rank = mine ? rows.findIndex((r) => r.me) + 1 : 0;
  const table = h("div.en-daily-table", null, ...rows.map((r, i) => h(`div.en-daily-row${r.me ? ".me" : ""}`, null, h("span", null, `#${i + 1}`), h("b", null, r.name), h("span", null, `tide ${r.tide}`), h("i", null, String(r.score)))));
  const past = Object.entries(meta.daily).filter(([k]) => k !== key).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5);
  const m = modal(root, "en-daily",
    h("div.en-cash-k", null, `DAILY TIDE · ${key}`),
    h("h2", null, "📅 Daily Tournament"),
    h("p.sub", { html: `Everyone gets the same seed today: captain <b>${cap.icon} ${escapeHtml(cap.name)}</b>, Danger ${DAILY_DANGER}, the same shops and tide modifiers. Beat the rival captains on the board. Score = tide × 1000 + coins earned. ${rank ? `<br>Your rank today: <b>#${rank}</b> of ${rows.length}.` : ""}` }),
    table,
    past.length ? h("div.en-daily-past", { html: `<div class="en-side-h">Past days</div>${past.map(([k, d]) => `<div><span>${k}</span><b>${d.best}</b><i>tide ${d.tide}</i></div>`).join("")}` }) : null,
    h("div.modal-actions", null, h("button.tb-btn.primary.big", { onclick: () => { m.close(); play(); } }, mine ? "↻ Try again" : "▶ Play today's tide")),
  );
}

export function openAlmanac(root: HTMLElement, tab: "rigs" | "trinkets" | "combos" | "captains" | "records" = "rigs") {
  const meta: EndlessMeta = loadMeta();
  const body = h("div.en-alm-body");
  const tabs = h("div.lb-tabs");
  const set = (t: typeof tab) => { tab = t; sfx.click(); render(); };
  const render = () => {
    tabs.innerHTML = "";
    for (const [k, label] of [["rigs", "🎣 Rigs"], ["trinkets", "💎 Trinkets"], ["combos", "⚡ Combos"], ["captains", "🧓 Captains"], ["records", "🏆 Records"]] as const) tabs.append(h(`button.lb-tab${tab === k ? ".active" : ""}`, { onclick: () => set(k) }, label));
    body.innerHTML = "";
    if (tab === "rigs") {
      for (const r of RIGS) {
        const seen = meta.seen.rigs.includes(r.id), open = isUnlocked(meta, r.unlock);
        body.append(h(`div.en-alm-item${seen ? "" : ".unseen"}`, { style: `--rc:${RIG_CLASS_INFO[r.cls].color}` }, h("span.en-offer-icon", null, seen ? r.icon : "❔"), h("div", null, h("b", null, seen ? r.name : open ? "Not found yet" : "Locked"), h("p", null, seen ? r.desc(1, r.power[0]) : open ? `A ${RIG_CLASS_INFO[r.cls].label.replace(/s$/, "").toLowerCase()} rig. Buy it in a shop to record it.` : unlockText(r.unlock)))));
      }
    } else if (tab === "trinkets") {
      const list = TRINKETS.filter((t) => !t.cursed);
      body.append(h("div.en-alm-count", null, `${list.filter((t) => meta.seen.trinkets.includes(t.id)).length} / ${list.length} found`));
      for (const t of list) {
        const seen = meta.seen.trinkets.includes(t.id), open = isUnlocked(meta, t.unlock);
        const stats = Object.entries(t.stats).map(([k, v]) => `${STAT_INFO[k as StatId].label} ${(v as number) > 0 ? "+" : ""}${v}`).join(", ");
        body.append(h(`div.en-alm-item${seen ? "" : ".unseen"}`, { style: `--rc:${RARITY_INFO[t.rarity].color}` }, h("span.en-offer-icon", null, seen ? t.icon : "❔"), h("div", null, h("b", null, seen ? t.name : open ? `${RARITY_INFO[t.rarity].label} trinket` : "Locked"), h("p", null, seen ? [stats, t.text].filter(Boolean).join(" · ") : open ? "Buy it to record it." : unlockText(t.unlock)))));
      }
    } else if (tab === "combos") {
      renderAlmanacCombos(body, meta);
    } else if (tab === "captains") {
      for (const c of CAPTAINS) {
        const open = captainUnlocked(meta, c.id), rec = captainRecord(meta, c.id);
        body.append(h(`div.en-alm-item${open ? "" : ".unseen"}`, { style: `--rc:${c.color}` }, h("span.en-offer-icon", null, open ? c.icon : "🔒"), h("div", null, h("b", null, open ? c.name : "???"), h("p", null, open ? `${c.blurb} · Danger won: ${rec.danger >= 0 ? rec.danger : "none"} · best tide ${rec.bestTide}` : unlockText(c.unlock)))));
      }
    } else {
      const st = meta.stats;
      body.append(h("div.en-sum-grid", { html: `
        <span>Runs</span><b>${st.runs ?? 0}</b><span>Wins</span><b>${st.wins ?? 0}</b>
        <span>Best tide</span><b>${st.bestTide ?? 0}</b><span>Fish</span><b>${st.fish ?? 0}</b>
        <span>Monsters</span><b>${st.kills ?? 0}</b><span>Net fish</span><b>${st.netFish ?? 0}</b>
        <span>Legendaries</span><b>${st.legendaries ?? 0}</b><span>Unlocks</span><b>${meta.unlocks.length}</b>` }));
      body.append(h("div.en-side-h", null, "Recent runs"));
      for (const r of meta.history) body.append(h("div.en-daily-row", null, h("span", null, r.won ? "🏆" : "💀"), h("b", null, `${CAPTAINS_BY_ID[r.captain]?.icon ?? ""} ${CAPTAINS_BY_ID[r.captain]?.name ?? r.captain}`), h("span", null, `☠${r.danger} · tide ${r.tide}${r.daily ? " · 📅" : ""}`), h("i", null, String(r.score))));
      if (!meta.history.length) body.append(h("p.muted", null, "No runs yet."));
    }
  };
  modal(root, "en-alm", h("div.en-cash-k", null, "ENDLESS TIDE"), h("h2", null, "📚 Almanac"), tabs, body);
  render();
}
