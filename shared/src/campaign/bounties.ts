/**
 * P4 Bounty Board (§8): three procedurally generated challenges per region, built from objective-engine kinds that
 * work in free roam (no markers, pickups or NPCs). Parameters scale with the region (act), the player's gear and level
 * and the zones open in free roam. Pure: the client and the balance script share it.
 */
import { TIERS, TIER_INFO, ZONE_TIER_BONUS, tierRank, type Tier } from "../fish.js";
import type { ZoneId } from "../constants.js";
import { getRegion, speciesOfRegion } from "./registry.js";
import type { CampaignSpecies, GearSlot, MaterialId, ObjectiveKind, RegionId } from "./types.js";

export interface BountyDef {
  id: string;
  region: RegionId;
  title: string;
  /** flavour line on the board */
  blurb: string;
  kind: ObjectiveKind;
  /** seconds (optional): the bounty is failed if it runs out */
  timeLimit?: number;
  /** rough minutes a decent player needs (shown on the board, used by the balance script) */
  estSeconds: number;
  reward: { coins: number; xp: number; mats: Partial<Record<MaterialId, number>> };
  /** 1 easy .. 3 hard (board stars) */
  difficulty: 1 | 2 | 3;
}

export interface BountyCtx {
  region: RegionId;
  level: number;
  gear: Record<GearSlot, number>;
  /** zones open in free roam */
  zones: ZoneId[];
  seq: number;
  rng?: () => number;
}

/** coin reroll price by act */
export const bountyRerollCost = (act: number) => 20 + act * 15;

const plainSpecies = (r: RegionId, zones: ZoneId[]) =>
  speciesOfRegion(r).filter((s) => !s.conditions || !Object.keys(s.conditions).length).filter((s) => s.zones.some((z) => zones.includes(z)));

/** chance that a bite in the best open zone is `tier` or better (same weights as campaignRoll) */
export function tierOdds(zones: ZoneId[], rodTier: number, level: number, tier: Tier): number {
  const rare = [0, 0.08, 0.16, 0.26, 0.4][Math.max(1, Math.min(5, rodTier)) - 1];
  let best = 0;
  for (const z of zones) {
    const w = TIERS.map((t) => { let v = TIER_INFO[t].weight * (ZONE_TIER_BONUS[z][t] ?? 1); if (t !== "common") v *= 1 + rare + 0.02 * (level - 1); return v; });
    const tot = w.reduce((a, b) => a + b, 0);
    best = Math.max(best, w.slice(tierRank(tier)).reduce((a, b) => a + b, 0) / tot);
  }
  return best;
}

/** seconds per bite cycle (cast, wait, hook, reel) for a decent player */
export const SECONDS_PER_FISH = 32;

type Gen = (c: Required<BountyCtx>, act: number, pool: CampaignSpecies[]) => Omit<BountyDef, "id" | "region" | "reward" | "difficulty"> & { weight: number } | null;

const pick = <T>(rng: () => number, a: T[]) => a[Math.floor(rng() * a.length)];
const ri = (rng: () => number, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

const GENS: Gen[] = [
  // catch n fish
  (c, act) => { const n = ri(c.rng, 4, 6 + Math.min(3, act)); return { title: `Fill the Hold`, blurb: "The fish market wants volume.", kind: { type: "catch_count", n }, estSeconds: n * SECONDS_PER_FISH, weight: 1 }; },
  // catch n of a tier or better
  (c, act) => {
    const tiers: Tier[] = act >= 4 || c.gear.rod >= 4 ? ["rare", "gold", "epic"] : act >= 2 || c.gear.rod >= 2 ? ["rare", "gold"] : ["rare"];
    const tier = pick(c.rng, tiers);
    const p = Math.max(0.03, tierOdds(c.zones, c.gear.rod, c.level, tier));
    const n = Math.max(1, Math.min(tier === "epic" ? 1 : 3, Math.round((140 + act * 20) / (SECONDS_PER_FISH / p))));
    return { title: `${TIER_INFO[tier].label} Order`, blurb: `A collector pays well for ${TIER_INFO[tier].label.toLowerCase()} fish.`, kind: { type: "catch_tier", tier, n }, estSeconds: Math.round((n * SECONDS_PER_FISH) / p), weight: 1.2 };
  },
  // a specific (unconditioned) species
  (c, act, pool) => {
    const opts = pool.filter((s) => tierRank(s.tier) <= (act >= 3 ? 3 : 2) && s.tier !== "legendary");
    if (!opts.length) return null;
    const s = pick(c.rng, opts);
    const same = pool.filter((x) => x.tier === s.tier).length;
    const p = Math.max(0.02, (tierOdds(c.zones, c.gear.rod, c.level, s.tier) - (tierRank(s.tier) < 4 ? tierOdds(c.zones, c.gear.rod, c.level, TIERS[tierRank(s.tier) + 1]) : 0)) / Math.max(1, same));
    const n = s.tier === "common" ? 2 : 1;
    return { title: `Wanted: ${s.name}`, blurb: "A cook in town has a very specific recipe.", kind: { type: "catch_species", ids: [s.id], n }, estSeconds: Math.round((n * SECONDS_PER_FISH) / p), weight: 1.2 };
  },
  // a weight window for one species
  (c, _act, pool) => {
    const opts = pool.filter((s) => tierRank(s.tier) <= 1 && s.maxKg - s.minKg >= 0.8);
    if (!opts.length) return null;
    const s = pick(c.rng, opts);
    const span = s.maxKg - s.minKg;
    // weights skew low (k^1.8): put the window in the lower 60% of the range, 30% of the span wide
    const lo = Math.round((s.minKg + span * (0.1 + c.rng() * 0.3)) * 10) / 10;
    const hi = Math.round((lo + span * 0.3) * 10) / 10;
    const pw = Math.pow((hi - s.minKg) / span, 1 / 1.8) - Math.pow((lo - s.minKg) / span, 1 / 1.8);
    const same = pool.filter((x) => x.tier === s.tier).length;
    const p = Math.max(0.03, tierOdds(c.zones, c.gear.rod, c.level, s.tier) / Math.max(1, same) * pw * (s.tier === "common" ? 0.7 : 0.25));
    return { title: `Prize ${s.name}`, blurb: `A ${lo}–${hi} kg specimen for the harbour scales.`, kind: { type: "catch_weight_range", speciesId: s.id, minKg: lo, maxKg: hi, n: 1 }, estSeconds: Math.round(SECONDS_PER_FISH / p), weight: 0.8 };
  },
  // bank a big trip
  (c, act) => {
    const n = Math.round((60 + act * 70 + c.gear.rod * 25) / 10) * 10;
    return { title: "Heavy Haul", blurb: "Bring in one big trip without sinking.", kind: { type: "bank_points_trip", n }, estSeconds: 150 + act * 20, weight: 1 };
  },
  // perfect reels
  (c) => { const n = ri(c.rng, 2, 3); return { title: "Clean Hands", blurb: "Land fish without ever going above half tension.", kind: { type: "perfect_reel", n }, estSeconds: n * SECONDS_PER_FISH * 1.8, weight: 0.9 }; },
  // streak
  (c, act) => { const n = ri(c.rng, 4, 5 + Math.min(3, act)); return { title: "Unbroken Line", blurb: "Land fish in a row without a snap.", kind: { type: "streak", n }, estSeconds: Math.round(n * SECONDS_PER_FISH * 1.25), weight: 0.9 }; },
  // monsters (only once the reef is open: that's where they spawn)
  (c, act) => {
    if (!c.zones.includes("reef") && !c.zones.includes("abyss")) return null;
    const n = act >= 3 ? 2 : 1;
    return { title: "Pest Control", blurb: "Something has been tearing the nets. Hunt it down.", kind: { type: "kill", target: "monster", n }, estSeconds: 110 * n, weight: 0.8 };
  },
  (c) => {
    if (!c.zones.includes("reef") && !c.zones.includes("abyss")) return null;
    const n = ri(c.rng, 6, 10);
    return { title: "Harpoon Drill", blurb: "The harbour guard wants a marksman.", kind: { type: "harpoon_hits", n }, estSeconds: 100 + n * 6, weight: 0.6 };
  },
];

export function generateBounty(ctx: BountyCtx): BountyDef {
  const c: Required<BountyCtx> = { rng: Math.random, ...ctx } as Required<BountyCtx>;
  const region = getRegion(c.region);
  const act = region?.act ?? 1;
  const pool = plainSpecies(c.region, c.zones);
  // drop anything a decent player can't finish in ~10 minutes with the current gear (e.g. a rare weight window)
  let options = GENS.map((g) => g(c, act, pool)).filter((x): x is NonNullable<typeof x> => !!x);
  const fit = options.filter((o) => o.estSeconds <= 600);
  if (fit.length) options = fit;
  const tot = options.reduce((a, o) => a + o.weight, 0);
  let r = c.rng() * tot;
  let o = options[options.length - 1];
  for (const x of options) { r -= x.weight; if (r <= 0) { o = x; break; } }
  // optional time limit: 35% of bounties, 1.7× the estimate, paid +40%
  const timed = c.rng() < 0.35;
  const timeLimit = timed ? Math.max(120, Math.round((o.estSeconds * 1.7) / 30) * 30) : undefined;
  const est = Math.min(600, o.estSeconds);
  const difficulty: 1 | 2 | 3 = est < 150 ? 1 : est < 300 ? 2 : 3;
  // P4 balance: coins per second scale with the act (the fish caught on the way are banked on top)
  const base = (0.35 + act * 0.3) * est;
  const k = timed ? 1.4 : 1;
  const mat = region?.material ?? "shell";
  const reward = {
    coins: Math.round((base * k) / 5) * 5,
    xp: Math.round(est * (1 + act * 0.4) * k),
    mats: { [mat]: Math.max(2, Math.round((est / 60) * 1.5 * k)) } as Partial<Record<MaterialId, number>>,
  };
  const { weight: _w, ...def } = o;
  void _w;
  return { ...def, estSeconds: est, id: `${c.region}-${c.seq}`, region: c.region, timeLimit, reward, difficulty };
}

/** three bounties for a board (distinct objective types where possible) */
export function generateBoard(ctx: BountyCtx, n = 3): BountyDef[] {
  const out: BountyDef[] = [];
  let seq = ctx.seq;
  for (let tries = 0; out.length < n && tries < 20; tries++) {
    const b = generateBounty({ ...ctx, seq: seq++ });
    if (tries < 12 && out.some((x) => x.kind.type === b.kind.type)) continue;
    out.push(b);
  }
  return out;
}
