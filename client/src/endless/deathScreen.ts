/**
 * Endless Tide death-screen hooks (the "one more run" pull on the run summary):
 * - a near-miss line built only from true facts captured at the moment the run ended,
 * - progress bars towards the closest locked unlocks (animated from the value at run start),
 * - "NEW BEST TIDE" flair for the captain and a runs-today counter,
 * - R / Space / Enter restarts the same captain + Danger while the summary is showing.
 * EndlessMode calls rememberRunStart (constructor) and takeDeathSnapshot (gameOver); ui.ts calls noteShopExit and
 * mountDeathScreen (summary).
 */
import { CAPTAINS_BY_ID, RARITY_INFO, RARITIES, RIGS_BY_ID, RIG_TIER_LABEL, TRINKETS_BY_ID, todayKey, type Offer, type RunState } from "@freek/shared";
import type { EndlessMode } from "./EndlessMode";
import type { EndlessMeta } from "./meta";
import { closestUnlocks, type ProgressSource } from "./progress";
import { h, escapeHtml } from "../util";

const PRE_KEY = "tidebreakers.endless.prerun";
const TODAY_KEY = "tidebreakers.endless.today";

// ------------------------------------------------------------------------------------------------ run-start snapshot
interface PreRun extends ProgressSource { startedAt: number }
let preRun: PreRun | null = null;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** call once the run exists; a resumed run reuses the snapshot stored when it first started */
export function rememberRunStart(meta: EndlessMeta, run: RunState, resumed: boolean) {
  if (resumed) {
    try {
      const raw = localStorage.getItem(PRE_KEY);
      const p = raw ? (JSON.parse(raw) as PreRun) : null;
      preRun = p && p.startedAt === run.startedAt ? p : null;
    } catch { preRun = null; }
    return;
  }
  preRun = { startedAt: run.startedAt, stats: clone(meta.stats), captains: clone(meta.captains), unlocks: [...meta.unlocks] };
  try { localStorage.setItem(PRE_KEY, JSON.stringify(preRun)); } catch { /* storage full */ }
}

// ------------------------------------------------------------------------------------------------ last shop
interface ShopExit { coins: number; offers: Offer[] }
const shopExits = new WeakMap<RunState, ShopExit>();
/** the coins in hand and the offers left when the player sailed out of the shop */
export function noteShopExit(run: RunState) {
  shopExits.set(run, { coins: run.coins, offers: (run.shop?.offers ?? []).filter((o): o is Offer => !!o).map((o) => ({ ...o })) });
}

// ------------------------------------------------------------------------------------------------ death snapshot
interface DeathSnap {
  sunk: boolean; inTide: boolean; tide: number; tideT: number; duration: number; bossTide: boolean;
  boss: { name: string; pct: number } | null; runsToday: number;
}
const snaps = new WeakMap<RunState, DeathSnap>();

function bumpRunsToday(): number {
  const day = todayKey();
  let n = 0;
  try {
    const raw = localStorage.getItem(TODAY_KEY);
    const v = raw ? (JSON.parse(raw) as { day: string; n: number }) : null;
    n = v && v.day === day ? v.n : 0;
    n++;
    localStorage.setItem(TODAY_KEY, JSON.stringify({ day, n }));
  } catch { n = Math.max(1, n); }
  return n;
}

/** call at the top of gameOver, before the phase changes */
export function takeDeathSnapshot(mode: EndlessMode, ended: boolean) {
  const sp = mode.spec, me = mode.net.me;
  const bb = mode.bossBar();
  snaps.set(mode.run, {
    sunk: !ended && (me.hp <= 0 || !!me.sunk),
    inTide: mode.phase === "tide",
    tide: mode.run.tide, tideT: mode.tideT, duration: sp?.duration ?? 0, bossTide: !!sp?.boss,
    boss: bb && bb.maxHp > 0 && bb.hp > 0 ? { name: bb.name, pct: bb.hp / bb.maxHp } : null,
    runsToday: bumpRunsToday(),
  });
}

// ------------------------------------------------------------------------------------------------ near-miss
interface Cand { score: number; html: string }
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function nearMiss(mode: EndlessMode, d: { reached: number; score: number; newBest: boolean }, snap: DeathSnap | undefined): string | null {
  const run = mode.run, c: Cand[] = [];
  const preCap = preRun?.captains[run.captain];
  if (snap?.sunk && snap.inTide) {
    // the tide timer (a boss tide only ends with the boss dead, so the boss line covers those)
    const left = snap.duration - snap.tideT;
    if (!snap.bossTide && left > 0 && left <= 20) {
      const s = Math.max(1, Math.ceil(left));
      c.push({ score: 100 - s * 2, html: `You were <b>${plural(s, "second")}</b> from clearing tide ${snap.tide}` });
    }
    if (snap.boss && snap.boss.pct <= 0.3) {
      const p = Math.max(1, Math.round(snap.boss.pct * 100));
      c.push({ score: 98 - p * 1.5, html: `${escapeHtml(snap.boss.name)} had only <b>${p}% HP</b> left` });
    }
  }
  // personal best tide for this captain
  const pb = preCap?.bestTide ?? 0;
  if (pb > 0 && d.reached <= pb) {
    const need = pb + 1 - d.reached;
    if (need <= 2) c.push({ score: 82 - (need - 1) * 22, html: `<b>${plural(need, "more tide")}</b> would have beaten your best (tide ${pb})` });
  }
  // the last shop: an offer you were a few coins short of
  const exit = snap?.sunk ? shopExits.get(run) : undefined;
  if (exit) {
    let best: { short: number; rank: number; name: string } | null = null;
    for (const o of exit.offers) {
      const short = o.price - exit.coins;
      if (short <= 0 || short > Math.max(4, Math.ceil(o.price * 0.25))) continue;
      let rank: number, name: string;
      if (o.kind === "rig") { const r = RIGS_BY_ID[o.id]; if (!r) continue; rank = o.tier; name = `the ${r.name} ${RIG_TIER_LABEL[o.tier - 1]}`; }
      else { const t = TRINKETS_BY_ID[o.id]; if (!t) continue; rank = RARITIES.indexOf(t.rarity) + 1; name = `that ${RARITY_INFO[t.rarity].label} ${t.name}`; }
      if (!best || rank > best.rank || (rank === best.rank && short < best.short)) best = { short, rank, name };
    }
    if (best) c.push({ score: 72 - best.short + best.rank * 3, html: `<b>${plural(best.short, "more coin")}</b> and you could have bought ${escapeHtml(best.name)}` });
  }
  // best score
  const bs = preCap?.bestScore ?? 0;
  if (!d.newBest && bs > 0 && d.score < bs && bs - d.score <= bs * 0.1) c.push({ score: 60, html: `Just <b>${bs - d.score} points</b> short of your best score (${bs})` });
  // a counter unlock within reach
  for (const u of closestUnlocks(mode.meta, preRun, 3)) {
    const gap = u.need - u.cur;
    if (gap <= 0 || u.cur / u.need < 0.85 || !["kills_150", "kills_300", "net_500", "legend_10"].includes(u.key)) continue;
    c.push({ score: 64, html: `Only <b>${gap} more ${escapeHtml(u.unit)}</b> to unlock ${escapeHtml(u.rewards[0].replace(/^[^:]+: /, ""))}` });
  }
  c.sort((a, b) => b.score - a.score);
  return c[0]?.html ?? null;
}

// ------------------------------------------------------------------------------------------------ mount
/**
 * Adds the near-miss line, best-tide flair, runs-today counter and unlock bars to the summary overlay, puts a key hint on
 * the "Run it back" button and arms R / Space / Enter to call `again` while the overlay is showing.
 */
export function mountDeathScreen(mode: EndlessMode, d: { reached: number; score: number; newBest: boolean }, overlay: HTMLElement, again: () => void) {
  const run = mode.run, snap = snaps.get(run), cap = CAPTAINS_BY_ID[run.captain];
  const modal = overlay.querySelector<HTMLElement>(".en-summary") ?? overlay;
  const actions = modal.querySelector<HTMLElement>(".modal-actions");
  const box = h("div.en-ds");

  // flair: new best tide, runs today
  const preBest = preRun?.captains[run.captain]?.bestTide ?? null;
  const flair = h("div.en-ds-flair");
  if (preBest !== null && d.reached > preBest && d.reached > 1) flair.append(h("span.en-ds-best", { html: `★ NEW BEST TIDE · ${escapeHtml(cap?.name ?? run.captain)} <b>${d.reached}</b>${preBest > 0 ? ` <small>(was ${preBest})</small>` : ""}` }));
  if (snap) flair.append(h("span.en-ds-today", null, `Runs today: ${snap.runsToday}`));
  if (flair.childElementCount) box.append(flair);

  const miss = nearMiss(mode, d, snap);
  if (miss) box.append(h("div.en-ds-miss", { html: `<span>SO CLOSE</span>${miss}` }));

  // closest unlocks
  const next = closestUnlocks(mode.meta, preRun, 3);
  if (next.length) {
    const list = h("div.en-ds-unlocks", null, h("div.en-side-h", null, "🔒 Next unlocks"));
    const anim: { fill: HTMLElement; num: HTMLElement; from: number; to: number; need: number }[] = [];
    for (const u of next) {
      const fill = h("i"), num = h("b", null, `${u.from}/${u.need}`);
      fill.style.width = `${(u.from / u.need) * 100}%`;
      const gained = u.cur - u.from;
      list.append(h("div.en-ds-row", null,
        h("div.en-ds-row-t", null, h("span", null, u.rewards.join(" · ")), num),
        h("div.en-ds-row-s", null, `${u.label}${gained > 0 ? ` · +${gained} this run` : ""}`),
        h(`div.en-ds-bar${gained > 0 ? ".grew" : ""}`, null, fill),
      ));
      anim.push({ fill, num, from: u.from, to: u.cur, need: u.need });
    }
    box.append(list);
    // fill from the run-start value to now
    setTimeout(() => {
      const t0 = performance.now(), dur = 1100;
      for (const a of anim) a.fill.style.width = `${(a.to / a.need) * 100}%`;
      const tick = () => {
        if (!overlay.isConnected) return;
        const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - (1 - k) ** 3;
        for (const a of anim) a.num.textContent = `${Math.round(a.from + (a.to - a.from) * e)}/${a.need}`;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 450);
  }
  if (box.childElementCount) { if (actions) modal.insertBefore(box, actions); else modal.append(box); }

  // key hint + instant restart
  const btn = actions?.querySelector<HTMLButtonElement>(".tb-btn.primary");
  if (btn) btn.append(h("kbd.en-ds-kbd", { title: "R, Space or Enter" }, "R"));
  if (actions) actions.after(h("div.en-ds-keys", { html: `Press <kbd>R</kbd> <kbd>Space</kbd> or <kbd>Enter</kbd> to run it back` }));
  const armedAt = performance.now() + 600;
  let done = false;
  const stop = () => { window.removeEventListener("keydown", onKey, true); obs.disconnect(); };
  const onKey = (e: KeyboardEvent) => {
    if (!overlay.isConnected || !overlay.classList.contains("show")) { if (!overlay.isConnected) stop(); return; }
    if (e.code !== "KeyR" && e.code !== "Space" && e.code !== "Enter" && e.code !== "NumpadEnter") return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat || done || performance.now() < armedAt) return;
    done = true;
    stop();
    btn?.classList.add("en-ds-go");
    again();
  };
  window.addEventListener("keydown", onKey, true);
  // drop the listener as soon as the overlay leaves the page
  const obs = new MutationObserver(() => { if (!overlay.isConnected) stop(); });
  if (overlay.parentElement) obs.observe(overlay.parentElement, { childList: true });
}
