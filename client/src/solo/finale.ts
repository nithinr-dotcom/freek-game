/**
 * P3 finale (after the Maelstrom Eye, chapter 30): unlocks (campaign done, Free Play in every region, Hard mode flag
 * for P4), then the ending cinematic (the first dawn over the Trench, title card, Marlow's farewell) and the credits.
 */
import { regionList, getRegion } from "@freek/shared";
import type { SoloSave } from "./save";
import type { EnvCtx } from "./hazards/host";
import type { Lantern } from "./hazards/lantern";
import { envHost } from "./hazards/host";
import { openCredits } from "../ui/credits";
import type { Dialogue } from "../ui/dialogue";
import { h } from "../util";
import { sfx } from "../audio";

export const FINALE_CHAPTER = 30;

/** set the end-of-campaign unlocks; returns labels for the newly unlocked things */
export function applyFinaleUnlocks(save: SoloSave): string[] {
  const out: string[] = [];
  const f = save.flags;
  if (!f.campaignDone) out.push("🏆 Campaign complete");
  if (!f.freePlayAll) out.push("⛵ Free Play in every sea");
  if (!f.hardUnlocked) out.push("💀 Hard mode unlocked");
  f.campaignDone = true; f.freePlayAll = true; f.hardUnlocked = true;
  for (const r of regionList()) if (!save.campaign.unlockedRegions.includes(r.id)) save.campaign.unlockedRegions.push(r.id);
  save.stats.campaignDone = 1;
  return out;
}

export interface FinaleCtx extends EnvCtx {
  dialogue(lines: string[], done: () => void, title?: string): void;
}

export const ENDING = [
  "Look at that, sailor. Light. Real light, in the Trench. Forty years I've waited to see a sunrise here.",
  "The Maelstrom's gone quiet. The ships it swallowed will drift home, my brother's among them.",
  "Every sea is open to you now. Fish where you like, as long as you like. And when you're ready for something harder… the sea will be waiting.",
  "Thank you, Captain. You broke the tide.",
];

export function playFinale(ctx: FinaleCtx, unlocks: string[], done: () => void) {
  const ui = ctx.ui;
  ctx.net.save.flags.creditsSeen = true;
  const lantern = envHost.current?.get<Lantern>("lantern");
  const prevFrozen = ctx.clock.frozenAt;
  // the first dawn over the Trench
  ctx.clock.frozenAt = 6.6; ctx.clock.hour = 6.6;
  if (lantern) lantern.lightBoost = 220;
  const fade = h("div.finale-fade");
  const title = h("div.finale-title", { html: `<div class="ft-kicker">THE END</div><div class="ft-name">The Tide Is Broken</div><div class="ft-sub">${getRegion(ctx.region.id)?.name ?? ""} sees the sun</div>` });
  ui.append(fade, title);
  requestAnimationFrame(() => fade.classList.add("go"));
  const p = ctx.region.points.maelstrom ?? { x: 0, z: -120 };
  ctx.cinematic(p.x, p.z, 7);
  sfx.levelUp();
  setTimeout(() => { title.classList.add("show"); sfx.catchJingle("legendary"); }, 1600);
  setTimeout(() => {
    title.classList.remove("show");
    ctx.dialogue(ENDING, () => {
      openCredits(ui, {
        save: ctx.net.save, unlocks,
        onClose: () => {
          fade.classList.remove("go");
          setTimeout(() => { fade.remove(); title.remove(); }, 2600);
          ctx.clock.frozenAt = prevFrozen; if (prevFrozen !== null) ctx.clock.hour = prevFrozen;
          if (lantern) lantern.lightBoost = 0;
          ctx.feed.toast("<b>⛵ Free Play is open in every sea</b> · 💀 Hard mode unlocked", "good", 5000);
          done();
        },
      });
    }, "Marlow");
  }, 6200);
}

/** P4: "Replay ending" (Sea Chart, once seen): Marlow's farewell, then the credits (no unlocks, any region) */
export function replayEnding(ui: HTMLElement, save: SoloSave, dialogue: Pick<Dialogue, "show">, done: () => void) {
  const fade = h("div.finale-fade");
  ui.append(fade);
  requestAnimationFrame(() => fade.classList.add("go"));
  setTimeout(() => dialogue.show(ENDING, () => openCredits(ui, {
    save, unlocks: [],
    onClose: () => { fade.classList.remove("go"); setTimeout(() => fade.remove(), 2600); done(); },
  }), "Marlow"), 900);
}
