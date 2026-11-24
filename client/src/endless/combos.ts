/**
 * Endless Tide: client side of rig evolutions and item combos (data + rules in shared/src/endless/evolutions.ts).
 * Discovery tracking (per run + meta save), the big reveal card, the shop offer hints, the ★ slot view and the
 * Almanac "Combos" tab.
 */
import {
  RIGS_BY_ID, TRINKETS_BY_ID, RIG_TIER_LABEL, COMBOS, EVOLUTIONS, EVOLVED_TIER_LABEL, EVOLVED_COLOR,
  activeCombos, evolve, evolutionOf, offerHints, itemName, itemIcon,
  type RunState, type RigSlot, type Offer, type EvolutionDef,
} from "@freek/shared";
import type { EndlessMode } from "./EndlessMode";
import { writeMeta, type EndlessMeta } from "./meta";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";

const TIER_COLORS = ["#b0b8c0", "#3fa9ff", "#b05cff", "#ff5a1f"];

/** name / icon / tier label / colour / description of a rig slot (evolved or not) */
export function slotView(s: RigSlot) {
  const d = RIGS_BY_ID[s.id], evo = evolutionOf(s);
  if (evo) return { name: evo.name, icon: evo.icon, tier: EVOLVED_TIER_LABEL, color: EVOLVED_COLOR, desc: evo.desc, evolved: true };
  return { name: d?.name ?? s.id, icon: d?.icon ?? "?", tier: RIG_TIER_LABEL[s.tier - 1], color: TIER_COLORS[s.tier - 1], desc: d ? d.desc(s.tier, d.power[s.tier - 1]) : "", evolved: false };
}

function discover(meta: EndlessMeta, id: string): boolean {
  const list = (meta.discoveries ??= []);
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

/** a big centred reveal card above every overlay (with a screen flash) */
export function showReveal(root: HTMLElement, o: { kicker: string; title: string; icon: string; text: string; sub?: string; color: string; fresh?: boolean; ms?: number }) {
  root.querySelector(".en-reveal")?.remove();
  const flash = h("div.en-reveal-flash", { style: `--rc:${o.color}` });
  const el = h("div.en-reveal", { style: `--rc:${o.color}` },
    h("div.en-reveal-k", null, o.kicker),
    h("div.en-reveal-icon", null, o.icon),
    h("div.en-reveal-t", null, o.title),
    o.sub ? h("div.en-reveal-sub", null, o.sub) : null,
    h("div.en-reveal-s", null, o.text),
    o.fresh ? h("div.en-reveal-new", null, "NEW · added to the Almanac") : null,
  );
  root.append(flash, el);
  requestAnimationFrame(() => el.classList.add("show"));
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 350); };
  el.addEventListener("click", close);
  setTimeout(close, o.ms ?? 2600);
  setTimeout(() => flash.remove(), 900);
}

/** watches the run for newly active combos (call check() after every shop change) */
export class ComboTracker {
  private known = new Set<string>();
  constructor(private m: EndlessMode) {
    for (const c of activeCombos(m.run)) this.known.add(c.id);
    // a resumed run: make sure the meta save has what is already active / evolved
    let dirty = false;
    for (const c of activeCombos(m.run)) dirty = discover(m.meta, c.id) || dirty;
    for (const s of m.run.rigs) if (s.evolved) dirty = discover(m.meta, s.evolved) || dirty;
    if (dirty) writeMeta(m.meta);
  }
  /** announce combos that became active for the first time this run */
  check() {
    const fresh = activeCombos(this.m.run).filter((c) => !this.known.has(c.id));
    if (!fresh.length) return;
    for (const c of fresh) this.known.add(c.id);
    const c = fresh[0];
    const isNew = discover(this.m.meta, c.id);
    for (const x of fresh.slice(1)) discover(this.m.meta, x.id);
    writeMeta(this.m.meta);
    sfx.catchJingle("epic");
    showReveal(this.m.g.ui, {
      kicker: "⚡ COMBO DISCOVERED", title: c.name, icon: c.icon, color: "#7fe8ff", fresh: isNew,
      sub: `${itemIcon(c.a)} ${itemName(c.a)} + ${itemIcon(c.b)} ${itemName(c.b)}`,
      text: c.text + (fresh.length > 1 ? ` (and ${fresh.length - 1} more: ${fresh.slice(1).map((x) => x.name).join(", ")})` : ""),
    });
  }
}

/** evolve a slot with the full juice; returns the evolution or null */
export function doEvolve(m: EndlessMode, uid: number): EvolutionDef | null {
  const slot = m.run.rigs.find((s) => s.uid === uid);
  const before = slot ? RIGS_BY_ID[slot.id]?.name : "";
  const evo = evolve(m.run, uid);
  if (!evo) return null;
  const isNew = discover(m.meta, evo.id);
  m.meta.stats.evolutions = (m.meta.stats.evolutions ?? 0) + 1;
  writeMeta(m.meta);
  sfx.catchJingle("legendary");
  m.g.feed.flash(EVOLVED_COLOR, 0.8);
  m.g.chase.shake(0.5);
  showReveal(m.g.ui, {
    kicker: "★ EVOLUTION", title: evo.name, icon: evo.icon, color: EVOLVED_COLOR, fresh: isNew, ms: 3400,
    sub: `${before} IV + ${TRINKETS_BY_ID[evo.trinket]?.icon ?? ""} ${TRINKETS_BY_ID[evo.trinket]?.name ?? evo.trinket}`,
    text: evo.desc,
  });
  return evo;
}

/** "⚡ combos with X you own" lines for a shop offer (html) */
export function offerHintHtml(run: RunState, meta: EndlessMeta, o: Offer): string {
  const found = new Set(meta.discoveries ?? []);
  return offerHints(run, o).map((x) => {
    const p = `${itemIcon(x.partner)} ${escapeHtml(itemName(x.partner))}`;
    if (x.kind === "combo") return `<p class="en-combo-hint">⚡ Combos with ${p} you own${found.has(x.combo.id) ? `: <b>${escapeHtml(x.combo.name)}</b>` : ": ???"}</p>`;
    const name = found.has(x.evo.id) ? escapeHtml(x.evo.name) : "???";
    return `<p class="en-combo-hint evo">★ ${x.ready ? "Evolves" : "Can evolve at Tier IV"} with ${p}${x.ready ? ` → <b>${name}</b>` : ""}</p>`;
  }).join("");
}

/** the Almanac "Combos" tab */
export function renderAlmanacCombos(body: HTMLElement, meta: EndlessMeta) {
  const found = new Set(meta.discoveries ?? []);
  const nEvo = EVOLUTIONS.filter((e) => found.has(e.id)).length, nCombo = COMBOS.filter((c) => found.has(c.id)).length;
  body.append(h("div.en-alm-count", null, `${nEvo} / ${EVOLUTIONS.length} evolutions · ${nCombo} / ${COMBOS.length} combos found`));
  body.append(h("div.en-side-h", null, "★ Evolutions"));
  for (const e of EVOLUTIONS) {
    const seen = found.has(e.id), rig = RIGS_BY_ID[e.rig];
    body.append(h(`div.en-alm-item${seen ? "" : ".unseen"}`, { style: `--rc:${EVOLVED_COLOR}` },
      h("span.en-offer-icon", null, seen ? e.icon : "❔"),
      h("div", null, h("b", null, seen ? `${e.name} ★` : "???"),
        h("p", null, seen ? `${rig?.icon ?? ""} ${rig?.name ?? e.rig} IV + ${TRINKETS_BY_ID[e.trinket]?.icon ?? ""} ${TRINKETS_BY_ID[e.trinket]?.name ?? e.trinket} · ${e.desc}` : `A Tier IV ${rig?.name ?? "rig"} and the right trinket…`))));
  }
  body.append(h("div.en-side-h", null, "⚡ Combos"));
  for (const c of COMBOS) {
    const seen = found.has(c.id);
    body.append(h(`div.en-alm-item${seen ? "" : ".unseen"}`, { style: "--rc:#7fe8ff" },
      h("span.en-offer-icon", null, seen ? c.icon : "❔"),
      h("div", null, h("b", null, seen ? c.name : "???"),
        h("p", null, seen ? `${itemIcon(c.a)} ${itemName(c.a)} + ${itemIcon(c.b)} ${itemName(c.b)} · ${c.text}` : "Two items that work better together. Own both to find out."))));
  }
}
