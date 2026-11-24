/** Endless Tide Harbour screen: spend Pearls (earned every run) on permanent upgrades. Rules live in shared/src/endless/harbour.ts. */
import { HARBOUR, HARBOUR_TOTAL_COST, harbourLevel, harbourNextCost } from "@freek/shared";
import { loadMeta, writeMeta } from "./meta";
import { h } from "../util";
import { sfx } from "../audio";

/** pearls spent so far (for the refund) */
function spent(lv: Partial<Record<string, number>>) {
  return HARBOUR.reduce((a, d) => a + d.costs.slice(0, harbourLevel(lv, d.id)).reduce((x, y) => x + y, 0), 0);
}

/** the pearl balance text used on buttons ("⚓ Harbour · 12 🦪") */
export function harbourLabel(pearls = loadMeta().pearls) { return `⚓ Harbour · ${pearls} 🦪`; }

export function openHarbour(root: HTMLElement, onClose?: () => void) {
  const meta = loadMeta();
  const bal = h("b.en-hb-bal");
  const grid = h("div.en-hb-grid");
  const foot = h("div.en-hb-foot");
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); window.removeEventListener("keydown", onKey, true); onClose?.(); };
  const onKey = (e: KeyboardEvent) => { if (e.key !== "Escape") return; const open = [...document.querySelectorAll(".overlay.show")]; if (open.length && open[open.length - 1] !== el) return; e.stopImmediatePropagation(); close(); };
  const render = () => {
    bal.textContent = `${meta.pearls} 🦪`;
    grid.innerHTML = "";
    for (const d of HARBOUR) {
      const lvl = harbourLevel(meta.harbour, d.id), max = d.costs.length, cost = harbourNextCost(meta.harbour, d.id);
      const pips = h("div.en-hb-pips", null, ...d.costs.map((_, i) => h(`i${i < lvl ? ".on" : ""}`)));
      const btn = cost === null
        ? h("button.tb-btn.small.ghost", { disabled: true }, "MAX")
        : h(`button.tb-btn.small.primary${meta.pearls >= cost ? "" : ".short"}`, { onclick: () => {
          if (meta.pearls < cost) { sfx.fail(); return; }
          meta.pearls -= cost;
          meta.harbour[d.id] = lvl + 1;
          writeMeta(meta);
          sfx.levelUp();
          render();
        } }, `Upgrade · ${cost} 🦪`);
      grid.append(h(`div.en-hb-item${lvl >= max ? ".maxed" : ""}`, null,
        h("span.en-offer-icon", null, d.icon),
        h("div.en-hb-body", null,
          h("div.en-hb-name", null, h("b", null, d.name), h("span.muted", null, ` ${lvl}/${max}`)),
          pips,
          h("p", null, lvl ? `Now: ${d.text(lvl)}` : "Not built yet"),
          lvl < max ? h("p.en-hb-next", null, `Next: ${d.text(lvl + 1)}`) : null,
        ),
        btn,
      ));
    }
    const sp = spent(meta.harbour);
    foot.innerHTML = "";
    foot.append(h("span.muted", null, `Built ${sp} / ${HARBOUR_TOTAL_COST} 🦪 · lifetime pearls ${meta.pearlsEarned}. Upgrades don't apply to the Daily Tide or a run already in progress.`));
    if (sp) foot.append(h("button.tb-btn.ghost.small", { title: "Refund every pearl you spent (to try another build)", onclick: () => {
      meta.pearls += sp; meta.harbour = {}; writeMeta(meta); sfx.coin(); render();
    } }, "↺ Refund all"));
  };
  const el = h("div.overlay.en-menu.en-harbour", { onclick: (e: MouseEvent) => { if (e.target === el) close(); } },
    h("div.modal", null,
      h("button.icon-btn.en-x", { onclick: close, title: "Close" }, "✕"),
      h("div.en-cash-k", null, "ENDLESS TIDE · PERMANENT UPGRADES"),
      h("h2", null, "⚓ Harbour"),
      h("p.sub", null, "Every run pays Pearls, win or lose: 1 per tide reached, +3 per boss, +10 for a win, more on higher Danger. Build up the harbour and set sail a little stronger."),
      h("div.en-hb-top", null, h("span", null, "Pearls"), bal),
      grid,
      foot,
    ),
  );
  root.append(el);
  window.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => el.classList.add("show"));
  render();
}
