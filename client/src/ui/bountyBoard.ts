/** P4 Bounty Board (home dock): the region's 3 posted bounties, accept / abandon, coin reroll. */
import { MATERIALS, getRegion, type MaterialId } from "@freek/shared";
import { describe, type BountyRunner } from "../solo/bounties";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";

export interface BountyBoardCtx {
  runner: BountyRunner;
  coins(): number;
  /** bounties only run in free roam (between chapters / Free Play) */
  canAccept: boolean;
  regionId: string;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function openBountyBoard(root: HTMLElement, ctx: BountyBoardCtx): HTMLElement {
  const br = ctx.runner;
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); window.removeEventListener("keydown", onKey, true); br.onChange = null; };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
  const body = h("div.bb-body");
  const coinsEl = h("span.ws-coins");
  const region = getRegion(ctx.regionId as never);

  const render = () => {
    coinsEl.innerHTML = `<span class="coin-icon">●</span> ${ctx.coins()}`;
    body.innerHTML = "";
    const b = br.board;
    if (!ctx.canAccept) body.append(h("div.ws-note", null, "Bounties run in free roam: finish or leave the chapter first (Sea Chart → Free roam)."));
    const list = h("div.bb-list");
    for (const d of b.list) {
      const on = b.active === d.id;
      const mats = Object.entries(d.reward.mats).map(([id, n]) => `<span class="mat-chip" style="--mc:${MATERIALS[id as MaterialId].color}">${MATERIALS[id as MaterialId].icon} +${n}</span>`).join("");
      list.append(h(`div.bb-card${on ? ".on" : ""}`, null,
        h("div.bb-head", { html: `<span class="bb-diff">${"★".repeat(d.difficulty)}<i>${"★".repeat(3 - d.difficulty)}</i></span><span class="bb-title">${escapeHtml(d.title)}</span>${d.timeLimit ? `<span class="bb-time">⏳ ${fmt(d.timeLimit)}</span>` : ""}` }),
        h("div.bb-obj", null, describe(d)),
        h("div.bb-blurb", null, d.blurb),
        h("div.bb-reward", { html: `<span class="coins">● ${d.reward.coins}</span><span class="xp">${d.reward.xp} XP</span>${mats}<span class="bb-est">~${Math.max(1, Math.round(d.estSeconds / 60))} min</span>` }),
        h("div.bb-actions", null,
          on ? h("button.tb-btn.small.ghost", { onclick: () => { br.abandon(); sfx.click(); render(); } }, "✕ Abandon")
            : h("button.tb-btn.small.primary", { disabled: !ctx.canAccept || !!b.active, title: b.active ? "One bounty at a time" : "", onclick: () => { br.accept(d.id); sfx.mission(); close(); } }, b.active ? "One at a time" : "Accept"),
          h("button.tb-btn.small.ghost", { disabled: ctx.coins() < br.rerollCost, onclick: () => { if (br.reroll(d.id)) { sfx.coin(); render(); } } }, `↻ ● ${br.rerollCost}`),
        ),
        on ? h("div.bb-active", null, "▶ ACTIVE") : null,
      ));
    }
    body.append(list, h("div.bb-foot", null, `${b.done} bounties completed in ${region?.name ?? "these waters"} · a finished bounty is replaced at once`));
  };
  br.onChange = render;

  const el = h("div.overlay.bounty-board", { onclick: (e: MouseEvent) => { if (e.target === el) close(); } }, h("div.lb-panel.bb-panel", null,
    h("div.lb-tabs", null, h("span.bb-h", null, "📜 Bounty Board"), coinsEl, h("button.icon-btn.lb-close", { onclick: close, title: "Close" }, "✕")),
    body,
  ));
  render();
  root.append(el);
  window.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => el.classList.add("show"));
  sfx.click();
  return el;
}
