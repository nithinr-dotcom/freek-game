/**
 * Campaign v2 chapter flow: setup, intro, objectives, fail conditions, checkpoints (boss phases), stars and grade,
 * rewards, hints and Assist after 3 fails. One instance per solo session; `def === null` is free roam.
 */
import {
  DOCK_POS, DOCK_RADIUS, ZONES, MATERIALS, computeGrade, betterGrade, getBoss, getChapter, allChapters, chaptersOfRegion, getRegion,
  type CampaignChapter, type RegionDef, type Grade, type BossDef, type MonsterS, type MissionS, type ZoneId, type MaterialId, type PlayerS,
} from "@freek/shared";
import type { SoloNet } from "./SoloNet";
import type { SoloSave } from "./save";
import type { SoloClock } from "./clock";
import type { Actors } from "./actors";
import { ObjectiveEngine, isConstraint, type ObjCtx, type ObjEvent, type ObjRuntime } from "./objectives";
import type { ProgressEvent } from "./progress";
import { createBossBehaviour, type BossBehaviour, type BossFx } from "./bosses";
import { nearLandmark } from "./species";
import { createChapterScript, type ChapterScript } from "./scripts";

export interface ChapterResult {
  chapter: CampaignChapter; stars: number; grade: Grade; elapsed: number; damagePct: number; assist: boolean;
  objectives: { title: string; done: boolean; optional: boolean }[];
  xp: number; coins: number; materials: Partial<Record<MaterialId, number>>;
  firstClear: boolean; newBest: boolean; unlockText?: string; next: CampaignChapter | null; boss?: BossDef;
}
export interface FailInfo { chapter: CampaignChapter; reason: string; fails: number; hint: string | null; assistAvailable: boolean; checkpoint: string | null }

export interface RunnerUI {
  dialogue(lines: string[], done: () => void, title?: string): void;
  banner(ch: CampaignChapter | null, region: RegionDef): void;
  complete(r: ChapterResult, actions: { next: (() => void) | null; chart: () => void; free: () => void; replay: () => void }): void;
  failed(f: FailInfo, actions: { retry: (assist: boolean) => void; chart: () => void }): void;
  toast(html: string, cls?: string): void;
  bossIntro(def: BossDef, m: MonsterS): void;
  bossKilled(def: BossDef, m: MonsterS, done: () => void): void;
  bossPhase(def: BossDef, phase: number): void;
  closeOverlays(): void;
}

export interface RunnerEnv {
  net: SoloNet; save: SoloSave; region: RegionDef; clock: SoloClock; actors: Actors; ui: RunnerUI; bossFx: BossFx;
  /** recompute loadout with/without assist */
  setAssist(on: boolean): void;
  /** results bookkeeping (achievements, stats) */
  onComplete(r: ChapterResult): void;
  openChart(): void;
  grantMaterial(id: MaterialId, n: number): void;
  meters(): { warmth: number; fuel: number; dark: boolean };
  /** P3: optional hooks for region hazards (cold, lantern, floes): chapter start + every objective event */
  onStart?(def: CampaignChapter | null): void;
  onEvent?(ev: ObjEvent): void;
}

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export class ChapterRunner {
  def: CampaignChapter | null = null;
  obj: ObjectiveEngine | null = null;
  elapsed = 0;
  damageTaken = 0;
  assist = false;
  status: "idle" | "intro" | "running" | "completing" | "failed" | "free" = "idle";
  busy = false;
  private boss: { def: BossDef; m: MonsterS; ctl: BossBehaviour } | null = null;
  private bossSpawnIn = -1;
  private killCinematic = false;
  private darkFor = 0;
  private catches = 0;
  private tipShown = new Set<string>();
  /** main done but action-type bonus objectives remain: finish them or return to the dock */
  wrapUp = false;
  /** per-chapter script (solo/scripts), if the chapter has one */
  script: ChapterScript | null = null;
  /** bumps on every start (stale timers from an earlier attempt check it) */
  private runSeq = 0;

  constructor(private env: RunnerEnv) {}

  get net() { return this.env.net; }
  get save() { return this.env.save; }
  get region() { return this.env.region; }

  /** next chapter to play: the first unfinished one in an unlocked region */
  static nextChapter(save: SoloSave): CampaignChapter | null {
    return allChapters().find((c) => !save.campaign.chapters[c.id]?.done && save.campaign.unlockedRegions.includes(c.region)) ?? null;
  }

  // ======================================================================= start
  start(chapterId: number | CampaignChapter | null, opts: { retry?: boolean; assist?: boolean } = {}) {
    const env = this.env, net = this.net, save = this.save;
    this.env.ui.closeOverlays();
    this.runSeq++;
    this.endScript();
    this.cleanupBoss();
    env.actors.clear();
    this.def = typeof chapterId === "object" ? chapterId : chapterId ? getChapter(chapterId) ?? null : null;
    if (this.def && this.def.region !== this.region.id) this.def = null; // other region: travel first
    this.assist = !!opts.assist && !!this.def;
    env.setAssist(this.assist);
    this.elapsed = 0; this.damageTaken = 0; this.killCinematic = false; this.wrapUp = false; this.darkFor = 0; this.catches = 0; this.tipShown.clear();
    const d = this.def;
    net.resetForRetry();
    if (!d) {
      this.obj = null;
      this.status = "free";
      save.campaign.current = null;
      this.applyZones(this.freeRoamZones());
      net.randomMonsters = true; net.randomKraken = true; net.tutorial = false; net.setCalm(false);
      env.ui.banner(null, this.region);
      env.onStart?.(null);
      net.persist();
      return;
    }
    const s = d.setup ?? {};
    const cur = save.campaign.current;
    const sameChapter = cur?.chapterId === d.id;
    if (!sameChapter) save.campaign.current = { chapterId: d.id, introSeen: false, checkpointPhase: 0 };
    if (!opts.retry && !sameChapter) save.campaign.current!.checkpointPhase = 0;
    this.applyZones(s.zones ?? ["shallows", "reef", "abyss"]);
    net.randomMonsters = s.monsters !== "none";
    net.randomKraken = !d.boss;
    net.tutorial = !!s.tutorial;
    net.setCalm(s.weather === "clear");
    if (s.weather === "storm") net.forceStorm(0);
    if (s.startHour !== undefined) env.clock.hour = s.startHour;
    for (const [id, n] of Object.entries(s.startBait ?? {})) save.bait[id] = (save.bait[id] ?? 0) + n;
    env.actors.build(d, this.region);
    env.onStart?.(d);
    this.obj = new ObjectiveEngine(d.main, d.optional);
    this.obj.onChange = (o) => this.onObjChange(o);
    this.script = createChapterScript(d.id, {
      net, actors: env.actors, clock: env.clock, region: this.region, obj: () => this.obj, elapsed: () => this.elapsed,
      emit: (ev) => this.feed(ev), toast: (html, cls) => env.ui.toast(html, cls),
    });
    net.persist();
    env.ui.banner(d, this.region);
    const intro = !save.campaign.current!.introSeen || !opts.retry;
    const go = () => {
      this.status = "running"; this.busy = false;
      save.campaign.current!.introSeen = true;
      net.persist();
      if (d.boss) this.bossSpawnIn = 2.5;
      if (this.assist) env.ui.toast("<b>🛟 Assist on:</b> +15% catch zone · −20% monster damage · grade capped at B", "good");
    };
    if (intro && !opts.retry) {
      this.status = "intro"; this.busy = true;
      env.ui.dialogue(d.intro, go, `Chapter ${d.id}: ${d.title}`);
    } else go();
  }

  private applyZones(zones: ZoneId[]) {
    this.net.zonesOpen = { shallows: zones.includes("shallows"), reef: zones.includes("reef"), abyss: zones.includes("abyss") };
    this.net.rerollImpossibleMissions();
  }
  /** free roam: every zone opened by a chapter you have reached */
  private freeRoamZones(): ZoneId[] {
    const reached = chaptersOfRegion(this.region.id).filter((c) => this.save.campaign.chapters[c.id]?.done || c === ChapterRunner.nextChapter(this.save));
    const z = new Set<ZoneId>(["shallows"]);
    for (const c of reached) for (const k of c.setup?.zones ?? ["shallows", "reef", "abyss"]) z.add(k);
    if (chaptersOfRegion(this.region.id).every((c) => this.save.campaign.chapters[c.id]?.done)) { z.add("reef"); z.add("abyss"); }
    return [...z];
  }

  // ======================================================================= events
  private ctx(): ObjCtx {
    const m = this.env.meters();
    return {
      elapsed: this.elapsed,
      npcHpPct: (id) => { const n = this.env.actors.npc(id); return n ? (n.alive ? n.hpPct : 0) : undefined; },
      warmthPct: m.warmth, fuelPct: m.fuel, storm: this.net.state.storm, night: this.env.clock.phase === "night",
      monstersAlive: this.net.state.monsters.size, unbankedFish: this.net.me.unbanked.length,
    };
  }
  private onObjChange(o: ObjRuntime) {
    if (this.status !== "running") return;
    if (o.state === "done") this.env.ui.toast(`<b>${o.optional ? "★" : "✔"} ${o.def.title}</b>`, "good");
    else if (o.state === "broken") this.env.ui.toast(`<b>✘ ${o.def.title}</b>${o.optional ? " · optional star lost" : ""}`, "bad");
    if (o === this.obj?.main && o.state === "broken") {
      const k = o.def.kind;
      this.fail(k.type === "escort" || k.type === "defend" ? `${this.env.actors.npc(k.npcId)?.name ?? "The boat"} was lost` : `Objective failed: ${o.def.title}`);
    }
  }

  /** from SoloNet.progress */
  onProgress(ev: ProgressEvent) {
    if (ev.t === "damage" && this.status === "running") this.damageTaken += ev.amount;
    if (ev.t === "catch") this.catches++;
    this.feed(ev);
  }
  feed(ev: ObjEvent) {
    this.env.onEvent?.(ev);
    if (this.status !== "running" || !this.obj) return;
    this.script?.event?.(ev);
    this.obj.event(ev, this.ctx());
    this.checkDone();
  }
  onSunk() {
    if (this.status === "running" && this.wrapUp) { this.complete(); return; }
    if (this.status === "running" && this.def?.fail?.ironman) { const run = this.runSeq; setTimeout(() => { if (run === this.runSeq) this.fail("Your boat sank (ironman)"); }, 1400); }
  }
  onMonsterKilled(m: MonsterS, boss: boolean) {
    if (!boss || !this.boss || this.boss.m.id !== m.id) return;
    const def = this.boss.def;
    this.killCinematic = true;
    this.boss = null;
    this.env.ui.bossKilled(def, m, () => { this.killCinematic = false; this.checkDone(); });
  }

  private checkDone() {
    if (this.status !== "running" || !this.obj?.mainDone || this.killCinematic) return;
    const pending = this.obj.items.filter((o) => o.optional && o.state === "active" && !isConstraint(o.def.kind));
    if (!pending.length) { this.complete(); return; }
    if (!this.wrapUp) {
      this.wrapUp = true;
      this.env.ui.toast(`<b>✔ Main objective done!</b> Go for the bonus${pending.length > 1 ? "es" : ""}, or return to the dock to finish.`, "good");
    }
  }

  // ======================================================================= per frame
  update(dt: number, me: PlayerS | undefined) {
    const d = this.def;
    if (!me) return;
    const ev = this.env.actors.update(dt, performance.now() / 1000, { x: me.x, z: me.z, rot: me.rot, speed: me.speed, sunk: me.sunk });
    for (const e of ev) this.feed(e);
    if (!d || this.status !== "running") return;
    if (this.busy || this.net.paused) return;
    this.elapsed += dt;
    this.script?.update?.(dt);
    if (this.status !== "running") return;
    this.obj?.tick(dt, this.ctx());
    this.checkDone();
    if (this.status !== "running") return;
    if (this.wrapUp && !me.sunk && Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z) < DOCK_RADIUS && !me.unbanked.length) { this.complete(); return; }
    // fail conditions
    if (d.fail?.timeLimit && !this.wrapUp && this.elapsed >= d.fail.timeLimit) { this.fail("Out of time!"); return; }
    const m = this.env.meters();
    if (this.region.hazards.cold && m.warmth <= 0) { this.fail("You froze!"); return; }
    if (this.region.hazards.darkness) {
      this.darkFor = m.fuel <= 0 && m.dark ? this.darkFor + dt : 0;
      if (this.darkFor >= 10) { this.fail("Lost in the dark: out of lantern fuel"); return; }
    }
    // boss spawn
    if (d.boss && !this.boss && this.bossSpawnIn >= 0 && !this.killCinematic) {
      this.bossSpawnIn -= dt;
      const r = Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z);
      if (this.bossSpawnIn <= 0 && !me.sunk && (r > 36 || this.bossSpawnIn < -6)) { this.bossSpawnIn = -1; this.spawnBoss(me); }
    }
  }

  private spawnBoss(me: PlayerS) {
    const def = getBoss(this.def!.boss!);
    if (!def) return;
    const cp = this.save.campaign.current?.checkpointPhase ?? 0;
    const hp = Math.round(def.hp * (def.phases[cp]?.atPct ?? 1));
    // ahead of the boat, away from the harbour
    const a = Math.atan2(me.x - DOCK_POS.x, me.z - DOCK_POS.z) + (Math.random() - 0.5) * 0.8;
    let x = me.x + Math.sin(a) * 42, z = me.z + Math.cos(a) * 42;
    if (Math.hypot(x, z) < 50) { x = Math.sin(a) * 60; z = Math.cos(a) * 60; }
    const m = this.net.spawnMonster(def.monsterKind, { scripted: true, boss: true, hp, at: { x, z } });
    m.maxHp = def.hp;
    const ctl = createBossBehaviour(def.id, {
      net: this.net, monster: m, def, fx: this.env.bossFx, startPhase: cp, emit: (ev) => this.feed(ev),
      onPhase: (p) => {
        if (this.save.campaign.current) this.save.campaign.current.checkpointPhase = p;
        this.net.persist();
        this.env.ui.bossPhase(def, p);
      },
    });
    if (!ctl) return;
    this.net.controllers.set(m.id, ctl);
    this.boss = { def, m, ctl };
    this.env.ui.bossIntro(def, m);
    if (cp > 0) this.env.ui.toast(`<b>⚑ Checkpoint:</b> phase ${cp + 1} · ${def.phases[cp].name}`, "good");
  }
  private endScript() { this.script?.dispose?.(); this.script = null; }
  private cleanupBoss() {
    if (this.boss) this.net.removeMonster(this.boss.m);
    this.boss = null; this.bossSpawnIn = -1;
  }

  // ======================================================================= end states
  fail(reason: string) {
    const d = this.def;
    if (!d || this.status !== "running") return;
    this.status = "failed"; this.busy = true;
    this.endScript();
    const rec = (this.save.campaign.chapters[d.id] ??= { done: false, stars: 0, fails: 0 });
    rec.fails++;
    this.net.persist();
    const cp = this.save.campaign.current?.checkpointPhase ?? 0;
    const boss = d.boss ? getBoss(d.boss) : undefined;
    const showHint = rec.fails >= 3;
    if (showHint) rec.assistOffered = true;
    this.env.ui.failed({
      chapter: d, reason, fails: rec.fails, hint: showHint ? d.hint : null, assistAvailable: showHint,
      checkpoint: boss && cp > 0 ? `Phase ${cp + 1}: ${boss.phases[cp].name}` : null,
    }, {
      retry: (assist) => { this.busy = false; this.start(d, { retry: true, assist }); },
      chart: () => { this.busy = false; this.start(null); this.env.openChart(); },
    });
  }

  private complete() {
    const d = this.def, obj = this.obj;
    if (!d || !obj || this.status !== "running") return;
    this.status = "completing"; this.busy = true;
    this.endScript();
    obj.finalize();
    const save = this.save, net = this.net;
    const stars = obj.stars;
    const damagePct = this.damageTaken / Math.max(1, net.maxHp);
    const grade = computeGrade({ stars, elapsedSec: this.elapsed, parSeconds: d.parSeconds, damagePct, assist: this.assist });
    const rec = (save.campaign.chapters[d.id] ??= { done: false, stars: 0, fails: 0 });
    const firstClear = !rec.done;
    const newBest = !rec.grade || betterGrade(rec.grade, grade) !== rec.grade || stars > rec.stars;
    rec.done = true; rec.stars = Math.max(rec.stars, stars); rec.grade = betterGrade(rec.grade, grade);
    rec.bestTime = Math.min(rec.bestTime ?? Infinity, Math.round(this.elapsed));
    rec.fails = 0;
    const k = firstClear ? 1 : 0.25;
    const xp = Math.round(d.rewards.xp * k), coins = Math.round(d.rewards.coins * k);
    const mats: Partial<Record<MaterialId, number>> = {};
    const add = (id: MaterialId, n: number) => { if (n > 0) mats[id] = (mats[id] ?? 0) + n; };
    if (firstClear) for (const [id, n] of Object.entries(d.rewards.materials ?? {})) add(id as MaterialId, n as number);
    add(this.region.material, obj.items.filter((o) => o.optional && o.state === "done").length * (firstClear ? 2 : 1));
    const boss = d.boss ? getBoss(d.boss) : undefined;
    if (boss) {
      add(boss.trophy, 1);
      if (!save.bossesBeaten.includes(boss.id)) {
        save.bossesBeaten.push(boss.id);
        if (!save.titles.includes(boss.title)) save.titles.push(boss.title);
        if (!save.cosmetics.includes(boss.cosmetic)) save.cosmetics.push(boss.cosmetic);
      }
    }
    for (const [id, n] of Object.entries(mats)) this.env.grantMaterial(id as MaterialId, n as number);
    if (firstClear && d.rewards.unlockRegion && !save.campaign.unlockedRegions.includes(d.rewards.unlockRegion)) save.campaign.unlockedRegions.push(d.rewards.unlockRegion);
    net.addXp(xp); net.addCoins(coins);
    save.campaign.current = null;
    const next = ChapterRunner.nextChapter(save);
    const result: ChapterResult = {
      chapter: d, stars, grade, elapsed: this.elapsed, damagePct, assist: this.assist,
      objectives: obj.items.map((o) => ({ title: o.def.title, done: o.state === "done", optional: o.optional })),
      xp, coins, materials: mats, firstClear, newBest, unlockText: firstClear ? d.rewards.text : undefined, next, boss,
    };
    this.env.onComplete(result);
    net.persist();
    const show = () => {
      this.env.ui.complete(result, {
        next: next ? () => { this.busy = false; next.region === this.region.id ? this.start(next.id) : this.env.openChart(); } : null,
        chart: () => { this.busy = false; this.start(null); this.env.openChart(); },
        free: () => { this.busy = false; this.start(null); },
        replay: () => { this.busy = false; this.start(d, { retry: true }); },
      });
    };
    setTimeout(() => {
      if (firstClear && d.outro?.length) this.env.ui.dialogue(d.outro, show, "Marlow");
      else show();
    }, 900);
  }

  // ======================================================================= HUD helpers
  trackerItems(): (MissionS & { optional?: boolean; state?: string; numText?: string })[] {
    const obj = this.obj;
    if (!obj) return [];
    const c = this.ctx();
    return obj.items.map((o, i) => ({
      id: `cmp_${i}_${o.def.id}`, title: o.def.title, progress: o.state === "done" ? o.target : Math.floor(o.progress), target: o.target, squad: false,
      optional: o.optional, state: o.state, numText: obj.numText(o, c),
    }));
  }
  get trackerLabel() { return this.def ? `CH.${this.def.id} ${this.def.title.toUpperCase()}` : `FREE ROAM · ${this.region.name.toUpperCase()}`; }
  /** HUD timer: countdown when there's a time limit, else elapsed vs par */
  timer(): { text: string; urgent: boolean; limit: boolean } | null {
    const d = this.def;
    if (!d || (this.status !== "running" && this.status !== "completing")) return null;
    if (this.wrapUp) return { text: "Return to the dock to finish", urgent: false, limit: false };
    if (d.fail?.timeLimit) { const left = d.fail.timeLimit - this.elapsed; return { text: fmt(left), urgent: left < 30, limit: true }; }
    return { text: `${fmt(this.elapsed)} / par ${fmt(d.parSeconds)}`, urgent: false, limit: false };
  }
  bossBar(): { name: string; hp: number; maxHp: number; pips: number[]; phase: number } | null {
    const b = this.boss;
    if (!b) return null;
    return { name: `${b.def.name} · ${b.def.phases[b.ctl.phase].name}`, hp: b.m.hp, maxHp: b.m.maxHp, pips: b.def.phases.slice(1).map((p) => p.atPct), phase: b.ctl.phase };
  }
  get bossId() { return this.boss?.m.id ?? null; }

  lockedBorder(): { r: number; label: string } | null {
    const z = this.net.zonesOpen;
    if (!z.reef) return { r: ZONES.shallows.maxR, label: "the Reef" };
    if (!z.abyss) return { r: ZONES.reef.maxR, label: "the Abyss" };
    return null;
  }

  /** contextual helper line (tutorial + hunt chapters) */
  hint(me: PlayerS | undefined, phase: string): string {
    const d = this.def;
    if (!d || !me || this.busy || this.status !== "running" || me.sunk) return "";
    const tut = d.setup?.tutorial;
    const touch = document.body.classList.contains("touch-mode");
    if (tut) {
      if (phase === "charging") return "Release to cast! A fuller meter throws further.";
      if (phase === "casting" || phase === "waiting") return "Wait for the bobber to dip…";
      if (phase === "bite") return touch ? "NOW! Tap HOOK to set the hook!" : "NOW! Press SPACE or click to set the hook!";
      if (phase === "reeling") return touch ? "Hold REEL to lift the green zone. Keep the fish inside it!" : "Hold SPACE / mouse to lift the green zone. Keep the fish inside it!";
      const bag = me.unbanked.length, banked = this.obj?.main.progress ?? 0;
      if (bag + banked < 3) return this.catches === 0 ? (touch ? "Hold CAST to charge a cast, then release." : "Hold SPACE (or left mouse) to charge a cast, then release.") : `Nice! Keep fishing: ${bag + banked}/3 fish.`;
      const r = Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z);
      return r < DOCK_RADIUS ? "Sail out of the golden ring and back in to bank your catch!" : `Sail into the golden ring at the dock to bank your catch (${touch ? "drag the left stick" : "W to sail, A/D to steer"}).`;
    }
    const sh = this.script?.hint?.(me, phase);
    if (sh) return sh;
    if (phase !== "idle") return "";
    const k = d.main.kind;
    if (k.type === "catch_species" && this.obj && !this.obj.mainDone) {
      const clock = this.env.clock;
      if (k.ids.includes("moonlit_eel")) {
        if (clock.phase !== "night") return Math.hypot(me.x, me.z) < DOCK_RADIUS + 4 ? (touch ? "🌙 Tap REST to wait for nightfall." : "🌙 Click REST (or press R) to wait for nightfall.") : "🌙 The eel only bites at night. Return to the dock and Rest.";
        if (!nearLandmark(this.region.id, "old_wreck", me.x, me.z)) return "🌙 Night has fallen. Sail to the Old Wreck and fish inside its glow!";
        return "";
      }
      if (k.ids.includes("tuna")) {
        if (this.save.baitEquipped !== "sardine") return (this.save.bait.sardine ?? 0) > 0 ? (touch ? "🪱 Equip your sardine: tap the bait slot." : "🪱 Equip your sardine: press B or click the bait slot.") : "🪱 Catch a Silver Sardine in the Shallows and keep it as bait.";
        const zone = Math.hypot(me.x, me.z) < ZONES.shallows.maxR ? "shallows" : "deep";
        if (zone === "shallows") return "🐟 Sardine ready! Sail past the buoys into the Reef for tuna.";
      }
    }
    return "";
  }
  /** for HUD labels */
  regionName() { return getRegion(this.region.id)?.name ?? ""; }
  materialName(id: MaterialId) { return MATERIALS[id].name; }
}
