/**
 * Endless Tide rig evolutions and item combos (pure data + rules, no DOM).
 * - Evolution: a Tier IV rig + a specific trinket → a legendary "★" rig (RigSlot.evolved = evolution id).
 * - Combo: two owned items (rig/trinket) → a hidden named bonus (stats, specials, or a behaviour flag read by the client).
 */
import { RIGS_BY_ID, TRINKETS_BY_ID, MAX_RIG_TIER, type Stats, type TrinketSpecial } from "./data.js";
import type { Tier } from "../fish.js";
import { rigPrice, type RunState, type RigSlot, type Offer } from "./rules.js";

// ------------------------------------------------------------------------------------------------ evolutions
export interface EvolutionDef {
  id: string;
  /** base rig (must be Tier IV) */
  rig: string;
  /** trinket that must be owned */
  trinket: string;
  name: string; icon: string; desc: string;
  /** power × (damage, fish per action, …) */
  powerMult: number;
  /** cooldown × (smaller = faster) */
  cdMult: number;
  /** reach × */
  rangeMult: number;
  /** extra targets per activation (harpoon pierce, drone zaps, net schools) */
  extraTargets?: number;
  /** extra chain jumps */
  jumps?: number;
  /** seconds of slow on every hit */
  slow?: number;
  /** blast radius × (explosives) */
  radiusMult?: number;
  /** extra fish stunned per school hit (explosives) */
  stunFish?: number;
  /** catches are at least this tier */
  minTier?: Tier;
}

export const EVOLUTIONS: EvolutionDef[] = [
  { id: "midas_rod", rig: "bobber", trinket: "golden_hook", name: "Midas Rod", icon: "🌟", powerMult: 1, cdMult: 0.85, rangeMult: 1.2, minTier: "rare",
    desc: "Casts faster and never hooks a Common: every fish is Rare or better." },
  { id: "gatling_harpoon", rig: "harpoongun", trinket: "trigger_finger", name: "Gatling Harpoon", icon: "🚀", powerMult: 0.8, cdMult: 0.5, rangeMult: 1.1, extraTargets: 1,
    desc: "A hail of harpoons: fires twice as fast (80% damage each) and pierces one extra monster." },
  { id: "kraken_net", rig: "castnet", trinket: "net_floats", name: "Kraken Net", icon: "🐙", powerMult: 1.6, cdMult: 0.8, rangeMult: 1.5, extraTargets: 1,
    desc: "Eight-armed net: grabs the two nearest schools at once, bags 60% more and reaches 50% further." },
  { id: "tsunami_charge", rig: "charge", trinket: "overclock_gear", name: "Tsunami Charge", icon: "🌊", powerMult: 1.25, cdMult: 0.85, rangeMult: 1.2, radiusMult: 1.35, stunFish: 2,
    desc: "A wall of water: 25% more damage, faster, a blast 35% wider, and 2 more stunned fish per school." },
  { id: "storm_chain", rig: "chain", trinket: "kraken_ink", name: "Storm Chain", icon: "🌩", powerMult: 1.25, cdMult: 0.9, rangeMult: 1.15, jumps: 1, slow: 1.5,
    desc: "Lightning in a chain: +25% damage, faster, 1 more jump, and every hit slows the monster for 1.5 s." },
  { id: "twin_drones", rig: "drone", trinket: "abyss_lantern", name: "Twin Drones", icon: "🛸", powerMult: 1.1, cdMult: 1, rangeMult: 1.4, extraTargets: 1,
    desc: "A second drone joins the orbit: two zaps per pulse at 40% more reach." },
];
export const EVOLUTIONS_BY_ID: Record<string, EvolutionDef> = Object.fromEntries(EVOLUTIONS.map((e) => [e.id, e]));
export const EVOLVED_TIER_LABEL = "★";
export const EVOLVED_COLOR = "#ffd24a";

/** the evolution of an evolved slot */
export function evolutionOf(slot: RigSlot): EvolutionDef | undefined { return slot.evolved ? EVOLUTIONS_BY_ID[slot.evolved] : undefined; }
/** the evolution a rig can become (whatever its tier) */
export function evolutionForRig(rigId: string): EvolutionDef | undefined { return EVOLUTIONS.find((e) => e.rig === rigId); }
/** the run already has this ★ rig (each evolution exists once per run) */
export function hasEvolution(run: RunState, evoId: string) { return run.rigs.some((s) => s.evolved === evoId); }
/** coins to evolve a slot: 1.5× the price of another Tier IV of that rig at this tide (priced as at least a 40-coin rig) */
export function evolveCost(run: RunState, slot: RigSlot) {
  const base = RIGS_BY_ID[slot.id]?.price ?? 40;
  return Math.round(rigPrice(slot.id, MAX_RIG_TIER, run.tide) * 1.5 * Math.max(1, 40 / base));
}
/** slots that can evolve (Tier IV, the trinket owned, that evolution not in the run yet); `cost` in coins */
export function evolvable(run: RunState): { slot: RigSlot; evo: EvolutionDef; cost: number }[] {
  const out: { slot: RigSlot; evo: EvolutionDef; cost: number }[] = [];
  for (const slot of run.rigs) {
    if (slot.evolved || slot.tier < MAX_RIG_TIER) continue;
    const evo = evolutionForRig(slot.id);
    if (evo && (run.trinkets[evo.trinket] ?? 0) > 0 && !hasEvolution(run, evo.id) && !out.some((x) => x.evo.id === evo.id)) out.push({ slot, evo, cost: evolveCost(run, slot) });
  }
  return out;
}
/** evolve a slot (pays evolveCost; the trinket is kept); returns the evolution or null */
export function evolve(run: RunState, uid: number): EvolutionDef | null {
  const hit = evolvable(run).find((x) => x.slot.uid === uid);
  if (!hit || run.coins < hit.cost) return null;
  run.coins -= hit.cost;
  hit.slot.evolved = hit.evo.id;
  return hit.evo;
}
/** display name / icon / tier label of a slot */
export function slotName(slot: RigSlot) { return evolutionOf(slot)?.name ?? RIGS_BY_ID[slot.id]?.name ?? slot.id; }
export function slotIcon(slot: RigSlot) { return evolutionOf(slot)?.icon ?? RIGS_BY_ID[slot.id]?.icon ?? "?"; }

// ------------------------------------------------------------------------------------------------ combos
export type ItemRef = { kind: "rig" | "trinket"; id: string };
/** behaviour flags read by the client (EndlessMode) */
export type ComboFlag = "inkChain" | "blastFishing";
export interface ComboDef {
  id: string; name: string; icon: string;
  a: ItemRef; b: ItemRef;
  text: string;
  stats?: Partial<Stats>;
  special?: Partial<Record<TrinketSpecial, number>>;
  flag?: ComboFlag;
}
const R = (id: string): ItemRef => ({ kind: "rig", id });
const T = (id: string): ItemRef => ({ kind: "trinket", id });

export const COMBOS: ComboDef[] = [
  { id: "ink_chain", name: "Ink-Stained Links", icon: "⛓", a: R("chain"), b: T("kraken_ink"), flag: "inkChain", text: "Chain Harpoon hits slow monsters for 1 s." },
  { id: "chum_net", name: "Chum Line", icon: "🪣", a: R("chum"), b: R("castnet"), special: { netPlus: 2 }, text: "Nets bag +2 fish." },
  { id: "gilded_haul", name: "Gilded Haul", icon: "👑", a: T("golden_hook"), b: T("coral_crown"), stats: { haul: 15 }, text: "+15% Haul." },
  { id: "deadeye", name: "Deadeye", icon: "🎯", a: R("harpoongun"), b: T("sharks_tooth"), special: { crit: 0.1 }, text: "+10% critical hit chance." },
  { id: "blast_fishing", name: "Blast Fishing", icon: "💥", a: R("charge"), b: T("bait_box"), flag: "blastFishing", text: "Depth Charges stun 2 more fish per school." },
  { id: "salvage_crew", name: "Salvage Crew", icon: "🧷", a: T("bilge_pump"), b: T("loot_hook"), stats: { magnet: 3 }, special: { spillGuard: 0.25 }, text: "+3 Magnet and monster hits spill 25% fewer fish." },
  { id: "lucky_stars", name: "Written in the Stars", icon: "🌠", a: T("lucky_bobber"), b: T("star_chart"), stats: { luck: 10, maxHp: 8 }, text: "+10 Luck, and the Star Chart's HP cost is paid back." },
  { id: "iron_keel", name: "Iron Keel", icon: "⚓", a: T("rusty_anchor"), b: T("iron_bow"), stats: { armor: 4, speed: 6 }, text: "+4 Armor and the anchor no longer drags (+6% Speed)." },
  { id: "overdrive", name: "Overdrive", icon: "⚡", a: T("overclock_gear"), b: T("tackle_box"), stats: { engineering: 10, armor: 3 }, text: "+10% Engineering and the gear's armor cost shrinks (+3 Armor)." },
  { id: "double_books", name: "Double Books", icon: "📚", a: T("pirate_ledger"), b: T("merchants_ledger"), special: { interestCap: 15 }, stats: { interest: 5 }, text: "+5% Interest and the interest cap +15." },
];
export const COMBOS_BY_ID: Record<string, ComboDef> = Object.fromEntries(COMBOS.map((c) => [c.id, c]));

const owns = (run: RunState, r: ItemRef) => (r.kind === "rig" ? run.rigs.some((s) => s.id === r.id) : (run.trinkets[r.id] ?? 0) > 0);
export function itemName(r: ItemRef) { return r.kind === "rig" ? RIGS_BY_ID[r.id]?.name ?? r.id : TRINKETS_BY_ID[r.id]?.name ?? r.id; }
export function itemIcon(r: ItemRef) { return r.kind === "rig" ? RIGS_BY_ID[r.id]?.icon ?? "?" : TRINKETS_BY_ID[r.id]?.icon ?? "?"; }

/** combos active in this run */
export function activeCombos(run: RunState): ComboDef[] { return COMBOS.filter((c) => owns(run, c.a) && owns(run, c.b)); }
/** combo stat/special bonuses (added by computeStats) */
export function comboBonuses(run: RunState): { stats: Partial<Stats>; special: Partial<Record<TrinketSpecial, number>> } {
  const stats: Partial<Stats> = {}, special: Partial<Record<TrinketSpecial, number>> = {};
  for (const c of activeCombos(run)) {
    for (const [k, v] of Object.entries(c.stats ?? {})) stats[k as keyof Stats] = (stats[k as keyof Stats] ?? 0) + (v as number);
    for (const [k, v] of Object.entries(c.special ?? {})) special[k as TrinketSpecial] = (special[k as TrinketSpecial] ?? 0) + (v as number);
  }
  return { stats, special };
}
export function hasComboFlag(run: RunState, flag: ComboFlag) { return activeCombos(run).some((c) => c.flag === flag); }

export type OfferHint =
  | { kind: "combo"; combo: ComboDef; partner: ItemRef }
  | { kind: "evolve"; evo: EvolutionDef; partner: ItemRef; ready: boolean };
/** what buying this offer would complete (combos not yet active, evolutions not yet done) */
export function offerHints(run: RunState, o: Offer): OfferHint[] {
  const ref: ItemRef = { kind: o.kind, id: o.id };
  const out: OfferHint[] = [];
  if (!owns(run, ref)) {
    for (const c of COMBOS) {
      const self = c.a.kind === ref.kind && c.a.id === ref.id ? c.a : c.b.kind === ref.kind && c.b.id === ref.id ? c.b : null;
      if (!self) continue;
      const partner = self === c.a ? c.b : c.a;
      if (owns(run, partner)) out.push({ kind: "combo", combo: c, partner });
    }
  }
  if (o.kind === "trinket" && !(run.trinkets[o.id] ?? 0)) {
    for (const e of EVOLUTIONS) {
      if (e.trinket !== o.id || hasEvolution(run, e.id)) continue;
      const slot = run.rigs.find((s) => s.id === e.rig && !s.evolved);
      if (slot) out.push({ kind: "evolve", evo: e, partner: R(e.rig), ready: slot.tier >= MAX_RIG_TIER });
    }
  } else if (o.kind === "rig") {
    const e = evolutionForRig(o.id);
    if (e && (run.trinkets[e.trinket] ?? 0) > 0 && !hasEvolution(run, e.id)) {
      const twin = run.rigs.some((s) => s.id === o.id && s.tier === o.tier && s.tier === MAX_RIG_TIER - 1);
      out.push({ kind: "evolve", evo: e, partner: T(e.trinket), ready: o.tier >= MAX_RIG_TIER || twin });
    }
  }
  return out;
}
