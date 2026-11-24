/** Endless Tide in-run screens: tide HUD strip, tide intro, cash-in, level-up picks, the Tackle Shop, victory and summary. */
import {
  TIER_INFO, RIGS_BY_ID, TRINKETS_BY_ID, RIG_CLASS_INFO, RIG_TIER_LABEL, RARITY_INFO, STAT_INFO, STAT_IDS, MODIFIERS, CAPTAINS_BY_ID, DANGER_LEVELS,
  rigSlots, buy, sell, merge, mergeable, rerollCost, rollShop, takeLevel, rollLevelOffers, levelRerollCost, sellValue, interestFor, activeSets, tideSpec,
  harbourFreeRerolls, ENDLESS_MONSTERS,
  type TideSpec, type Tier, type LevelOffer, type Offer, type StatId, type RigSlot,
} from "@freek/shared";
import type { EndlessMode } from "./EndlessMode";
import { isUnlocked, unlockRewards, unlockText } from "./meta";
import { slotView, doEvolve, offerHintHtml } from "./combos";
import { evolvable } from "@freek/shared";
import { mountDeathScreen, noteShopExit } from "./deathScreen";
import { speciesInfo } from "../solo/species";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";

/** intro-card icons for roster monsters (shared/src/endless/monsters.ts) */
const MONSTER_ICON: Record<string, string> = { serpent: "🐍", swarmer: "🐟", spitter: "🐍", bomber: "🐡", shielded: "🦀", splitter: "🪼", splitling: "🪼" };

const fmtStat = (id: StatId, v: number) => {
  const u = STAT_INFO[id].unit;
  const n = Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : String(Math.round(v));
  return `${v > 0 ? "+" : ""}${n}${u}`;
};
/** Tackle Shop reroll price, after the Harbour "Dice Cup" free rerolls */
const shopRerollPrice = (run: EndlessMode["run"]) => { const n = run.shop?.rerolls ?? 0, free = harbourFreeRerolls(run); return n < free ? 0 : rerollCost(run.tide, n - free); };
const statLine = (stats: Partial<Record<StatId, number>>) => Object.entries(stats).filter(([, v]) => v).map(([k, v]) => `<span class="${(v as number) > 0 ? "up" : "down"}">${STAT_INFO[k as StatId].icon} ${fmtStat(k as StatId, v as number)} ${STAT_INFO[k as StatId].label}</span>`).join("");

export class EndlessUI {
  private strip: HTMLElement;
  private tideNum: HTMLElement; private biome: HTMLElement; private timeFill: HTMLElement; private timeText: HTMLElement; private coinEl: HTMLElement; private lvlPip: HTMLElement; private modChip: HTMLElement;
  private between: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private lastCoins = -1;

  constructor(private m: EndlessMode, private root: HTMLElement) {
    this.tideNum = h("b.en-tide-n"); this.biome = h("span.en-biome"); this.timeFill = h("i"); this.timeText = h("span.en-time");
    this.coinEl = h("b.en-coins"); this.lvlPip = h("span.en-lvl-pip", null, "▲ LEVEL UP"); this.modChip = h("span.en-mod");
    this.strip = h("div.en-strip", null,
      h("div.en-tide", null, h("span.en-tide-lbl", null, "TIDE"), this.tideNum),
      h("div.en-mid", null, h("div.en-row", null, this.biome, this.modChip, this.timeText), h("div.en-time-bar", null, this.timeFill)),
      h("div.en-coin-box", null, h("span.coin-icon", null, "●"), this.coinEl),
      this.lvlPip,
    );
    root.append(this.strip);
  }
  get open() { return !!this.between?.isConnected; }

  update(_dt: number) {
    const m = this.m, sp = m.spec;
    if (!sp) return;
    this.tideNum.textContent = String(m.run.tide);
    this.biome.textContent = `${sp.biome.name}${m.run.danger ? ` · ☠${m.run.danger}` : ""}${m.run.daily ? " · 📅 Daily" : ""}`;
    const left = Math.max(0, sp.duration - m.tideT);
    const bossWait = sp.boss && m.tideT >= sp.duration;
    this.timeText.textContent = m.phase === "tide" ? (bossWait ? "BOSS!" : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`) : "";
    this.timeFill.style.width = `${Math.min(100, (m.tideT / sp.duration) * 100)}%`;
    this.strip.classList.toggle("ending", m.phase === "tide" && left < 10 && !bossWait);
    this.strip.classList.toggle("boss", sp.boss);
    if (m.run.coins !== this.lastCoins) { this.coinEl.textContent = String(m.run.coins); if (this.lastCoins >= 0 && m.run.coins > this.lastCoins) { this.coinEl.classList.remove("pop"); void this.coinEl.offsetWidth; this.coinEl.classList.add("pop"); } this.lastCoins = m.run.coins; }
    this.lvlPip.classList.toggle("show", m.run.pendingLevels > 0);
    this.modChip.textContent = sp.modifier ? `${MODIFIERS[sp.modifier].icon} ${MODIFIERS[sp.modifier].name}` : "";
    this.modChip.style.display = sp.modifier ? "" : "none";
  }
  levelPop() { this.lvlPip.classList.remove("bump"); void this.lvlPip.offsetWidth; this.lvlPip.classList.add("bump"); }

  // ---------------------------------------------------------------- cards
  private showCard(el: HTMLElement, ms: number, done?: () => void) {
    this.card?.remove();
    this.card = el;
    this.root.append(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); done?.(); }, ms);
  }
  tideIntro(sp: TideSpec, done: () => void) {
    const mod = sp.modifier ? MODIFIERS[sp.modifier] : null;
    const first = sp.tide === 1 || (sp.tide - 1) % 4 === 0;
    const el = h("div.en-card", { html: `
      <div class="en-card-k">${sp.boss ? "☠ BOSS TIDE" : first ? "NEW WATERS" : "THE TIDE RISES"}</div>
      <div class="en-card-t">TIDE ${sp.tide}</div>
      <div class="en-card-s">${escapeHtml(sp.biome.name)}${first || sp.tide === 1 ? ` · <i>${escapeHtml(sp.biome.hazardText)}</i>` : ""}</div>
      ${mod ? `<div class="en-card-mod">${mod.icon} <b>${mod.name}</b> · ${mod.text}</div>` : ""}
      ${Object.values(ENDLESS_MONSTERS).filter((d) => d.unlockTide === sp.tide).map((d) => `<div class="en-card-mod en-card-new">New: ${MONSTER_ICON[d.id] ?? "☠"} <b>${escapeHtml(d.name)}</b> · ${escapeHtml(d.blurb)}</div>`).join("")}` });
    el.classList.toggle("boss", sp.boss);
    sfx.announce();
    this.showCard(el, 2200, done);
  }
  bossCard(name: string, epithet: string) {
    this.showCard(h("div.en-card.boss", { html: `<div class="en-card-k">☠ BOSS</div><div class="en-card-t">${escapeHtml(name)}</div><div class="en-card-s">${escapeHtml(epithet)}</div>` }), 2600);
  }

  // ---------------------------------------------------------------- between tides
  private overlay(cls: string, ...kids: HTMLElement[]) {
    this.between?.remove();
    const el = h(`div.overlay.en-between.${cls}`, null, ...kids);
    this.between = el;
    this.root.append(el);
    requestAnimationFrame(() => el.classList.add("show"));
    return el;
  }
  closeBetween() { const b = this.between; this.between = null; if (b) { b.classList.remove("show"); setTimeout(() => b.remove(), 250); } }

  cashIn(d: { lines: { tier: Tier; n: number; coins: number }[]; total: number; fish: number; earned: number; tide: number }, done: () => void) {
    const total = h("b.en-cash-total", null, "0");
    const rows = d.lines.map((l, i) => h("div.en-cash-row", { style: `--tc:${TIER_INFO[l.tier].color};animation-delay:${0.15 + i * 0.12}s` }, h("span", null, `${l.n}× ${TIER_INFO[l.tier].label}`), h("b", null, `+${l.coins}●`)));
    let finished = false;
    const finish = () => { if (finished) return; finished = true; clearTimeout(timer); this.closeBetween(); done(); };
    const btn = h("button.tb-btn.primary.big", { onclick: () => { sfx.click(); finish(); } }, "Continue ▶");
    this.overlay("cash", h("div.modal.en-cash", null,
      h("div.en-cash-k", null, `TIDE ${d.tide} SURVIVED`),
      h("h2", null, "⚓ Cash-in"),
      h("div.en-cash-rows", null, ...(rows.length ? rows : [h("div.en-cash-row.empty", null, "The hold is empty.")])),
      h("div.en-cash-sum", null, h("span", null, "Hold"), total),
      h("div.en-cash-sub", null, `${d.fish} fish this tide · ${d.earned} coins earned (loot included)`),
      btn,
    ));
    const start = performance.now();
    const tick = () => {
      if (finished) return;
      const k = Math.min(1, (performance.now() - start) / 900);
      total.textContent = `+${Math.round(d.total * k)}●`;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    if (d.total) sfx.coin();
    const timer = setTimeout(finish, 3600);
  }

  levelUp(offers: LevelOffer[], next: () => void) {
    const m = this.m;
    let current = offers;
    const grid = h("div.en-level-grid");
    const rerollBtn = h("button.tb-btn.ghost.small");
    const render = () => {
      grid.innerHTML = "";
      for (const o of current) {
        const info = STAT_INFO[o.stat], r = RARITY_INFO[o.rarity];
        grid.append(h("button.en-level-card", { style: `--rc:${r.color}`, onclick: () => { takeLevel(m.run, o); m.changed(); sfx.levelUp(); this.closeBetween(); setTimeout(next, 180); } },
          h("span.en-lc-icon", null, info.icon),
          h("b.en-lc-amt", null, fmtStat(o.stat, o.amount)),
          h("span.en-lc-name", null, info.label),
          h("span.en-lc-rar", null, r.label),
          h("span.en-lc-desc", null, info.desc),
        ));
      }
      const cost = levelRerollCost(m.run.tide);
      rerollBtn.textContent = `🎲 Reroll · ${cost}●`;
      (rerollBtn as HTMLButtonElement).disabled = m.run.coins < cost;
    };
    rerollBtn.onclick = () => {
      const cost = levelRerollCost(m.run.tide);
      if (m.run.coins < cost) return;
      m.run.coins -= cost;
      current = rollLevelOffers(m.run, Math.floor(Math.random() * 1e6));
      sfx.click();
      render();
    };
    render();
    this.overlay("level", h("div.modal.en-level", null,
      h("div.en-cash-k", null, `LEVEL ${m.net.me.level - m.run.pendingLevels + 1}${m.run.pendingLevels > 1 ? ` · ${m.run.pendingLevels} picks` : ""}`),
      h("h2", null, "▲ Level up! Pick one"),
      grid,
      h("div.en-level-foot", null, rerollBtn, h("span.en-coins-sm", null, `● ${m.run.coins}`)),
    ));
    sfx.levelUp();
  }

  // ---------------------------------------------------------------- shop
  shop(onNext: () => void) {
    const m = this.m, run = m.run;
    const ctx = { unlocked: (k: string) => isUnlocked(m.meta, k) };
    const body = h("div.en-shop-offers");
    const side = h("div.en-shop-side");
    const coins = h("b.en-coins");
    const reroll = h("button.tb-btn");
    const nextBtn = h("button.tb-btn.primary.big");
    const msg = h("div.en-shop-msg");
    const say = (t: string, bad = false) => { msg.textContent = t; msg.className = `en-shop-msg show${bad ? " bad" : ""}`; setTimeout(() => msg.classList.remove("show"), 1800); };
    const offerCard = (o: Offer | null, i: number): HTMLElement => {
      if (!o) return h("div.en-offer.sold", null, h("span", null, "SOLD"));
      const locked = !!run.shop?.locked[i];
      let head: HTMLElement, desc = "", color = "#fff", kicker = "";
      if (o.kind === "rig") {
        const d = RIGS_BY_ID[o.id], ci = RIG_CLASS_INFO[d.cls];
        color = ["#b0b8c0", "#3fa9ff", "#b05cff", "#ff5a1f"][o.tier - 1];
        kicker = `RIG · ${ci.icon} ${ci.label.replace(/s$/, "")} · TIER ${RIG_TIER_LABEL[o.tier - 1]}`;
        head = h("div.en-offer-head", null, h("span.en-offer-icon", null, d.icon), h("b", null, d.name));
        const twin = run.rigs.some((r) => r.id === o.id && r.tier === o.tier);
        desc = `<p>${escapeHtml(d.desc(o.tier, d.power[o.tier - 1]))}</p><p class="muted">Every ${d.cooldown[o.tier - 1]}s${d.range ? ` · ${d.range} m` : ""}</p>${twin ? `<p class="en-merge-hint">⇪ You own one: two make a Tier ${RIG_TIER_LABEL[o.tier] ?? "IV"}</p>` : ""}`;
      } else {
        const t = TRINKETS_BY_ID[o.id], r = RARITY_INFO[t.rarity];
        color = t.cursed ? "#6aff8a" : r.color;
        kicker = `${t.cursed ? "☠ CURSED " : ""}TRINKET · ${r.label.toUpperCase()}${run.trinkets[o.id] ? ` · owned ×${run.trinkets[o.id]}` : ""}`;
        head = h("div.en-offer-head", null, h("span.en-offer-icon", null, t.icon), h("b", null, t.name));
        desc = `<div class="en-statline">${statLine(t.stats)}</div>${t.text ? `<p>${escapeHtml(t.text)}</p>` : ""}`;
      }
      const can = run.coins >= o.price;
      return h(`div.en-offer${locked ? ".locked" : ""}`, { style: `--rc:${color}` },
        h("div.en-offer-k", null, kicker), head, h("div.en-offer-desc", { html: desc + offerHintHtml(run, m.meta, o) }),
        h("div.en-offer-foot", null,
          h(`button.tb-btn.primary.small${can ? "" : ".short"}`, { onclick: () => {
            const res = buy(run, i);
            if (!res.ok) { say(res.why, true); sfx.fail(); return; }
            if (res.merged) { say(`⇪ Merged into ${RIGS_BY_ID[res.merged.id].name} ${RIG_TIER_LABEL[res.merged.tier - 1]}!`); sfx.catchJingle("epic"); }
            else { if (res.swapped) say(`⇄ Sold your ${RIGS_BY_ID[res.swapped.id]?.name ?? "rig"} for the new one`); sfx.coin(); }
            m.changed(); render();
          } }, o.price === 0 ? "FREE" : `Buy · ${o.price}●`),
          h("button.tb-btn.ghost.small", { title: "Keep this offer for the next shop", onclick: () => { if (run.shop) { run.shop.locked[i] = !run.shop.locked[i]; sfx.click(); m.changed(); render(); } } }, locked ? "🔒" : "🔓"),
        ),
      );
    };
    const slotEl = (s: RigSlot | null, merges: [RigSlot, RigSlot][]): HTMLElement => {
      if (!s) return h("div.en-slot.empty", null, "+");
      const d = RIGS_BY_ID[s.id];
      const pair = merges.find(([a, b]) => a.uid === s.uid || b.uid === s.uid);
      const sv = slotView(s), canEvo = evolvable(run).find((x) => x.slot.uid === s.uid), evo = canEvo?.evo;
      return h(`div.en-slot${sv.evolved ? ".evolved" : evo ? ".can-evolve" : ""}`, { style: `--rc:${sv.color}`, title: `${sv.name} ${sv.tier}: ${sv.desc}` },
        h("span.en-slot-icon", null, sv.icon), h("span.en-slot-tier", null, sv.tier), h("span.en-slot-name", null, sv.name),
        h("div.en-slot-act", null,
          evo && canEvo ? h("button.tb-btn.small.primary.en-evolve-btn", { title: `Evolve into ${evo.name} for ${canEvo.cost} coins`, disabled: run.coins < canEvo.cost, onclick: () => { if (doEvolve(m, s.uid)) { say(`★ ${d.name} evolved into ${evo.name}!`); m.changed(); render(); } else say("Not enough coins to evolve"); } }, `★ Evolve ${canEvo.cost}●`) : null,
          pair && pair[0].uid === s.uid ? h("button.tb-btn.small.primary", { onclick: () => { merge(run, pair[0], pair[1]); sfx.catchJingle("epic"); say(`⇪ ${d.name} is now Tier ${RIG_TIER_LABEL[pair[0].tier - 1]}!`); m.changed(); render(); } }, "⇪ Merge") : null,
          run.rigs.length > 1 ? h("button.tb-btn.small.ghost", { title: s.evolved ? "★ Evolved rigs sell for double" : undefined, onclick: () => { const v = sell(run, s.uid); if (v) { sfx.coin(); m.changed(); render(); } } }, `Sell ${s.evolved ? "★ " : ""}${sellValue(s, run.tide)}●`) : null,
        ),
      );
    };
    const render = () => {
      body.innerHTML = "";
      (run.shop?.offers ?? []).forEach((o, i) => body.append(offerCard(o, i)));
      coins.textContent = String(run.coins);
      const rc = shopRerollPrice(run);
      reroll.textContent = rc === 0 ? "🎲 Reroll · FREE" : `🎲 Reroll · ${rc}●`;
      (reroll as HTMLButtonElement).disabled = run.coins < rc;
      const gain = interestFor(run);
      nextBtn.innerHTML = `Next tide ▶ <small>Tide ${run.tide}${gain ? ` · +${gain}● interest` : ""}</small>`;
      // side panel: rigs, sets, trinkets, stats
      const n = rigSlots(run), merges = mergeable(run);
      const slots = h("div.en-slots");
      for (let i = 0; i < n; i++) slots.append(slotEl(run.rigs[i] ?? null, merges));
      const sets = activeSets(m.classCount);
      const tr = Object.entries(run.trinkets).filter(([, c]) => c > 0);
      const stats = h("div.en-stats", null, ...STAT_IDS.map((id) => {
        const v = m.stats[id], info = STAT_INFO[id];
        const base = id === "maxHp" ? 100 : id === "magnet" ? 7 : 0;
        return h(`div.en-stat${v > base ? ".up" : v < base ? ".down" : ""}`, { title: info.desc }, h("span", null, `${info.icon} ${info.label}`), h("b", null, id === "maxHp" || id === "magnet" ? String(Math.round(v)) : fmtStat(id, v)));
      }));
      side.innerHTML = "";
      side.append(
        h("div.en-side-h", null, `Rigs ${run.rigs.length}/${n}`), slots,
        sets.length ? h("div.en-sets", null, ...sets.map((s) => h("span.en-set", { style: `--cc:${RIG_CLASS_INFO[s.cls].color}` }, `${RIG_CLASS_INFO[s.cls].icon} ${s.n}: ${s.text}`))) : h("div.en-sets.muted", null, "Collect 2+ rigs of a class for set bonuses."),
        h("div.en-side-h", null, `Trinkets ${tr.reduce((a, [, c]) => a + c, 0)}`),
        h("div.en-trinkets", null, ...(tr.length ? tr.map(([id, c]) => { const t = TRINKETS_BY_ID[id]; return h("span.en-trinket", { style: `--rc:${RARITY_INFO[t.rarity].color}`, title: `${t.name}: ${t.text ?? ""} ${Object.entries(t.stats).map(([k, v]) => `${STAT_INFO[k as StatId].label} ${fmtStat(k as StatId, v as number)}`).join(", ")}` }, t.icon, c > 1 ? h("sub", null, `×${c}`) : null); }) : [h("span.muted", null, "None yet")])),
        h("div.en-side-h", null, "Stats"), stats,
      );
    };
    reroll.onclick = () => {
      const rc = shopRerollPrice(run);
      if (run.coins < rc) return;
      run.coins -= rc;
      const rr = (run.shop?.rerolls ?? 0) + 1;
      run.counters.rerolls++;
      rollShop(run, ctx, rr);
      if (run.shop) run.shop.rerolls = rr;
      sfx.click();
      body.classList.remove("flick"); void body.offsetWidth; body.classList.add("flick");
      m.changed(); render();
    };
    nextBtn.onclick = () => { sfx.click(); noteShopExit(run); this.closeBetween(); onNext(); };
    const cap = CAPTAINS_BY_ID[run.captain];
    const nextSpec = tideSpec(run);
    render();
    this.overlay("shop", h("div.modal.en-shop", null,
      h("div.en-shop-top", null,
        h("div", null, h("div.en-cash-k", null, `${cap.icon} ${cap.name.toUpperCase()} · ${DANGER_LEVELS[run.danger].name.toUpperCase()}`), h("h2", null, "🛒 Tackle Shop")),
        h("div.en-shop-next", { html: `Next: <b>Tide ${run.tide}</b> · ${escapeHtml(nextSpec.biome.name)}${nextSpec.boss ? " · <b class='bad'>☠ BOSS</b>" : ""}${nextSpec.modifier ? ` · ${MODIFIERS[nextSpec.modifier].icon} ${MODIFIERS[nextSpec.modifier].name}` : ""}` }),
        h("div.en-coin-box.big", null, h("span.coin-icon", null, "●"), coins),
      ),
      h("div.en-shop-main", null, h("div.en-shop-left", null, body, h("div.en-shop-bar", null, reroll, msg)), side),
      h("div.en-shop-foot", null, h("span.muted", null, "Locked offers stay for the next shop. Buy a twin rig to merge it."), nextBtn),
    ));
  }

  // ---------------------------------------------------------------- end screens
  victory(keepGoing: () => void, retire: () => void) {
    sfx.catchJingle("legendary");
    this.overlay("victory", h("div.modal.en-victory", null,
      h("div.en-cash-k", null, "TIDE 20 CLEARED"),
      h("h2", null, "🏆 The sea is yours!"),
      h("p", null, "You beat the Endless Tide. Your win is recorded. Keep going for a deeper record: the tides only get worse from here."),
      h("div.modal-actions", null,
        h("button.tb-btn", { onclick: () => { this.closeBetween(); retire(); } }, "Retire in glory"),
        h("button.tb-btn.primary.big", { onclick: () => { this.closeBetween(); keepGoing(); } }, "Keep going ▶"),
      ),
    ));
  }
  summary(d: { won: boolean; reached: number; score: number; newBest: boolean; unlocks: string[]; pearls?: number }) {
    const m = this.m, run = m.run, c = run.counters, cap = CAPTAINS_BY_ID[run.captain];
    const best = c.bestFishId ? `${speciesInfo(c.bestFishId)?.name ?? c.bestFishId} · ${c.bestFishKg} kg` : "—";
    const unlocks = d.unlocks.flatMap((k) => [`<b>${escapeHtml(unlockText(k))}</b>`, ...unlockRewards(k).map(escapeHtml)]);
    const daily = run.daily ? `<p class="en-daily-note">📅 Daily Tide ${run.daily}: your best today is <b>${m.meta.daily[run.daily]?.best ?? d.score}</b>.</p>` : "";
    const again = () => { const p = new URLSearchParams(location.search); p.set("endless", "1"); p.set("captain", run.captain); p.set("danger", String(run.danger)); p.delete("resume"); if (run.daily) p.set("daily", "1"); else p.delete("daily"); location.href = `${location.pathname}?${p}`; };
    const sumEl = this.overlay("summary", h("div.modal.en-summary", null,
      h("div.en-cash-k", null, `${cap.icon} ${cap.name.toUpperCase()} · DANGER ${run.danger}`),
      h("h2", null, d.won ? "🏆 Victory" : "💀 Sunk at sea"),
      h("div.en-sum-big", { html: `<div><span>Tide reached</span><b>${d.reached}</b></div><div><span>Score</span><b>${d.score}</b>${d.newBest ? `<i>NEW BEST</i>` : ""}</div><div><span>Coins earned</span><b>${run.earned}</b></div>` }),
      d.pearls ? h("div.en-sum-pearls", { html: `+${d.pearls} 🦪 pearls <span>· ${m.meta.pearls} banked: spend them in the ⚓ Harbour</span>` }) : null,
      h("div.en-sum-grid", { html: `
        <span>🐟 Fish</span><b>${c.fish}</b><span>🕸 By nets</span><b>${c.netFish}</b>
        <span>⚔ Monsters</span><b>${c.kills}</b><span>☠ Bosses</span><b>${c.bossKills}</b>
        <span>🌟 Legendary</span><b>${c.legendaries}</b><span>⇪ Merges</span><b>${c.merges}</b>
        <span>🏅 Best fish</span><b class="wide">${escapeHtml(best)}</b>` }),
      h("div.en-sum-build", null, ...run.rigs.map((r) => { const sv = slotView(r); return h("span.en-trinket", { title: sv.name }, sv.icon, h("sub", null, sv.tier)); }), ...Object.entries(run.trinkets).map(([id, n]) => h("span.en-trinket", { title: TRINKETS_BY_ID[id]?.name }, TRINKETS_BY_ID[id]?.icon ?? "?", n > 1 ? h("sub", null, `×${n}`) : null))),
      unlocks.length ? h("div.en-unlocks", { html: `<div class="en-side-h">🔓 Unlocked</div>${unlocks.map((u) => `<div>${u}</div>`).join("")}` }) : null,
      h("div", { html: daily }),
      h("div.modal-actions", null,
        h("button.tb-btn", { onclick: () => { location.href = location.pathname; } }, "⚓ Lobby"),
        h("button.tb-btn.primary.big", { onclick: again }, "↻ Run it back"),
      ),
    ));
    mountDeathScreen(m, d, sumEl, again);
  }
}
