/**
 * P4 Bounty Board runtime: the region's 3 posted bounties (saved), the accepted one running on its own ObjectiveEngine
 * in free roam (between chapters / Free Play), its optional time limit, payout, refresh and coin reroll.
 */
import { generateBoard, generateBounty, bountyRerollCost, getRegion, type BountyDef, type MaterialId, type RegionId, type ZoneId, type MissionS } from "@freek/shared";
import { ObjectiveEngine, type ObjCtx, type ObjEvent } from "./objectives";
import type { BountyBoardSave, SoloSave } from "./save";

export interface BountyEnv {
  save: SoloSave;
  region: RegionId;
  zones(): ZoneId[];
  level(): number;
  coins(): number;
  spend(n: number): void;
  pay(coins: number, xp: number, mats: Partial<Record<MaterialId, number>>): void;
  ctx(): ObjCtx;
  toast(html: string, cls?: string): void;
  persist(): void;
  /** stat bump for achievements */
  bump(stat: string): void;
}

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export class BountyRunner {
  engine: ObjectiveEngine | null = null;
  elapsed = 0;
  /** fired when a bounty is finished (UI refresh) */
  onChange: (() => void) | null = null;

  constructor(private env: BountyEnv) {
    const b = this.board;
    if (b.active && !b.list.some((x) => x.id === b.active)) b.active = null;
    if (b.active) this.startEngine();
  }

  get board(): BountyBoardSave {
    const s = this.env.save;
    const all = (s.bounties ??= {});
    let b = all[this.env.region];
    if (!b || b.list.length < 3) {
      b = { list: b?.list ?? [], active: b?.active ?? null, seq: b?.seq ?? 1, done: b?.done ?? 0 };
      while (b.list.length < 3) b.list.push(this.fresh(b, b.list));
      all[this.env.region] = b;
    }
    return b;
  }
  get active(): BountyDef | null { const b = this.board; return b.list.find((x) => x.id === b.active) ?? null; }
  get rerollCost() { return bountyRerollCost(getRegion(this.env.region)?.act ?? 1); }

  private fresh(b: BountyBoardSave, others: BountyDef[]): BountyDef {
    const ctx = { region: this.env.region, level: this.env.level(), gear: this.env.save.gear, zones: this.env.zones(), seq: b.seq };
    let d = generateBounty(ctx);
    for (let i = 0; i < 8 && others.some((o) => o.kind.type === d.kind.type); i++) { b.seq++; d = generateBounty({ ...ctx, seq: b.seq }); }
    b.seq++;
    return d;
  }

  accept(id: string) {
    const b = this.board;
    if (!b.list.some((x) => x.id === id)) return;
    b.active = id;
    this.startEngine();
    const d = this.active!;
    this.env.toast(`<b>📜 Bounty accepted:</b> ${d.title}${d.timeLimit ? ` · ⏳ ${fmt(d.timeLimit)}` : ""}`, "good");
    this.env.persist();
  }
  abandon() { this.board.active = null; this.engine = null; this.env.persist(); this.onChange?.(); }

  /** replace one posted bounty (coin reroll); returns false if not affordable */
  reroll(id: string): boolean {
    const b = this.board, cost = this.rerollCost;
    const i = b.list.findIndex((x) => x.id === id);
    if (i < 0 || this.env.coins() < cost) return false;
    this.env.spend(cost);
    if (b.active === id) { b.active = null; this.engine = null; }
    b.list[i] = this.fresh(b, b.list.filter((_, j) => j !== i));
    this.env.persist();
    return true;
  }
  /** debug / balance: a full new board */
  refreshAll() {
    const b = this.board;
    b.list = generateBoard({ region: this.env.region, level: this.env.level(), gear: this.env.save.gear, zones: this.env.zones(), seq: b.seq });
    b.seq += 20; b.active = null; this.engine = null;
    this.env.persist();
  }

  private startEngine() {
    const d = this.active;
    if (!d) { this.engine = null; return; }
    this.elapsed = 0;
    this.engine = new ObjectiveEngine({ id: d.id, title: d.title, kind: d.kind }, []);
    this.engine.onChange = (o) => { if (o.state === "done") this.complete(); };
  }

  /** objective events (only while in free roam) */
  event(ev: ObjEvent) { this.engine?.event(ev, this.env.ctx()); }
  tick(dt: number) {
    const e = this.engine, d = this.active;
    if (!e || !d) return;
    this.elapsed += dt;
    e.tick(dt, this.env.ctx());
    if (d.timeLimit && this.elapsed >= d.timeLimit && this.engine) {
      this.engine = null;
      this.board.active = null;
      this.env.toast(`<b>⏳ Bounty failed:</b> ${d.title} ran out of time. It is still on the board.`, "bad");
      this.env.persist();
      this.onChange?.();
    }
  }

  private complete() {
    const d = this.active, b = this.board;
    if (!d) return;
    this.engine = null;
    b.active = null;
    b.done++;
    const i = b.list.findIndex((x) => x.id === d.id);
    if (i >= 0) b.list[i] = this.fresh(b, b.list.filter((_, j) => j !== i));
    this.env.pay(d.reward.coins, d.reward.xp, d.reward.mats);
    this.env.toast(`<b>📜 Bounty complete: ${d.title}</b> · +${d.reward.coins} ● · +${d.reward.xp} XP`, "good");
    this.env.bump("bounties");
    this.env.persist();
    this.onChange?.();
  }

  /** HUD tracker rows (free roam) */
  trackerItems(): (MissionS & { optional?: boolean; state?: string; numText?: string })[] {
    const e = this.engine, d = this.active;
    if (!e || !d) return [];
    const o = e.main, c = this.env.ctx();
    const t = d.timeLimit ? ` · ⏳ ${fmt(d.timeLimit - this.elapsed)}` : "";
    return [{ id: `bounty_${d.id}`, title: `📜 ${d.title}: ${describe(d)}`, progress: Math.floor(o.progress), target: o.target, squad: false, optional: false, state: o.state, numText: e.numText(o, c) + t }];
  }
}

/** one-line objective text for the board and tracker */
export function describe(d: BountyDef): string {
  const k = d.kind;
  switch (k.type) {
    case "catch_count": return `catch ${k.n} fish`;
    case "catch_tier": return `catch ${k.n} ${k.tier === "rare" ? "Rare" : k.tier === "gold" ? "Gold" : k.tier === "epic" ? "Epic" : k.tier}-or-better fish`;
    case "catch_species": return `catch ${k.n > 1 ? `${k.n} × ` : ""}${d.title.replace(/^Wanted: /, "")}`;
    case "catch_weight_range": return `land one between ${k.minKg} and ${k.maxKg} kg`;
    case "bank_points_trip": return `bank ${k.n} points in one trip`;
    case "perfect_reel": return `land ${k.n} perfect reels`;
    case "streak": return `a streak of ${k.n} landings`;
    case "kill": return `slay ${k.n} sea monster${k.n > 1 ? "s" : ""}`;
    case "harpoon_hits": return `land ${k.n} harpoon hits`;
    default: return d.title;
  }
}
