/**
 * Objective engine (§2): one main + two optional objectives per chapter, every ObjectiveKind type.
 * Counters advance on events; constraints (no_damage, under_time, …) hold until broken and are judged at the end.
 */
import { tierRank, CONSTRAINT_TYPES, type ObjectiveDef, type ObjectiveKind } from "@freek/shared";
import type { ProgressEvent } from "./progress";

export type ObjEvent =
  | ProgressEvent
  | { t: "reach"; pointId: string }
  | { t: "collect"; kind: string }
  | { t: "npc_arrive"; npcId: string; pointId: string }
  | { t: "npc_dead"; npcId: string }
  | { t: "lightning_hit" }
  // P3: hit by the Ice Leviathan's frost breath
  | { t: "frozen" };

export interface ObjCtx {
  elapsed: number;
  npcHpPct(id: string): number | undefined;
  warmthPct: number;
  /** P3: lantern fuel 0..1 (1 outside the Abyss Trench) */
  fuelPct?: number;
  storm: boolean;
  night: boolean;
  monstersAlive: number;
  /** fish caught but not banked yet (bank_fish display) */
  unbankedFish: number;
}

export type ObjState = "active" | "done" | "broken";
export interface ObjRuntime {
  def: ObjectiveDef;
  optional: boolean;
  progress: number;
  target: number;
  state: ObjState;
  /** per-type scratch data */
  data: { seen?: string[]; streak?: number; pending?: { clean: boolean }[]; parts?: ObjectiveEngine };
}

export function isConstraint(k: ObjectiveKind) { return CONSTRAINT_TYPES.includes(k.type); }

export function targetOf(k: ObjectiveKind): number {
  switch (k.type) {
    case "catch_count": case "catch_tier": case "catch_species": case "catch_weight_range": case "perfect_reel": case "streak":
    case "harpoon_hits": case "kill": case "collect": case "bank_points_trip": case "bank_fish": return k.n;
    case "bank_any": return k.n ?? 1;
    case "defend": case "survive": return k.seconds;
    case "all": return k.parts.length;
    default: return 1;
  }
}

const fmtT = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export class ObjectiveEngine {
  readonly items: ObjRuntime[];
  /** fired when an objective becomes done or broken */
  onChange: ((o: ObjRuntime) => void) | null = null;

  constructor(main: ObjectiveDef, optional: ObjectiveDef[]) {
    this.items = [main, ...optional].map((def, i) => ({ def, optional: i > 0, progress: 0, target: targetOf(def.kind), state: "active", data: {} }));
    // P3 "all": the parts run in a child engine; the parent is done when every part is done, broken when one breaks
    for (const o of this.items) {
      const k = o.def.kind;
      if (k.type !== "all") continue;
      const defs = k.parts.map((p, j) => ({ id: `${o.def.id}_${j}`, title: o.def.title, kind: p }));
      o.data.parts = new ObjectiveEngine(defs[0], defs.slice(1));
    }
  }
  private syncAll(o: ObjRuntime) {
    const c = o.data.parts;
    if (!c || o.state !== "active") return;
    if (c.items.some((p) => p.state === "broken")) { this.set(o, "broken"); return; }
    o.progress = c.items.filter((p) => p.state === "done").length;
    if (o.progress >= o.target) this.set(o, "done");
  }
  get main() { return this.items[0]; }
  get mainDone() { return this.main.state === "done"; }
  get mainBroken() { return this.main.state === "broken"; }

  private set(o: ObjRuntime, state: ObjState) {
    if (o.state !== "active") return;
    o.state = state;
    if (state === "done") o.progress = o.target;
    this.onChange?.(o);
  }
  private add(o: ObjRuntime, n = 1) {
    if (o.state !== "active") return;
    o.progress = Math.min(o.target, o.progress + n);
    if (o.progress >= o.target) this.set(o, "done");
  }

  event(ev: ObjEvent, ctx: ObjCtx) {
    for (const o of this.items) {
      if (o.state !== "active") continue;
      const k = o.def.kind;
      switch (k.type) {
        case "catch_count": if (ev.t === "catch") this.add(o); break;
        case "catch_tier": if (ev.t === "catch" && tierRank(ev.card.tier) >= tierRank(k.tier)) this.add(o); break;
        case "catch_species":
          if (ev.t === "catch" && k.ids.includes(ev.card.speciesId)) {
            if (k.distinct) { const seen = (o.data.seen ??= []); if (!seen.includes(ev.card.speciesId)) { seen.push(ev.card.speciesId); this.add(o); } }
            else this.add(o);
          }
          break;
        case "catch_weight_range":
          if (ev.t === "catch" && (!k.speciesId || ev.card.speciesId === k.speciesId) && ev.card.weightKg >= k.minKg - 1e-6 && ev.card.weightKg <= k.maxKg + 1e-6) this.add(o);
          break;
        case "bank_points_trip": if (ev.t === "bank" && ev.points >= o.progress) { o.progress = Math.min(k.n, ev.points); if (ev.points >= k.n) this.set(o, "done"); } break;
        case "bank_any": if (ev.t === "bank" && ev.fish > 0) this.add(o); break;
        case "bank_fish": if (ev.t === "bank" && ev.fish > 0) this.add(o, ev.fish); break;
        case "bank_species": {
          const pend = (o.data.pending ??= []);
          if (ev.t === "catch" && k.ids.includes(ev.card.speciesId)) pend.push({ clean: true });
          else if (ev.t === "damage") pend.forEach((p) => (p.clean = false));
          else if (ev.t === "sink") pend.length = 0;
          else if (ev.t === "bank" && (ev.cards ?? []).some((c) => k.ids.includes(c.speciesId))) {
            if (!k.noDamage || pend.some((p) => p.clean)) this.set(o, "done");
            else if (k.noDamage) this.set(o, "broken");
            pend.length = 0;
          }
          break;
        }
        case "perfect_reel": if (ev.t === "catch" && ev.perfect) this.add(o); break;
        case "streak":
          if (ev.t === "catch") { o.data.streak = (o.data.streak ?? 0) + 1; o.progress = Math.min(k.n, o.data.streak); if (o.data.streak >= k.n) this.set(o, "done"); }
          else if (ev.t === "snap") { o.data.streak = 0; o.progress = 0; }
          break;
        case "harpoon_hits": if (ev.t === "hit") this.add(o); break;
        case "kill":
          if (ev.t === "kill" && (k.target === "monster" ? !ev.boss : k.target === "boss" ? !!ev.boss : ev.kind === k.target)) this.add(o);
          break;
        case "reach": if (ev.t === "reach" && ev.pointId === k.pointId) this.set(o, "done"); break;
        case "collect": if (ev.t === "collect" && ev.kind === k.itemKind) this.add(o); break;
        case "escort":
          if (ev.t === "npc_dead" && ev.npcId === k.npcId) this.set(o, "broken");
          else if (ev.t === "npc_arrive" && ev.npcId === k.npcId && ev.pointId === k.toPointId) this.set(o, "done");
          break;
        case "defend": if (ev.t === "npc_dead" && ev.npcId === k.npcId) this.set(o, "broken"); break;
        case "no_damage": if (ev.t === "damage") this.set(o, "broken"); break;
        case "no_snap": if (ev.t === "snap") this.set(o, "broken"); break;
        case "no_sink": if (ev.t === "sink") this.set(o, "broken"); break;
        case "no_lightning_hits": if (ev.t === "lightning_hit") this.set(o, "broken"); break;
        case "no_frozen": if (ev.t === "frozen") this.set(o, "broken"); break;
        case "all": o.data.parts?.event(ev, ctx); this.syncAll(o); break;
        default: break;
      }
    }
  }

  /** time-based objectives */
  tick(dt: number, ctx: ObjCtx) {
    for (const o of this.items) {
      if (o.state !== "active") continue;
      const k = o.def.kind;
      switch (k.type) {
        case "defend": {
          const hp = ctx.npcHpPct(k.npcId);
          if (hp === undefined || hp <= 0) { this.set(o, "broken"); break; }
          if (k.minHpPct !== undefined && hp < k.minHpPct) { this.set(o, "broken"); break; }
          this.add(o, dt);
          break;
        }
        case "escort": {
          const hp = ctx.npcHpPct(k.npcId);
          if (k.minHpPct !== undefined && hp !== undefined && hp < k.minHpPct) this.set(o, "broken");
          break;
        }
        case "survive": {
          const ok = !k.condition || (k.condition === "storm" ? ctx.storm : k.condition === "night" ? ctx.night : ctx.monstersAlive > 0);
          if (ok) this.add(o, dt);
          break;
        }
        case "under_time": if (ctx.elapsed > k.seconds) this.set(o, "broken"); break;
        case "warmth_above": if (ctx.warmthPct < k.pct) this.set(o, "broken"); break;
        case "fuel_above": if ((ctx.fuelPct ?? 1) <= k.pct) this.set(o, "broken"); break;
        case "all": o.data.parts?.tick(dt, ctx); this.syncAll(o); break;
        default: break;
      }
    }
  }

  /** chapter end: constraints that held count as done */
  finalize() {
    for (const o of this.items) if (o.state === "active" && isConstraint(o.def.kind)) { o.state = "done"; o.progress = o.target; }
  }
  get stars() { return this.items.filter((o) => o.state === "done").length; }

  /** tracker text for the HUD */
  numText(o: ObjRuntime, ctx: ObjCtx): string {
    const k = o.def.kind;
    if (o.state === "broken") return "✘";
    if (isConstraint(k)) return k.type === "under_time" ? fmtT(k.seconds - ctx.elapsed) : o.state === "done" ? "✔" : "✔ holding";
    if (o.state === "done") return "✔";
    if (k.type === "defend" || k.type === "survive") return `${fmtT(o.progress)} / ${fmtT(o.target)}`;
    if (k.type === "bank_fish") return `${o.progress}/${o.target}${ctx.unbankedFish ? ` · ${ctx.unbankedFish} in bag` : ""}`;
    if (k.type === "all" && o.data.parts) { const c = o.data.parts; return c.items.map((p) => (p.state === "done" ? "✔" : c.numText(p, ctx))).join(" · "); }
    if (k.type === "escort") { const hp = ctx.npcHpPct(k.npcId); return hp === undefined ? "" : `${Math.round(hp * 100)}% hp`; }
    if (o.target <= 1) return "0/1";
    return `${Math.floor(o.progress)}/${o.target}`;
  }
}
