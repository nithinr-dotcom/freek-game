/**
 * Headless campaign balance report (P4). Run: `npm run balance -w client` (add `-- --write` to refresh docs/BALANCE.md,
 * `-- --mode=hard` for Hard rules).
 *
 * It imports the shared campaign data and the client's pure logic (ReelSim = the real reel physics, campaignRoll = the
 * real fish roll, computeLoadout-equivalent stats, generateBounty) and walks the 30 chapters in order:
 *  - economy: chapter rewards + the fish caught while playing it (banked coins, xp, material drops) + optional-objective
 *    materials; a "sensible player" buys gear by a priority list whenever affordable and spends skill points by a plan;
 *  - fishing: the chance a decent player lands each required species with the gear expected at that point (a bot with
 *    reaction delay and aim noise plays the real ReelSim), and the expected time to finish catch objectives;
 *  - bosses: time-to-kill with the expected harpoon tier and skills (vulnerability windows per boss, hit rates);
 *  - limits: whether the time limit and par are reachable, and how many minutes of bounties a player must grind first
 *    when a gear gate (line T3 for ch.16, heater T2 for Act 4, …) or a boss check isn't affordable.
 * Numbers are estimates for tuning, not guarantees: navigation chapters (reach/collect/escort) use par-based travel.
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  allChapters, getBoss, getRegion, getCampaignSpecies, speciesOfRegion, levelFromXp, skillEffects, GEAR, GEAR_SLOTS, MATERIAL_DROP, MODE_RULES,
  TIER_INFO, TIERS, tierRank, generateBounty, SECONDS_PER_FISH,
  type CampaignChapter, type CampaignSpecies, type GearSlot, type MaterialId, type ObjectiveKind, type CampaignMode, type Tier, type ZoneId, type WeatherTag, type RegionId,
} from "@freek/shared";
import { ReelSim, type ReelMods } from "../src/ui/reelSim";
import { campaignRoll } from "../src/solo/species";
import { mulberry32 } from "../src/util";

const args = process.argv.slice(2);
const MODE = (args.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "normal") as CampaignMode;
const WRITE = args.includes("--write");
let RULES = MODE_RULES.normal;
const rng = mulberry32(1234);

// ------------------------------------------------------------------ player state
interface P { xp: number; coins: number; mats: Partial<Record<MaterialId, number>>; gear: Record<GearSlot, number>; skills: Record<string, number>; bosses: number; minutes: number; grind: number }
const p: P = { xp: 0, coins: 0, mats: {}, gear: Object.fromEntries(GEAR_SLOTS.map((s) => [s, 1])) as Record<GearSlot, number>, skills: {}, bosses: 0, minutes: 0, grind: 0 };
const level = () => levelFromXp(p.xp).level;
const stat = <K extends keyof (typeof GEAR)["rod"][number]["stats"]>(slot: GearSlot, k: K) => GEAR[slot][p.gear[slot] - 1].stats[k] as number;

/** skill plan of a sensible player (in order; ranks repeat) */
const SKILL_PLAN = ["a_zone", "h_dmg", "a_zone", "a_tension", "h_dmg", "a_zone", "a_tension", "h_crit", "h_dmg", "s_speed", "a_tension", "h_cd", "h_crit", "s_hull", "a_perfect", "a_second", "h_cd", "h_crit", "h_twin", "s_hull", "h_cd", "s_hold", "s_hull", "s_repair", "s_speed", "s_speed", "s_hold", "a_bite", "a_bite", "a_bite", "h_loot", "h_loot", "a_perfect", "s_wind", "s_wind", "s_repair", "s_hold"];
function spendSkills() {
  const pts = Math.max(0, level() - 1) + p.bosses;
  const spent = () => Object.values(p.skills).reduce((a, b) => a + b, 0);
  // re-walk to fill every rank in plan order
  let i = 0;
  const want: Record<string, number> = {};
  while (spent() < pts && i < SKILL_PLAN.length) { const id = SKILL_PLAN[i++]; want[id] = (want[id] ?? 0) + 1; if ((p.skills[id] ?? 0) < want[id]) p.skills[id] = want[id]; }
}

/** gear purchase priority per act (slot, max tier this act) */
function buyGear(ch: CampaignChapter) {
  const act = ch.act;
  const cap = (s: GearSlot) => (s === "heater" ? (act >= 4 || ch.id >= 17 ? 5 : 1) : s === "lantern" ? (act >= 5 || ch.id >= 23 ? 5 : act >= 2 ? 2 : 1) : Math.min(5, act + 1));
  const order: GearSlot[] = ch.id >= 17 && ch.id <= 19 ? ["heater", "line", "reel", "rod", "harpoon", "hull", "lantern"] : ch.id >= 13 && ch.id <= 16 ? ["line", "reel", "rod", "harpoon", "hull", "heater", "lantern"] : ["reel", "line", "rod", "harpoon", "hull", "heater", "lantern"];
  let bought = true;
  while (bought) {
    bought = false;
    for (const s of order) {
      const t = p.gear[s];
      if (t >= cap(s)) continue;
      const c = GEAR[s][t].cost;
      if (p.coins < c.coins || Object.entries(c.mats).some(([m, n]) => (p.mats[m as MaterialId] ?? 0) < (n as number))) continue;
      p.coins -= c.coins;
      for (const [m, n] of Object.entries(c.mats)) p.mats[m as MaterialId] = (p.mats[m as MaterialId] ?? 0) - (n as number);
      p.gear[s] = t + 1; bought = true; break;
    }
  }
}

// ------------------------------------------------------------------ the reel bot
/** bot skill knobs (a "decent player"): reaction delay, aim noise, decision interval, attention lapses */
const BOT = { reactS: 0.28, noise: 0.12, every: [0.09, 0.16] as [number, number], lapsePerS: 0.06, lapseS: 0.35 };

/** a decent player: ~0.24 s reaction, aim noise, sticks to "hold when the fish is above the zone's middle" */
function botReel(mods: ReelMods, difficulty: number, lvl: number, r: () => number, gust = 0): { ok: boolean; perfect: boolean } {
  const sim = new ReelSim(r);
  const dur = 5000 + difficulty * 6000;
  sim.start(difficulty, dur, lvl, mods);
  const dt = 1 / 30, delay = Math.round(BOT.reactS / dt);
  const hist: number[] = [];
  let held = false, decideIn = 0, lapse = 0;
  for (let i = 0; i < 30 * 120; i++) {
    hist.push(sim.fishPos);
    decideIn -= dt; lapse -= dt;
    if (lapse <= 0 && r() < BOT.lapsePerS * dt) lapse = BOT.lapseS;
    if (decideIn <= 0 && lapse <= 0) {
      decideIn = BOT.every[0] + r() * (BOT.every[1] - BOT.every[0]);
      const seen = hist[Math.max(0, hist.length - 1 - delay)] + (r() - 0.5) * 2 * BOT.noise;
      const mid = sim.zonePos + sim.zoneSize * 0.5;
      held = seen > mid + sim.zoneVel * 0.12 || (sim.zoneVel < -0.6 && seen > sim.zonePos + sim.zoneSize * 0.3);
    }
    const res = sim.step(dt, held, gust);
    if (res !== null) return { ok: res, perfect: res && sim.maxTension < 0.5 };
  }
  return { ok: false, perfect: false };
}

function reelMods(s: CampaignSpecies, kg: number, extraTension = 1): ReelMods {
  const sk = skillEffects(p.skills);
  return { behaviour: s.behaviour, weightKg: kg, ratingKg: stat("line", "ratingKg"), fillMult: stat("reel", "fillMult"), liftMult: stat("reel", "liftMult"), zoneBonus: sk.zoneBonus, tensionMult: sk.tensionMult * extraTension, secondWind: sk.secondWind };
}
/** line gates (client/src/solo/lineGates.ts): weaker line = forced snap */
const LINE_GATES: Record<string, number> = { thunder_marlin: 150 };

function sampleKg(s: CampaignSpecies, r: () => number, setup?: CampaignChapter["setup"]) {
  let kg = s.minKg + (s.maxKg - s.minKg) * Math.pow(r(), 1.8);
  const tw = setup?.targetWeight;
  if (tw && tw.speciesId === s.id && r() < tw.chance) kg = tw.minKg + r() * (tw.maxKg - tw.minKg);
  return Math.round(kg * 100) / 100;
}
/** chance to land species s (n trials) and the chance it's a perfect reel */
function landChance(s: CampaignSpecies, n = 160, setup?: CampaignChapter["setup"]): { land: number; perfect: number } {
  if (LINE_GATES[s.id] && stat("line", "ratingKg") < LINE_GATES[s.id]) return { land: 0, perfect: 0 };
  let ok = 0, perf = 0;
  for (let i = 0; i < n; i++) {
    const kg = sampleKg(s, rng, setup);
    const d = Math.min(1, TIER_INFO[s.tier].difficulty + RULES.fishDifficulty);
    const r = botReel(reelMods(s, kg), d, level(), rng);
    if (r.ok) ok++; if (r.perfect) perf++;
  }
  return { land: ok / n, perfect: perf / n };
}

// ------------------------------------------------------------------ fish roll odds
function bestZone(s: CampaignSpecies, ch: CampaignChapter): ZoneId {
  const open = ch.setup?.zones ?? ["shallows", "reef", "abyss"];
  const z = (["abyss", "reef", "shallows"] as ZoneId[]).filter((x) => s.zones.includes(x) && open.includes(x));
  return z[0] ?? s.zones[0];
}
/** chance that one bite is species s, with its conditions met (bait equipped, right time/place/weather) */
function biteOdds(s: CampaignSpecies, ch: CampaignChapter, n = 3000): number {
  const region = getRegion(ch.region)!;
  const k = s.conditions ?? {};
  const lm = k.near ? region.landmarks.find((l) => l.id === k.near) : undefined;
  const weather = new Set<WeatherTag>(k.weather ?? []);
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const r = campaignRoll({
      region: ch.region, zone: bestZone(s, ch), storm: weather.has("storm"), time: k.time?.[0] ?? "day", weather, x: lm?.x ?? 0, z: lm?.z ?? 0,
      bait: k.bait ?? null, rareBonus: stat("rod", "rareBonus"), level: level(), setup: ch.setup, rng,
    });
    if (r.species.id === s.id) hit++;
  }
  return hit / n;
}
function tierBiteOdds(ch: CampaignChapter, tier: Tier, n = 3000): number {
  let hit = 0;
  const zone: ZoneId = (ch.setup?.zones ?? ["shallows", "reef", "abyss"]).includes("abyss") ? "abyss" : "reef";
  for (let i = 0; i < n; i++) {
    const r = campaignRoll({ region: ch.region, zone, storm: false, time: "day", weather: new Set(), x: 0, z: 0, bait: null, rareBonus: stat("rod", "rareBonus"), level: level(), setup: ch.setup, rng });
    if (tierRank(r.species.tier) >= tierRank(tier)) hit++;
  }
  return hit / n;
}
/** seconds for one cast→bite→reel cycle */
const cycleSec = (tier: Tier) => 0.6 + (2 + 2.25) * stat("rod", "biteSpeed") + 1 + (5 + (TIER_INFO[tier].difficulty + RULES.fishDifficulty) * 6) * 0.75 / stat("reel", "fillMult");

/** average catch over the region's normal roll (coins/xp/mat drops per landed fish) */
function avgCatch(ch: CampaignChapter) {
  let pts = 0, mats = 0;
  const zone: ZoneId = (ch.setup?.zones ?? ["shallows", "reef", "abyss"]).includes("abyss") ? "abyss" : (ch.setup?.zones ?? []).includes("reef") ? "reef" : "shallows";
  const N = 600;
  for (let i = 0; i < N; i++) {
    const r = campaignRoll({ region: ch.region, zone, storm: false, time: "day", weather: new Set(), x: 0, z: 0, bait: null, rareBonus: stat("rod", "rareBonus"), level: level(), rng });
    pts += r.points;
    const d = MATERIAL_DROP[tierRank(r.species.tier)];
    mats += d.chance * d.n;
  }
  return { pts: pts / N, mats: mats / N };
}

// ------------------------------------------------------------------ bosses
const COMBAT_EFF = 0.55;
interface BossModel { hp: number; dps: number; ttk: number; note: string }
function bossTTK(id: string): BossModel {
  const b = getBoss(id)!;
  const sk = skillEffects(p.skills);
  const dmg = Math.round(stat("harpoon", "damage") * sk.harpoonDmgMult);
  const cd = (stat("harpoon", "cooldownMs") * sk.cooldownMult) / 1000;
  const critAvg = 1 + sk.critChance;
  const twin = sk.twin ? 1.6 : 1;
  const hp = Math.round(b.hp * RULES.monsterHp);
  // per-boss uptime (share of time it can be hit) × accuracy, and forced crits
  let dps = 0, extra = 0, note = "";
  switch (id) {
    case "reef_serpent": dps = (dmg * critAvg * twin / cd) * 0.62 * 0.7; note = "surfaced ~62% · 70% hits"; break;
    case "crab_titan": { const cycle = 2.6 + 0.6 + 1.6 + 3 + 1; dps = (dmg * 2 * twin * Math.floor(3 / cd + 0.5) * 0.85) / cycle; note = "open 3 s per ~9 s cycle · forced ×2"; break; }
    case "storm_kraken": { const t = Math.round(110 * RULES.monsterHp); extra = (6 * t) / ((dmg * critAvg * twin / cd) * 0.7); dps = (dmg * critAvg * twin / cd) * 0.55; note = "4+2 tentacles first · head 55%"; break; }
    case "ice_leviathan": { const cycle = 3 + 4.5 + 1.7 + 6.5; dps = (dmg * critAvg * twin / cd) * (6.5 / cycle) * 0.75 * 0.85; extra = 12; note = "exposed ~6.5 s per ~16 s · plates first"; break; }
    case "maelstrom_eye": { const cycle = 1.1 + 4.5 + 6; dps = (dmg * critAvg * twin / cd) * (4.5 / cycle) * 0.8; extra = 40; note = "to 25% by the Eye (open 4.5 s / 11.6 s) + Eye Duel"; break; }
  }
  // combat efficiency: dodging telegraphs, repositioning, missed windows (a decent player lands ~half the ideal dps)
  dps *= COMBAT_EFF;
  const dmgNeeded = id === "maelstrom_eye" ? hp * 0.75 : hp;
  return { hp, dps: Math.round(dps * 10) / 10, ttk: Math.round(dmgNeeded / Math.max(0.1, dps) + extra + 8), note };
}
/** the Eye Duel: legend behaviour at 0.93 (+mode) difficulty, 34 s */
function duelChance(n = 120): number {
  const sk = skillEffects(p.skills);
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const sim = new ReelSim(rng);
    void sim;
    const r = botReel({ behaviour: "legend", weightKg: 0, ratingKg: 1, fillMult: stat("reel", "fillMult"), liftMult: stat("reel", "liftMult"), zoneBonus: sk.zoneBonus + 0.02, tensionMult: sk.tensionMult * 0.95, secondWind: sk.secondWind }, Math.min(1, 0.93 + RULES.fishDifficulty), level(), rng);
    if (r.ok) ok++;
  }
  return ok / n;
}

// ------------------------------------------------------------------ bounties (grind rate)
function bountyRate(ch: CampaignChapter): { coinsPerMin: number; matsPerMin: number; xpPerMin: number } {
  let c = 0, m = 0, x = 0, t = 0;
  const zones: ZoneId[] = ["shallows", "reef", "abyss"];
  const avg = avgCatch(ch);
  for (let i = 0; i < 200; i++) {
    const b = generateBounty({ region: ch.region, level: level(), gear: p.gear, zones, seq: i, rng });
    const sec = b.estSeconds;
    const fish = sec / SECONDS_PER_FISH * 0.8;
    c += b.reward.coins + fish * avg.pts / 2; m += Object.values(b.reward.mats).reduce((a, v) => a + (v ?? 0), 0) + fish * avg.mats; x += b.reward.xp + fish * avg.pts * 2; t += sec + 20;
  }
  return { coinsPerMin: (c / t) * 60, matsPerMin: (m / t) * 60, xpPerMin: (x / t) * 60 };
}

/** gear a chapter really needs (hard gates + a sensible boss check) */
function requirement(ch: CampaignChapter): Partial<Record<GearSlot, number>> {
  const req: Partial<Record<GearSlot, number>> = {};
  if (ch.id === 16) req.line = 3;
  if (ch.act >= 4) req.heater = 2;
  if (ch.act >= 5) req.lantern = 3;
  if (ch.boss === "crab_titan" || ch.boss === "storm_kraken") req.harpoon = 2;
  if (ch.boss === "ice_leviathan") req.harpoon = 3;
  if (ch.boss === "maelstrom_eye") req.harpoon = 3;
  return req;
}
function costTo(slot: GearSlot, tier: number) {
  let coins = 0; const mats: Partial<Record<MaterialId, number>> = {};
  for (let t = p.gear[slot]; t < tier; t++) { const c = GEAR[slot][t].cost; coins += c.coins; for (const [k, v] of Object.entries(c.mats)) mats[k as MaterialId] = (mats[k as MaterialId] ?? 0) + (v as number); }
  return { coins, mats };
}

// ------------------------------------------------------------------ calibration (--calibrate): land rate per tier/behaviour
if (args.includes("--calibrate")) {
  for (const [g, lv] of [[1, 1], [3, 12], [5, 25]] as [number, number][]) {
    for (const s of GEAR_SLOTS) p.gear[s] = g;
    p.xp = 0; for (let i = 1; i < lv; i++) p.xp += Math.round(100 * Math.pow(i, 1.5));
    p.skills = {}; spendSkills();
    const line: string[] = [];
    for (const t of TIERS) for (const b of ["steady", "darter", "feinter", "diver", "thrasher", "legend"] as const) {
      const sp = { ...speciesOfRegion("shallows_bay")[0], tier: t, behaviour: b, minKg: 1, maxKg: 1 } as CampaignSpecies;
      if ((t === "legendary") !== (b === "legend")) continue;
      line.push(`${t[0]}/${b.slice(0, 4)} ${Math.round(landChance(sp, 200).land * 100)}%`);
    }
    console.log(`gear T${g} lv ${lv}: ${line.join("  ")}`);
  }
  process.exit(0);
}

// ------------------------------------------------------------------ chapter walk
interface Row {
  id: number; title: string; lvl: number; gear: string; coins: number;
  fish: string; boss: string; est: number; par: number; limit: string; grind: number; verdict: string;
}
const rows: Row[] = [];
const notes: string[] = [];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

function fishingTime(k: ObjectiveKind, ch: CampaignChapter): { sec: number; text: string } | null {
  const region = ch.region as RegionId;
  const plain = speciesOfRegion(region).filter((s) => !s.conditions);
  switch (k.type) {
    case "catch_species": {
      const targets = k.ids.map((id) => getCampaignSpecies(id)!).filter(Boolean);
      if (k.distinct) {
        // distinct colour hunt: the n easiest
        const ranked = targets.map((s) => { const o = biteOdds(s, ch, 1200); const l = landChance(s, 60, ch.setup).land; return { s, rate: o * l, l }; }).sort((a, b) => b.rate - a.rate).slice(0, k.n);
        const sec = ranked.reduce((a, x) => a + cycleSec(x.s.tier) / Math.max(0.01, x.rate), 0);
        return { sec, text: ranked.map((x) => `${x.s.name} ${pct(x.l)}`).join(", ") };
      }
      if (targets.length > 1) {
        // any of several species (e.g. "4 Abyss fish"): the normal roll in the best zone
        let hit = 0; const N = 2000;
        for (let i = 0; i < N; i++) { const r = campaignRoll({ region: ch.region, zone: bestZone(targets[0], ch), storm: false, time: "day", weather: new Set(), x: 0, z: 0, bait: null, rareBonus: stat("rod", "rareBonus"), level: level(), setup: ch.setup, rng }); if (k.ids.includes(r.species.id)) hit++; }
        const land = targets.filter((x) => !x.conditions).reduce((a, x) => a + landChance(x, 40).land, 0) / Math.max(1, targets.filter((x) => !x.conditions).length);
        return { sec: (k.n * cycleSec("rare")) / Math.max(0.01, (hit / N) * land) + 75, text: `${k.n} of ${targets.length} species: bite ${pct(hit / N)} · land ${pct(land)}` };
      }
      const s = targets[0];
      const odds = biteOdds(s, ch), land = landChance(s, 160, ch.setup);
      // bait chains: one bait fish per bite of the target
      let sec = (k.n * cycleSec(s.tier)) / Math.max(0.005, odds * land.land);
      const bait = s.conditions?.bait ? getCampaignSpecies(s.conditions.bait) : undefined;
      if (bait) { const bo = biteOdds(bait, ch, 1500), bl = landChance(bait, 60).land; sec += (k.n / Math.max(0.05, land.land * odds)) * cycleSec(bait.tier) / Math.max(0.02, bo * bl); const bb = bait.conditions?.bait ? getCampaignSpecies(bait.conditions.bait) : undefined; if (bb) sec += 3 * cycleSec(bb.tier) / Math.max(0.02, biteOdds(bb, ch, 1000) * landChance(bb, 40).land); }
      if (s.conditions?.time || s.conditions?.weather) sec += 45; // rest / wait for the weather
      return { sec: sec + 75, text: `${s.name}: bite ${pct(odds)} · land ${pct(land.land)}${bait ? ` (bait ${bait.name})` : ""}` };
    }
    case "catch_weight_range": {
      const s = getCampaignSpecies(k.speciesId!)!;
      const odds = biteOdds(s, ch);
      let inRange = 0;
      for (let i = 0; i < 2000; i++) { const kg = sampleKg(s, rng, ch.setup); if (kg >= k.minKg && kg <= k.maxKg) inRange++; }
      const land = landChance(s, 160, ch.setup);
      const rate = odds * (inRange / 2000) * land.land;
      return { sec: cycleSec(s.tier) / Math.max(0.003, rate) + 75 + (s.conditions?.time ? 45 : 0), text: `${s.name} ${k.minKg}–${k.maxKg} kg: bite ${pct(odds)} · in range ${pct(inRange / 2000)} · land ${pct(land.land)}` };
    }
    case "catch_tier": {
      const odds = tierBiteOdds(ch, k.tier);
      const rep = plain.filter((s) => s.tier === k.tier)[0] ?? plain.filter((s) => tierRank(s.tier) >= tierRank(k.tier))[0];
      const land = rep ? landChance(rep, 120).land : 0.5;
      return { sec: (k.n * cycleSec(k.tier)) / Math.max(0.01, odds * land) + 50, text: `${k.n}× ${TIER_INFO[k.tier].label}+: bite ${pct(odds)} · land ${pct(land)} (${rep?.name ?? "?"})` };
    }
    case "catch_count": case "bank_fish": {
      const mix = plain.filter((s) => s.tier === "common" || s.tier === "rare");
      const land = mix.reduce((a, s) => a + landChance(s, 50).land, 0) / mix.length;
      return { sec: (k.n * cycleSec("common")) / land + 60, text: `${k.n} fish: avg land ${pct(land)}` };
    }
    case "streak": {
      const mix = plain.filter((s) => s.tier !== "legendary" && s.tier !== "epic");
      const land = mix.reduce((a, s) => a + landChance(s, 50).land, 0) / mix.length;
      // expected attempts for n successes in a row: (1-p^n)/((1-p) p^n)
      const pl = Math.min(0.995, land);
      const tries = (1 - Math.pow(pl, k.n)) / ((1 - pl) * Math.pow(pl, k.n));
      return { sec: tries * cycleSec("rare") + 60, text: `streak ${k.n}: land ${pct(land)} → ~${Math.round(tries)} bites` };
    }
    case "bank_points_trip": {
      const a = avgCatch(ch);
      return { sec: (k.n / a.pts) * cycleSec("rare") * 1.1 + 60, text: `${k.n} pts in a trip: ~${Math.round(k.n / a.pts)} fish` };
    }
    case "all": {
      let sec = 0; const txt: string[] = [];
      for (const part of k.parts) { const f = fishingTime(part, ch); if (f) { sec = Math.max(sec, f.sec); txt.push(f.text); } else if (part.type === "survive") sec = Math.max(sec, part.seconds); }
      return sec ? { sec, text: txt.join("; ") || "survive" } : null;
    }
    default: return null;
  }
}

function walk() {
for (const ch of allChapters()) {
  buyGear(ch); spendSkills();
  // gear requirement → bounty grind
  const req = requirement(ch);
  let grindMin = 0;
  const rate = bountyRate(ch);
  for (const [slot, tier] of Object.entries(req) as [GearSlot, number][]) {
    if (p.gear[slot] >= tier) continue;
    const c = costTo(slot, tier);
    const coinShort = Math.max(0, c.coins - p.coins);
    const matShort = Object.entries(c.mats).reduce((a, [m, n]) => a + Math.max(0, (n as number) - (p.mats[m as MaterialId] ?? 0)), 0);
    const trophyShort = Object.entries(c.mats).some(([m, n]) => m.includes("_") && (p.mats[m as MaterialId] ?? 0) < (n as number));
    if (trophyShort) { notes.push(`Ch ${ch.id}: ${slot} T${tier} needs a boss trophy the player can't have yet`); continue; }
    const min = Math.max(coinShort / rate.coinsPerMin, matShort / rate.matsPerMin);
    grindMin += min;
    // the grind pays: apply it and buy
    p.coins += min * rate.coinsPerMin; p.xp += min * rate.xpPerMin;
    const mat = getRegion(ch.region)!.material; p.mats[mat] = (p.mats[mat] ?? 0) + min * rate.matsPerMin;
    // older-region materials: farm them with bounties in that region (same rate)
    for (const [m, n] of Object.entries(c.mats)) if ((p.mats[m as MaterialId] ?? 0) < (n as number)) p.mats[m as MaterialId] = n as number;
    buyGear(ch);
  }
  p.grind += grindMin;
  spendSkills();
  const lvl = level();
  const gear = GEAR_SLOTS.map((s) => p.gear[s]).join("");

  // objective time
  const main = ch.main.kind;
  let est = 0, fishText = "–", bossText = "–";
  const f = fishingTime(main, ch);
  if (f) { est = f.sec; fishText = f.text; }
  if (ch.boss) {
    const b = bossTTK(ch.boss);
    est = b.ttk;
    bossText = `${b.hp} hp · ${b.dps} dps · TTK ${fmt(b.ttk)} (${b.note})`;
    if (ch.boss === "maelstrom_eye") { const d = duelChance(); bossText += ` · duel win ${pct(d)}`; est += 34 / Math.max(0.2, d); }
  }
  if (!f && !ch.boss) {
    const k = main;
    if (k.type === "defend" || k.type === "survive") est = k.seconds + 20;
    else est = ch.parSeconds * 0.8; // reach / collect / escort: navigation, par-based
  }
  const limit = ch.fail?.timeLimit ? Math.round(ch.fail.timeLimit * RULES.timeLimit) : 0;
  const limitText = limit ? `${fmt(limit)} ${est * 1.2 <= limit ? "✔" : est <= limit ? "tight" : "✘"}` : "–";
  const verdict = [est <= ch.parSeconds ? "par ✔" : est <= ch.parSeconds * 1.3 ? "par tight" : "par ✘", grindMin > 10 ? `grind ${Math.round(grindMin)}m ✘` : grindMin > 0 ? `grind ${Math.round(grindMin)}m` : ""].filter(Boolean).join(" · ");
  rows.push({ id: ch.id, title: ch.title.replace(/^(FINAL )?BOSS:\s*/, "☠ "), lvl, gear, coins: Math.round(p.coins), fish: fishText, boss: bossText, est: Math.round(est), par: ch.parSeconds, limit: limitText, grind: Math.round(grindMin * 10) / 10, verdict });

  // ---- play the chapter: income
  const playSec = Math.max(est, ch.parSeconds * 0.9);
  const fishingShare = ch.boss ? 0 : f ? 0.85 : 0.25;
  const fishN = (playSec * fishingShare) / SECONDS_PER_FISH * 0.85;
  const a = avgCatch(ch);
  p.coins += fishN * a.pts / 2 + ch.rewards.coins * RULES.firstClearPay;
  p.xp += fishN * a.pts * 2 + ch.rewards.xp * RULES.firstClearPay;
  const mat = getRegion(ch.region)!.material;
  p.mats[mat] = (p.mats[mat] ?? 0) + fishN * a.mats + 3; // ~1.5 optionals × 2 on first clear
  for (const [m, n] of Object.entries(ch.rewards.materials ?? {})) p.mats[m as MaterialId] = (p.mats[m as MaterialId] ?? 0) + (n as number);
  if (ch.boss) { const b = getBoss(ch.boss)!; p.mats[b.trophy] = (p.mats[b.trophy] ?? 0) + (MODE === "normal" ? 2 : 1); p.bosses++; p.xp += b.xp; }
  p.minutes += playSec / 60;
}
}
walk();
if (MODE !== "normal") {
  // Hard / Legendary are replays: the player starts them with everything the Normal campaign gave
  rows.length = 0; notes.length = 0; p.minutes = 0; p.grind = 0;
  RULES = MODE_RULES[MODE];
  walk();
}

// ------------------------------------------------------------------ report
const BALANCE_INTRO = `# Tidebreakers campaign balance (P4)

Generated by \`npm run balance -w client -- --write\` (client/scripts/balance.ts). The script imports the shared campaign
data and the client's pure logic (the real reel physics \`ReelSim\`, the real fish roll \`campaignRoll\`, \`generateBounty\`)
and walks the 30 chapters in order with a "sensible player": it banks the fish it catches while playing (1 coin per 2
points), takes the chapter rewards (+2 trophies per first boss clear), buys gear by a priority list whenever it can afford
it, spends skill points by a fixed plan, and grinds bounties only when a chapter's gear gate isn't affordable.

**Reel bot** (a decent player): ${BOT.reactS * 1000} ms reaction, ±${BOT.noise} aim noise, re-decides every ${BOT.every[0] * 1000}–${BOT.every[1] * 1000} ms,
${BOT.lapsePerS * 100}% chance per second of a ${BOT.lapseS * 1000} ms lapse; holds while the fish is above the zone's middle.
**Boss model**: harpoon dps from the expected harpoon tier and Hunter skills × each boss's vulnerability window × hit rate
× ${COMBAT_EFF} combat efficiency (dodging, repositioning, missed windows) + 8 s of intro.
**Navigation chapters** (reach / collect / escort) can't be simulated headless: their estimate is 80% of par.

Columns: level and gear tiers at the chapter start (rod reel line hull harpoon lantern heater), coins in hand after
shopping, the required fish (chance a bite is that species with its conditions met · chance the bot lands it), boss
hp / dps / time-to-kill, the estimated time to finish the main objective, par (S grade), the time limit (✔ = estimate
+20% fits), and the verdict (par reachable, minutes of bounty grind needed first; ✘ above 10 minutes).

## P4 tuning (what changed and why)
- **Gear costs**: T2 150 (was 120) · T3 800 (400) · T4 2600 + coral/storm glass + 1 boss trophy (was 1000 + 2 trophies) ·
  T5 6500 + storm glass/ice pearls/abyssal ink + 1 trophy (2400 + 2 trophies). Banking big fish made coins meaningless by
  Act 3 (13 000+ unspent); now coins pace the upgrades and the trophies are spread over the slots
  (rod: fang/beak, reel: carapace/heart, line: fang/heart, hull: carapace/beak, harpoon: beak/core, lantern:
  carapace/heart, heater: beak/heart). A boss's first clear drops **2 trophies** (1 on replays).
- **Bosses**: Crab Titan 1300 hp (1000), Storm Kraken 1200 (900), Ice Leviathan 1500 (1000), Maelstrom Eye 2600 (1800);
  the Eye Duel is harder (difficulty 0.93, was 0.86; zone bonus +0.02, was +0.05; tension ×0.95, was ×0.85).
- **Pars**: ch3 4:00 (5:00), ch5 5:00 (6:00), ch8 5:00 (6:00), ch11 5:30 (7:00), ch16 5:00 (6:00), ch18 4:00 (5:00),
  ch23 6:00 (7:00), ch24 4:00 (5:00), ch27 6:00 (7:00), ch28 7:00 (8:00), ch30 6:00 (7:00). Ch28's time limit 9:00 (10:00).
- **Fish**: the darter behaviour was near-impossible above Common (1% for a Rare at T1): its speed is now
  (0.9 + 2.4·difficulty)·1.5 instead of (0.8 + 3.4·difficulty)·1.8. The Abyssal Shark is a diver (was a thrasher) so
  the Act 5 bait chain ends on a genuinely hard fish.
- **Bounties**: coins (0.35 + 0.3·act) per estimated second (was 0.55 + 0.45·act), at most a ~10-minute estimate
  (rare weight windows are skipped), time-limited ones pay +40%.
- **Hard / Legendary**: monsters ×1.5 HP and damage (hazards unchanged), fish +0.1 difficulty (the Eye Duel too), time
  limits ×0.8; Legendary adds ironman. First clears on Hard pay the chapter's xp/coins again, Legendary ×1.5.
`;

const head = `| Ch | Chapter | Lv | Gear (rod reel line hull harp lant heat) | Coins | Required fish (bite · land) | Boss | Est. | Par | Limit | Verdict |\n|---|---|---|---|---|---|---|---|---|---|---|`;
const body = rows.map((r) => `| ${r.id} | ${r.title} | ${r.lvl} | ${r.gear.split("").join(" ")} | ${r.coins} | ${r.fish} | ${r.boss} | ${fmt(r.est)} | ${fmt(r.par)} | ${r.limit} | ${r.verdict} |`).join("\n");
const summary = `Mode **${MODE}** · campaign time ≈ ${Math.round(p.minutes)} min of chapters + ${Math.round(p.grind)} min of bounty grind · final level ${level()} · gear ${GEAR_SLOTS.map((s) => `${s} T${p.gear[s]}`).join(", ")}`;
const out = `${summary}\n\n${head}\n${body}\n${notes.length ? `\n${notes.map((n) => `- ${n}`).join("\n")}\n` : ""}`;
console.log(out);
if (WRITE && MODE === "normal") {
  const hard = execFileSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), "--mode=hard"], { encoding: "utf8" });
  const path = fileURLToPath(new URL("../../docs/BALANCE.md", import.meta.url));
  writeFileSync(path, `${BALANCE_INTRO}\n## Normal\n\n${out}\n## Hard (a replay with the end-of-campaign gear)\n\n${hard}`);
  console.log(`\nwrote ${path}`);
}
