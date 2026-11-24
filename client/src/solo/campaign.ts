/** Campaign controller: chapter flow, objectives, scripted events, stars, rewards, zone locks, tutorial hints. */
import {
  CHAPTERS, CAMPAIGN_ENDING, FREE_PLAY_CHAPTER, DOCK_POS, DOCK_RADIUS, ZONES, zonesOpenAt, chapterStars, objectiveTarget,
  type ChapterDef, type MissionS, type MonsterS, type PlayerS,
} from "@freek/shared";
import type { SoloNet } from "./SoloNet";
import { applyEvent, type ProgressEvent } from "./progress";

export interface ChapterResult {
  chapter: ChapterDef; stars: number; elapsed: number; sank: boolean; speedStar: boolean; noSinkStar: boolean;
  xp: number; coins: number; unlockText?: string; replay: boolean; isFinal: boolean;
}

export interface CampaignUI {
  dialogue(lines: string[], onDone: () => void, title?: string): void;
  chapterStart(def: ChapterDef | null): void;
  chapterComplete(r: ChapterResult, onNext: () => void): void;
  ending(onDone: () => void): void;
  toast(html: string, cls?: string): void;
  bossIntro(m: MonsterS): void;
}

export class Campaign {
  def: ChapterDef | null = null;
  /** replaying an already finished chapter (progress not stored in save.current) */
  replay = false;
  private progress: number[] = [];
  private elapsed = 0;
  private sank = false;
  private completing = false;
  private scriptedCooldown = 0;
  private stormNag = 0;
  private bossShown = false;
  /** true while a modal campaign screen (dialogue/complete) is up */
  busy = false;
  private stats = { casts: 0, hooks: 0, catches: 0 };

  constructor(private net: SoloNet, private ui: CampaignUI) {
    net.hooks.onProgress = (ev) => this.onProgress(ev);
    net.hooks.onSunk = () => { this.sank = true; if (!this.replay && this.def) { this.net.save.current.sank = true; } };
    net.hooks.onMonsterSurface = (m, boss) => {
      if (boss && this.def?.script?.boss && !this.bossShown) { this.bossShown = true; this.ui.bossIntro(m); }
    };
  }

  get chapterId() { return this.def?.id ?? FREE_PLAY_CHAPTER; }
  get freePlay() { return !this.def; }

  /** start the save's current chapter, or replay `replayId` */
  start(replayId?: number) {
    const save = this.net.save;
    const id = replayId ?? save.chapter;
    this.def = CHAPTERS.find((c) => c.id === id) ?? null;
    this.replay = replayId !== undefined && replayId < save.chapter;
    this.completing = false;
    this.bossShown = false;
    this.scriptedCooldown = 8;
    // zones: what the furthest-reached chapter allows (replays keep everything you earned)
    const open = zonesOpenAt(Math.max(save.chapter, id));
    save.unlocks.reef = save.unlocks.reef || open.reef;
    save.unlocks.abyss = save.unlocks.abyss || open.abyss;
    this.net.zonesOpen = { shallows: true, reef: save.unlocks.reef, abyss: save.unlocks.abyss };
    this.net.rerollImpossibleMissions();
    const d = this.def;
    this.net.tutorial = !!d?.tutorial;
    this.net.legendaryBoost = d?.script?.legendaryBoost ?? 1;
    this.net.randomKraken = !(d?.script?.boss);
    this.net.randomMonsters = !d || d.id >= 3;
    if (d) {
      const cur = save.current;
      const fresh = this.replay || cur.progress.length !== d.objectives.length;
      this.progress = fresh ? d.objectives.map(() => 0) : cur.progress.slice();
      this.elapsed = fresh ? 0 : cur.elapsed;
      this.sank = fresh ? false : cur.sank;
      if (!this.replay && fresh) { save.current = { progress: this.progress.slice(), elapsed: 0, sank: false, introSeen: false }; }
      if (d.script?.forceStormAfterMs) this.net.forceStorm(d.script.forceStormAfterMs);
      this.net.persist();
      this.ui.chapterStart(d);
      const showIntro = this.replay || !save.current.introSeen;
      if (showIntro) {
        this.busy = true;
        this.ui.dialogue(d.intro, () => {
          this.busy = false;
          if (!this.replay) { save.current.introSeen = true; this.net.persist(); }
          if (d.opensZone) this.ui.toast(`<b>${ZONES[d.opensZone].name} unlocked!</b> The way is open.`, "good");
        }, `Chapter ${d.id}: ${d.title}`);
      }
    } else {
      this.progress = [];
      this.ui.chapterStart(null);
    }
  }

  private onProgress(ev: ProgressEvent) {
    if (ev.t === "catch") this.stats.catches++;
    const d = this.def;
    if (!d || this.completing) return;
    let changed = false;
    d.objectives.forEach((o, i) => {
      const t = objectiveTarget(o.kind);
      // tutorial objectives unlock in order (bank only after the 3 catches)
      if (d.tutorial && d.objectives.slice(0, i).some((p, j) => this.progress[j] < objectiveTarget(p.kind))) return;
      const before = this.progress[i];
      this.progress[i] = Math.min(t, applyEvent(o.kind, before, ev));
      if (this.progress[i] !== before) {
        changed = true;
        if (this.progress[i] >= t) this.ui.toast(`<b>✔ ${o.title}</b>`, "good");
      }
    });
    if (changed && !this.replay) { this.net.save.current.progress = this.progress.slice(); this.net.persist(); }
    if (d.objectives.every((o, i) => this.progress[i] >= objectiveTarget(o.kind))) this.complete();
  }

  /** dev helper: finish the current chapter now */
  completeNow() {
    const d = this.def;
    if (!d) return;
    this.progress = d.objectives.map((o) => objectiveTarget(o.kind));
    this.complete();
  }

  private complete() {
    const d = this.def;
    if (!d || this.completing) return;
    this.completing = true;
    const save = this.net.save;
    const stars = chapterStars(this.elapsed, d.parSeconds, this.sank);
    const result: ChapterResult = {
      chapter: d, stars, elapsed: this.elapsed, sank: this.sank, speedStar: this.elapsed <= d.parSeconds, noSinkStar: !this.sank,
      xp: this.replay ? Math.round(d.reward.xp * 0.25) : d.reward.xp, coins: this.replay ? Math.round(d.reward.coins * 0.25) : d.reward.coins,
      unlockText: this.replay ? undefined : d.reward.unlockText, replay: this.replay, isFinal: d.id === CHAPTERS.length && !this.replay,
    };
    save.stars[d.id] = Math.max(save.stars[d.id] ?? 0, stars);
    save.bestTimes[d.id] = Math.min(save.bestTimes[d.id] ?? Infinity, Math.round(this.elapsed));
    if (!this.replay) {
      if (d.reward.unlock === "harpoon_upgrade") save.unlocks.harpoonUpgrade = true;
      if (d.reward.unlock === "legendary_rod") save.unlocks.legendaryRod = true;
      save.chapter = d.id + 1;
      if (save.chapter > CHAPTERS.length) save.finished = true;
      save.current = { progress: [], elapsed: 0, sank: false, introSeen: false };
    }
    this.net.addXp(result.xp);
    this.net.addCoins(result.coins);
    this.net.persist();
    this.busy = true;
    setTimeout(() => {
      this.ui.chapterComplete(result, () => {
        this.busy = false;
        if (result.isFinal) {
          this.busy = true;
          this.ui.dialogue(CAMPAIGN_ENDING, () => this.ui.ending(() => { this.busy = false; this.start(); }), "Epilogue");
        } else if (this.replay) this.start();
        else this.start();
      });
    }, 1200);
  }

  /** per-frame: timers, scripted spawns, storm nagging */
  update(dt: number, me: PlayerS | undefined) {
    const d = this.def;
    if (!d || !me || this.completing) return;
    if (!this.busy && !this.net.paused) {
      this.elapsed += dt;
      if (!this.replay) this.net.save.current.elapsed = this.elapsed;
    }
    const r = Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z);
    // scripted monster
    const kind = d.script?.monster;
    const killIdx = d.objectives.findIndex((o) => o.kind.type === "monster_kill");
    if (kind && killIdx >= 0 && this.progress[killIdx] < objectiveTarget(d.objectives[killIdx].kind)) {
      this.scriptedCooldown -= dt;
      const inZone = kind === "kraken" ? r > ZONES.reef.maxR + 10 : r > ZONES.shallows.maxR - 40;
      if (this.scriptedCooldown <= 0 && !me.sunk && inZone && !this.net.hasMonster(kind) && !this.busy) {
        this.scriptedCooldown = 20;
        this.net.spawnMonster(kind, { scripted: true, boss: d.script?.boss, dist: kind === "kraken" ? 70 : 50 });
        if (!this.bossShown && d.script?.boss) this.ui.toast("The water churns… something huge is rising!", "bad");
      }
    }
    // storm objective: make sure a storm comes around
    const stormIdx = d.objectives.findIndex((o) => o.kind.type === "storm_catch");
    if (stormIdx >= 0 && this.progress[stormIdx] < objectiveTarget(d.objectives[stormIdx].kind) && !this.net.storming) {
      this.stormNag -= dt;
      if (this.stormNag <= 0) {
        this.stormNag = 30;
        const until = this.net.state.nextStormAt - this.net.state.serverTime;
        if (until > 120_000) this.net.forceStorm(90_000);
      }
    }
  }

  /** objectives as tracker rows */
  trackerItems(): MissionS[] {
    const d = this.def;
    if (!d) return [];
    return d.objectives.map((o, i) => ({ id: `cmp_${o.id}`, title: o.title, progress: this.progress[i] ?? 0, target: objectiveTarget(o.kind), squad: false }));
  }
  get trackerLabel() { return this.def ? `CH.${this.def.id} ${this.def.title.toUpperCase()}` : "FREE PLAY"; }
  get elapsedSec() { return this.elapsed; }

  /** first locked zone border (radius) and the chapter that opens it */
  lockedBorder(): { r: number; chapter: number } | null {
    const u = this.net.zonesOpen;
    if (!u.reef) return { r: ZONES.shallows.maxR, chapter: 2 };
    if (!u.abyss) return { r: ZONES.reef.maxR, chapter: 4 };
    return null;
  }

  /** chapter 1 tutorial prompt for the HUD */
  tutorialHint(me: PlayerS | undefined, phase: string): string {
    const d = this.def;
    if (!d?.tutorial || !me || this.busy) return "";
    const done = (i: number) => this.progress[i] >= objectiveTarget(d.objectives[i].kind);
    if (me.sunk) return "";
    if (phase === "charging") return "Release to cast! A fuller meter throws further.";
    if (phase === "casting" || phase === "waiting") return "Wait for the bobber to dip…";
    if (phase === "bite") return "NOW! Press SPACE or click to set the hook!";
    if (phase === "reeling") return "Hold SPACE / mouse to lift the green zone. Keep the fish inside it!";
    if (!done(0)) return this.stats.catches === 0 ? "Hold SPACE (or left mouse) to charge a cast, then release." : `Nice! Keep fishing: ${this.progress[0]}/3 fish.`;
    const r = Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z);
    if (!done(1)) return r < DOCK_RADIUS ? "Sail out of the golden ring and back in to bank your catch!" : "Sail into the golden ring at the dock to bank your catch (W to sail, A/D to steer).";
    return "";
  }
}
