/** Campaign v2 cards: chapter banner, CHAPTER COMPLETE (stars, grade, rewards), CHAPTER FAILED (+hint/Assist), boss title + kill cards. */
import { MATERIALS, GRADE_COLOR, MODE_INFO, type CampaignMode, type CampaignChapter, type RegionDef, type BossDef, type MaterialId } from "@freek/shared";
import type { ChapterResult, FailInfo } from "../solo/chapterRunner";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";
import { MARLOW_SVG } from "./dialogue";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const matChips = (m: Partial<Record<MaterialId, number>>) =>
  Object.entries(m).filter(([, n]) => (n as number) > 0).map(([id, n]) => `<span class="mat-chip" style="--mc:${MATERIALS[id as MaterialId].color}">${MATERIALS[id as MaterialId].icon} +${n} ${escapeHtml(MATERIALS[id as MaterialId].name)}</span>`).join("");

export class CampaignScreens {
  private banner: HTMLElement;
  private card: HTMLElement;
  private bossCard: HTMLElement;

  constructor(private root: HTMLElement) {
    this.banner = h("div.chapter-banner");
    this.card = h("div.overlay.chapter-complete");
    this.bossCard = h("div.boss-card");
    root.append(this.banner, this.card, this.bossCard);
  }

  get visible() { return this.card.classList.contains("show"); }
  close() { this.card.classList.remove("show"); }

  showBanner(def: CampaignChapter | null, region: RegionDef, mode: CampaignMode = "normal") {
    const mb = mode !== "normal" ? `<span class="mode-badge m-${mode}">${MODE_INFO[mode].icon} ${MODE_INFO[mode].name.toUpperCase()}</span> ` : "";
    this.banner.innerHTML = def
      ? `<div class="cb-num">${mb}${def.boss ? "☠ BOSS · " : ""}ACT ${def.act} · CHAPTER ${def.index}</div><div class="cb-title">${escapeHtml(def.title.replace(/^BOSS:\s*/, ""))}</div><div class="cb-zone">${escapeHtml(region.name)}</div>`
      : `<div class="cb-num">FREE ROAM</div><div class="cb-title">${escapeHtml(region.name)}</div><div class="cb-zone">Fish, craft and explore · the Sea Chart starts chapters</div>`;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
  }

  showComplete(r: ChapterResult, a: { next: (() => void) | null; chart: () => void; free: () => void; replay: () => void }) {
    this.card.innerHTML = "";
    this.card.className = "overlay chapter-complete";
    const go = (fn: () => void) => () => { this.close(); sfx.click(); fn(); };
    const buttons = h("div.cc-actions", null,
      a.next ? h("button.tb-btn.primary.big", { onclick: go(a.next) }, r.next && r.next.region !== r.chapter.region ? "Sea Chart ▶" : `Chapter ${r.next!.index} ▶`) : null,
      h("button.tb-btn", { onclick: go(a.chart) }, "🗺 Sea Chart"),
      h("button.tb-btn.ghost", { onclick: go(a.free) }, "Keep fishing"),
      r.grade !== "S" ? h("button.tb-btn.ghost", { onclick: go(a.replay) }, "↻ Replay") : null,
    );
    const g = r.grade;
    this.card.append(h("div.cc-panel", { html: `
      <div class="cc-rays"></div>
      <div class="cc-label">${r.boss ? "BOSS DEFEATED" : "CHAPTER COMPLETE"}${r.mode !== "normal" ? ` · <span class="mode-badge m-${r.mode}">${MODE_INFO[r.mode].icon} ${MODE_INFO[r.mode].name.toUpperCase()}</span>` : ""}</div>
      <div class="cc-title">${r.chapter.act}-${r.chapter.index}. ${escapeHtml(r.chapter.title.replace(/^BOSS:\s*/, ""))}</div>
      <div class="cc-row">
        <div class="cc-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? "on" : ""}" style="animation-delay:${0.4 + i * 0.3}s">★</i>`).join("")}</div>
        <div class="cc-grade g-${g}" style="--gc:${GRADE_COLOR[g]}">${g}</div>
      </div>
      <ul class="cc-reasons">${r.objectives.map((o) => `<li class="${o.done ? "on" : ""}">${o.done ? "★" : "☆"} ${escapeHtml(o.title)}${o.optional ? "" : " <small>(main)</small>"}</li>`).join("")}</ul>
      <div class="cc-meta"><span>⏱ ${fmtTime(r.elapsed)} / par ${fmtTime(r.chapter.parSeconds)}</span><span>💥 ${Math.round(r.damagePct * 100)}% damage</span>${r.assist ? `<span class="assist">🛟 Assist · max B</span>` : ""}${r.newBest && !r.firstClear ? `<span class="best">NEW BEST</span>` : ""}</div>
      <div class="cc-rewards"><span class="xp">+${r.xp} XP</span><span class="coins">+${r.coins} ●</span></div>
      <div class="cc-mats">${matChips(r.materials)}</div>
      ${r.boss && r.firstClear ? `<div class="cc-unlock">🏅 Skill point · title and cosmetic unlocked</div>` : ""}
      ${r.unlockText ? `<div class="cc-unlock">🔓 ${escapeHtml(r.unlockText)}</div>` : ""}` }, buttons));
    requestAnimationFrame(() => this.card.classList.add("show"));
    sfx.levelUp();
    for (let i = 1; i <= r.stars; i++) setTimeout(() => sfx.coin(), 400 + i * 300);
    setTimeout(() => { sfx.slam(); if (g === "S") sfx.catchJingle("legendary"); }, 1500);
  }

  showFailed(f: FailInfo, a: { retry: (assist: boolean) => void; chart: () => void }) {
    this.card.innerHTML = "";
    this.card.className = "overlay chapter-complete failed";
    const go = (fn: () => void) => () => { this.close(); sfx.click(); fn(); };
    const hint = f.hint ? h("div.cf-hint", null, h("div.cf-portrait", { html: MARLOW_SVG }), h("div.cf-hint-body", null, h("div.cf-hint-name", null, "Marlow's advice"), h("div", null, f.hint))) : null;
    this.card.append(h("div.cc-panel.fail-panel", null,
      h("div.cc-label", null, "CHAPTER FAILED"),
      h("div.cc-title", null, `${f.chapter.act}-${f.chapter.index}. ${f.chapter.title.replace(/^BOSS:\s*/, "")}`),
      h("div.cf-reason", null, f.reason),
      f.checkpoint ? h("div.cf-check", null, `⚑ Checkpoint saved: ${f.checkpoint}`) : null,
      h("div.cf-fails", null, `Attempt ${f.fails}${f.fails < 3 ? ` · Marlow will offer help after ${3 - f.fails} more` : ""}`),
      hint,
      h("div.cc-actions", null,
        h("button.tb-btn.primary.big", { onclick: go(() => a.retry(false)) }, f.checkpoint ? "↻ Retry from checkpoint" : "↻ Retry"),
        f.assistAvailable ? h("button.tb-btn.assist-btn", { onclick: go(() => a.retry(true)) }, "🛟 Retry with Assist") : null,
        h("button.tb-btn.ghost", { onclick: go(a.chart) }, "🗺 Back to the chart"),
      ),
      f.assistAvailable ? h("p.cf-assist-note", null, "Assist: +15% catch zone and −20% monster damage for this attempt. Grade capped at B.") : null,
    ));
    requestAnimationFrame(() => this.card.classList.add("show"));
    sfx.fail();
    setTimeout(() => sfx.slam(), 200);
  }

  /** big boss title card during the intro pan */
  bossTitle(def: BossDef) {
    this.bossCard.innerHTML = `<div class="bc-kicker">BOSS</div><div class="bc-name">${escapeHtml(def.name)}</div><div class="bc-epithet">${escapeHtml(def.epithet)}</div><div class="bc-pips">${def.phases.map((p, i) => `<span>${i + 1}. ${escapeHtml(p.name)}</span>`).join("")}</div>`;
    this.bossCard.className = "boss-card show";
    setTimeout(() => this.bossCard.classList.remove("show"), 3400);
  }
  bossPhaseCard(def: BossDef, phase: number) {
    this.bossCard.innerHTML = `<div class="bc-kicker">PHASE ${phase + 1}</div><div class="bc-name small">${escapeHtml(def.phases[phase].name)}</div><div class="bc-epithet">Checkpoint saved</div>`;
    this.bossCard.className = "boss-card show phase";
    setTimeout(() => this.bossCard.classList.remove("show"), 2200);
  }
  bossKill(def: BossDef) {
    const trophy = MATERIALS[def.trophy];
    this.bossCard.innerHTML = `<div class="bc-kicker">VICTORY</div><div class="bc-name">${escapeHtml(def.name)} defeated!</div><div class="bc-trophy" style="--mc:${trophy.color}"><span>${trophy.icon}</span>${escapeHtml(trophy.name)}</div>`;
    this.bossCard.className = "boss-card show kill";
    setTimeout(() => this.bossCard.classList.remove("show"), 3000);
  }
}
