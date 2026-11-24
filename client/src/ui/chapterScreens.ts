/** Campaign screens: chapter banner, CHAPTER COMPLETE with stars, ending credits, chapter select. */
import { CHAPTERS, ZONES, FREE_PLAY_CHAPTER, type ChapterDef } from "@freek/shared";
import type { ChapterResult } from "../solo/campaign";
import type { SoloSave } from "../solo/save";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";
import { MARLOW_SVG } from "./dialogue";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const starRow = (n: number, cls = "") => `<span class="stars ${cls}">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}">★</i>`).join("")}</span>`;

export class ChapterScreens {
  private banner: HTMLElement;
  private complete: HTMLElement;
  private credits: HTMLElement;

  constructor(private root: HTMLElement) {
    this.banner = h("div.chapter-banner");
    this.complete = h("div.overlay.chapter-complete");
    this.credits = h("div.overlay.credits");
    root.append(this.banner, this.complete, this.credits);
  }

  showBanner(def: ChapterDef | null) {
    this.banner.innerHTML = def
      ? `<div class="cb-num">CHAPTER ${def.id}</div><div class="cb-title">${escapeHtml(def.title)}</div><div class="cb-zone">${ZONES[def.zone].name}</div>`
      : `<div class="cb-num">THE OCEAN IS YOURS</div><div class="cb-title">Free Play</div><div class="cb-zone">All zones open</div>`;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
  }

  showComplete(r: ChapterResult, onNext: () => void) {
    const nextLabel = r.isFinal ? "Finale ▶" : r.replay ? "Back to the campaign ▶" : r.chapter.id < CHAPTERS.length ? `Chapter ${r.chapter.id + 1} ▶` : "Continue ▶";
    this.complete.innerHTML = "";
    const btn = h("button.tb-btn.primary.big", { onclick: () => { this.complete.classList.remove("show"); sfx.click(); onNext(); } }, nextLabel);
    this.complete.append(h("div.cc-panel", { html: `
      <div class="cc-rays"></div>
      <div class="cc-label">${r.replay ? "CHAPTER REPLAYED" : "CHAPTER COMPLETE"}</div>
      <div class="cc-title">${r.chapter.id}. ${escapeHtml(r.chapter.title)}</div>
      <div class="cc-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? "on" : ""}" style="animation-delay:${0.4 + i * 0.35}s">★</i>`).join("")}</div>
      <ul class="cc-reasons">
        <li class="on">✔ Chapter complete</li>
        <li class="${r.speedStar ? "on" : ""}">${r.speedStar ? "✔" : "✘"} Under par time (${fmtTime(r.elapsed)} / ${fmtTime(r.chapter.parSeconds)})</li>
        <li class="${r.noSinkStar ? "on" : ""}">${r.noSinkStar ? "✔" : "✘"} Never sank</li>
      </ul>
      <div class="cc-rewards"><span class="xp">+${r.xp} XP</span><span class="coins">+${r.coins} ●</span></div>
      ${r.unlockText ? `<div class="cc-unlock">🔓 ${escapeHtml(r.unlockText)}</div>` : ""}` }, btn));
    this.complete.classList.add("show");
    sfx.levelUp();
    for (let i = 1; i <= r.stars; i++) setTimeout(() => sfx.coin(), 400 + i * 350);
  }

  showCredits(onDone: () => void) {
    const btn = h("button.tb-btn.primary.big", { onclick: () => { this.credits.classList.remove("show"); onDone(); } }, "Free Play ▶");
    this.credits.innerHTML = "";
    this.credits.append(h("div.credits-panel", null,
      h("div.credits-scroll", { html: `
        <div class="cr-title">TIDE<span>BREAKERS</span></div>
        <div class="cr-sub">You are a Legend of the Tide.</div>
        <div class="cr-portrait">${MARLOW_SVG}</div>
        <p>Old Marlow keeps the light burning, and somewhere in the Abyss the old ones remember your name.</p>
        <h4>Starring</h4><p>You, the Tidebreaker<br/>Old Marlow, the lighthouse keeper<br/>The Abyss Kraken<br/>A very grumpy Reef Serpent</p>
        <h4>Made with</h4><p>Three.js · Colyseus · WebAudio · a lot of procedural triangles</p>
        <h4>Thank you for playing!</h4>` }),
      btn));
    this.credits.classList.add("show");
    sfx.catchJingle("legendary");
  }
}

/** Chapter select grid (lobby + pause menu). */
export function chapterSelect(root: HTMLElement, save: SoloSave, onPick: (chapter: number) => void): HTMLElement {
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); };
  const cards = CHAPTERS.map((c) => {
    const done = c.id < save.chapter;
    const current = c.id === save.chapter;
    const locked = c.id > save.chapter;
    const best = save.bestTimes[c.id];
    const card = h(`button.chapter-card${done ? ".done" : ""}${current ? ".current" : ""}${locked ? ".locked" : ""}`, {
      disabled: locked, onclick: () => { close(); onPick(c.id); },
    }, h("div", { html: `
      <div class="chc-num">${c.id}</div>
      <div class="chc-title">${escapeHtml(c.title)}</div>
      <div class="chc-zone">${ZONES[c.zone].name}</div>
      ${starRow(save.stars[c.id] ?? 0)}
      <div class="chc-status">${locked ? "🔒 Locked" : current ? "▶ Current chapter" : `Replay · best ${best !== undefined && isFinite(best) ? fmtTime(best) : "-"}`}</div>` }));
    return card;
  });
  if (save.finished) {
    cards.push(h("button.chapter-card.free", { onclick: () => { close(); onPick(FREE_PLAY_CHAPTER); } }, h("div", { html: `<div class="chc-num">∞</div><div class="chc-title">Free Play</div><div class="chc-zone">All zones</div><div class="chc-status">▶ Endless fishing</div>` })));
  }
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  const el = h("div.overlay.chapter-select", { onclick: (e: MouseEvent) => { if (e.target === el) close(); } }, h("div.modal.wide", null,
    h("h2", null, "Chapters"),
    h("p.sub", { html: `<span class="stars small"><i class="on">★</i></span> ${total} / ${CHAPTERS.length * 3} stars · replay finished chapters to improve your stars` }),
    h("div.chapter-grid", null, ...cards),
    h("button.tb-btn.ghost", { onclick: close }, "Close"),
  ));
  root.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  return el;
}
