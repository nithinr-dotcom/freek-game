/** P3: end credits (after chapter 30, also replayable). A slow roll of the voyage, the cast and the unlocks. */
import { actList, getBoss, getRegion } from "@freek/shared";
import type { SoloSave } from "../solo/save";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";
import { MARLOW_SVG } from "./dialogue";

export interface CreditsOpts { save: SoloSave; unlocks: string[]; onClose(): void }

export function openCredits(root: HTMLElement, o: CreditsOpts): HTMLElement {
  const s = o.save;
  const chapters = Object.values(s.campaign.chapters).filter((c) => c.done);
  const grades = chapters.reduce<Record<string, number>>((a, c) => { if (c.grade) a[c.grade] = (a[c.grade] ?? 0) + 1; return a; }, {});
  const stars = chapters.reduce((a, c) => a + c.stars, 0);
  const acts = actList().map((a) => {
    const r = getRegion(a.region);
    const boss = r ? getBoss(r.bossId)?.name : "";
    return `<p><b>Act ${a.act} · ${escapeHtml(a.title)}</b><br><small>${escapeHtml(r?.subtitle ?? "")}${boss ? ` · ☠ ${escapeHtml(boss)}` : ""}</small></p>`;
  }).join("");
  const roll = h("div.cr-roll", { html: `
    <div class="cr-title">TIDE<span>BREAKERS</span></div>
    <div class="cr-sub">The tide is broken</div>
    <div class="cr-portrait">${MARLOW_SVG}</div>
    <h4>Starring</h4><p>Captain ${escapeHtml(s.name)}</p><p>Marlow, keeper of the lighthouse</p>
    <h4>The voyage</h4>${acts}
    <h4>Your log</h4>
    <p>${s.stats.fish ?? s.catches} fish landed · ${s.bossesBeaten.length} bosses defeated</p>
    <p>★ ${stars} stars · ${["S", "A", "B", "C"].filter((g) => grades[g]).map((g) => `${grades[g]}× ${g}`).join(" · ") || "-"}</p>
    <p>Level ${s.level} · ${Object.keys(s.codex).length} species in the Codex</p>
    <h4>Monsters</h4><p>Reef Serpent · Crab Titan · Storm Kraken · Ice Leviathan · the Maelstrom Eye · the Deep Horrors</p>
    <h4>Made with</h4><p>Three.js · Vite · TypeScript · Colyseus</p>
    <h4>Thank you for playing</h4><p>The sea is yours now, Captain.</p>` });
  const scroll = h("div.credits-scroll", null, roll);
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); sfx.click(); o.onClose(); };
  const el = h("div.overlay.credits.p3", null, h("div.credits-panel", null,
    scroll,
    o.unlocks.length ? h("div.cr-unlocks", null, ...o.unlocks.map((u) => h("span", null, u))) : null,
    h("div.cr-actions", null,
      h("button.tb-btn.ghost", { onclick: () => el.classList.add("fast") }, "⏩ Faster"),
      h("button.tb-btn.primary.big", { onclick: close }, "Continue ▶"),
    ),
  ));
  root.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  sfx.catchJingle("legendary");
  return el;
}
