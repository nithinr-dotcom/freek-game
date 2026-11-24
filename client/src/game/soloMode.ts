/**
 * Solo campaign glue: wires SoloNet + ChapterRunner + region/biome + clock + gear/skills + bait + load + codex +
 * achievements + bosses into the Game, and owns the solo-only screens and HUD. Multiplayer never creates one.
 */
import * as THREE from "three";
import {
  DOCK_POS, DOCK_RADIUS, MATERIALS, MATERIAL_DROP, COSMETICS_BY_ID, TITLES_BY_ID, DEFAULT_COSMETICS, getRegion, getCampaignSpecies, tierRank, zoneAt,
  getChapter, chaptersOfRegion, TIER_INFO, allChapters, regionList, LEGENDARY_SPECIES,
  type RegionDef, type MaterialId, type FishCardS, type MonsterS, type PlayerS, type WeatherTag, type Achievement, type RegionId, type CampaignChapter,
} from "@freek/shared";
import type { SoloNet, FishRoll } from "../solo/SoloNet";
import { SoloClock } from "../solo/clock";
import { ChapterRunner, type ChapterResult } from "../solo/chapterRunner";
import { Actors, type MapExtra } from "../solo/actors";
import { AchievementTracker } from "../solo/achievements";
import { recordCatch, regionCompletion } from "../solo/codex";
import { computeLoadout, loadFactor } from "../solo/loadout";
import { campaignRoll, speciesInfo } from "../solo/species";
import { regionClient, type RegionDecor } from "../solo/regions";
import type { BossFx } from "../solo/bosses";
import { HazardHost, EnvHost } from "../solo/hazards";
import { lineGate } from "../solo/lineGates";
import { Telegraphs } from "../fx/telegraphs";
import { applyFinaleUnlocks, playFinale, replayEnding, FINALE_CHAPTER } from "../solo/finale";
import { BountyRunner } from "../solo/bounties";
import { openBountyBoard } from "../ui/bountyBoard";
import "../p4.css";
import { CampaignScreens } from "../ui/campaignScreens";
import { SoloHud } from "../ui/soloHud";
import { openSeaChart } from "../ui/seaChart";
import { openWorkshop, skillPointsLeft } from "../ui/workshop";
import { openCodex } from "../ui/codex";
import type { Dialogue } from "../ui/dialogue";
import type { Hud } from "../ui/hud";
import type { Feed } from "../ui/feed";
import type { Labels } from "../ui/labels";
import type { ReelGame } from "../ui/reel";
import type { Effects } from "../fx/effects";
import type { ChaseCamera } from "./camera";
import type { LocalBoat } from "./localBoat";
import type { Fishing } from "./fishing";
import type { World } from "../world/world";
import type { Boat } from "../entities/Boat";
import type { MonsterEntity } from "../entities/Monster";
import { sfx } from "../audio";
import { h } from "../util";

export interface SoloGameCtx {
  ui: HTMLElement; scene: THREE.Scene; fx: Effects; labels: Labels; feed: Feed; hud: Hud; chase: ChaseCamera;
  local: LocalBoat; fishing: Fishing; reel: ReelGame; dialogue: Dialogue; world: World;
  boat(): Boat | undefined;
  monster(id: string): MonsterEntity | undefined;
  cinematic(x: number, z: number, dur: number): void;
  slowmo(scale: number, seconds: number): void;
  dev: boolean;
}

export class SoloMode {
  readonly region: RegionDef;
  readonly clock: SoloClock;
  readonly runner: ChapterRunner;
  readonly actors: Actors;
  readonly ach: AchievementTracker;
  /** P3 environment systems (cold, floes, sky, lantern, horrors, whirlpool); P2 hazards are `hazards` */
  readonly env: EnvHost;
  private finaleUnlocks: string[] | null = null;
  private screens: CampaignScreens;
  private shud: SoloHud;
  private tele: Telegraphs;
  private decor: RegionDecor | null = null;
  private lantern: THREE.PointLight | null = null;
  private modal: HTMLElement | null = null;
  private keepCard: FishCardS | null = null;
  private streak = 0;
  private wasAtDock = false;
  private restFade: HTMLElement;
  private cosApplied = "";
  /** region hazard systems (coral contact, lightning, …) */
  hazards: HazardHost | null = null;
  private tintEl: HTMLElement;
  /** a line-gated fish is on a line that can't hold it: tension forced up (s) */
  private gateSnap = 0;
  /** P4 Bounty Board (runs in free roam) */
  readonly bounty: BountyRunner;

  constructor(readonly net: SoloNet, private g: SoloGameCtx, startChapter?: number) {
    const save = net.save;
    this.region = getRegion(save.campaign.region) ?? getRegion("shallows_bay")!;
    if (this.region.stub) save.campaign.region = "shallows_bay";
    const R = this.region;
    g.world.ocean.setWater(R.biome.water.shallow, R.biome.water.mid, R.biome.water.deep);
    g.world.sky.setBiome(R.biome.sky.top, R.biome.sky.horizon);
    net.weather = R.weather;
    this.decor = regionClient(R.id)?.decorate?.(g.scene, R) ?? null;
    this.clock = new SoloClock(save.clockHour ?? 10);
    if (R.weather.endlessNight) this.clock.frozenAt = 0;
    this.actors = new Actors({ scene: g.scene, labels: g.labels, fx: g.fx });
    this.tele = new Telegraphs(g.scene);
    this.screens = new CampaignScreens(g.ui);
    this.restFade = h("div.rest-fade");
    this.tintEl = h("div.solo-tint");
    g.ui.append(this.restFade, this.tintEl);
    this.shud = new SoloHud(g.ui, g.hud.bagEl, {
      bait: () => this.baitKey(), keepBait: () => this.keepBait(), workshop: () => this.openWorkshop(), chart: () => this.openChart(), rest: () => this.rest(), codex: () => this.openCodex(),
      bounties: () => this.openBounties(), achievements: () => this.openCodex("ach"),
    });
    g.hud.setSoloStrip(true);
    this.ach = new AchievementTracker(save);
    this.ach.payCoins = (n) => net.addCoins(n);
    this.ach.onUnlock = (a) => this.onAchievement(a);
    this.updateCodexStat(true);
    setTimeout(() => this.ach.check(), 3000);

    // ---- SoloNet hooks
    net.extraTargets = () => this.actors.targets();
    net.hooks.onProgress = (ev) => {
      this.runner.onProgress(ev);
      if (this.runner.status === "free") this.bounty?.event(ev);
      if (ev.t === "snap") this.streak = 0;
    };
    net.hooks.onSunk = () => this.runner.onSunk();
    net.hooks.rollFish = (zone, storm, forceMinTier) => this.roll(zone, storm, forceMinTier);
    net.hooks.onLanded = (card, perfect, roll) => this.onLanded(card, perfect, roll);
    net.hooks.onBanked = (pts, cards) => { this.ach.max("bankTripMax", pts); void cards; };
    net.hooks.onMonsterKilled = (m, boss) => this.onMonsterKilled(m, boss);
    // P4: monster / horror loot comes from this region's campaign species (it used to roll the multiplayer table)
    net.hooks.rollLoot = (minTier, x, z) => {
      const r = campaignRoll({
        region: this.region.id, zone: zoneAt(x, z), storm: net.state.storm, time: this.clock.phase, weather: new Set(), x, z,
        bait: null, rareBonus: net.loadout.rareBonus, level: net.me.level, forceMinTier: minTier,
      });
      return { speciesId: r.species.id, tier: r.species.tier, weightKg: r.weightKg, points: r.points, behaviour: r.species.behaviour };
    };
    g.fishing.modsProvider = () => {
      const r = net.pendingRoll, L = net.loadout;
      if (!r) return null;
      const gate = lineGate(r.speciesId, L.ratingKg);
      this.gateSnap = gate ? 1 : 0;
      if (gate) setTimeout(() => g.feed.toast(gate, "bad", 4200), 300);
      return {
        behaviour: r.behaviour, weightKg: r.weightKg, ratingKg: L.ratingKg, fillMult: L.fillMult, liftMult: L.liftMult,
        zoneBonus: L.skills.zoneBonus, tensionMult: L.skills.tensionMult * (gate ? 3 : 1), secondWind: L.skills.secondWind && !gate,
        onSecondWind: () => { sfx.mission(); g.hud.showPrompt("💨 SECOND WIND!", "", 1.2); },
      };
    };

    const bossFx: BossFx = {
      lineTelegraph: (x1, z1, x2, z2, w, dur) => { this.tele.line(x1, z1, x2, z2, w, dur); sfx.announce(); },
      circleTelegraph: (x, z, r, dur) => this.tele.circle(x, z, r, dur),
      roar: (big) => sfx.roar(big),
      shake: (n) => g.chase.shake(n),
      splash: (x, z, s) => g.fx.splashAt(x, z, s),
      attackAnim: () => { const id = this.runner.bossId; if (id) g.monster(id)?.attack(); },
      announce: (t) => g.feed.announce(t, "#ff4fd8", "☠", true),
      dress: (id, rig, name, opts) => g.monster(id)?.setVisual(rig, name, opts),
      spark: (x, y, z, color, n) => g.fx.sparkAt(new THREE.Vector3(x, y, z), color, n ?? 30),
      float: (text, x, y, z, cls) => g.labels.float(text, new THREE.Vector3(x, y, z), cls ?? "hit", 1.2),
      tint: (color, a) => { this.tintEl.style.background = `radial-gradient(ellipse at center, transparent 18%, ${color} 70%)`; this.tintEl.style.opacity = String(Math.max(0, Math.min(1, a))); },
      toast: (html, cls) => g.feed.toast(html, cls ?? "", 3000),
    };

    this.env = new EnvHost({
      ui: g.ui, scene: g.scene, net, region: R, clock: this.clock, actors: this.actors, local: g.local, world: g.world, fx: g.fx, labels: g.labels,
      feed: g.feed, hud: g.hud, chase: g.chase, fishing: g.fishing, reel: g.reel, bossFx, cinematic: g.cinematic, slowmo: g.slowmo,
      boat: g.boat, monster: g.monster, runner: () => this.runner,
    });

    this.runner = new ChapterRunner({
      net, save, region: R, clock: this.clock, actors: this.actors, bossFx,
      setAssist: (on) => { net.setLoadout(computeLoadout(save, on)); net.damageMult = on ? 0.8 : 1; },
      onComplete: (r) => this.onChapterComplete(r),
      openChart: () => this.openChart(),
      grantMaterial: (id, n) => this.grantMaterial(id, n, false),
      meters: () => this.env.meters(),
      onStart: (d) => this.env.onStart(d),
      onEvent: (ev) => this.env.onEvent(ev),
      ui: {
        dialogue: (lines, done, title) => g.dialogue.show(lines, done, title),
        banner: (ch, region) => { this.hazards?.reset(); bossFx.tint?.("#000", 0); this.screens.showBanner(ch, region, this.runner.mode); g.hud.setRoom(ch ? `CH.${ch.act}-${ch.index}` : "FREE", false); },
        complete: (r, a) => {
          g.fishing.cancel();
          const unlocks = this.finaleUnlocks;
          this.finaleUnlocks = null;
          if (unlocks && r.chapter.id === FINALE_CHAPTER) playFinale({ ...this.env.ctx, dialogue: (l, d, t) => g.dialogue.show(l, d, t) }, unlocks, () => this.screens.showComplete(r, a));
          else this.screens.showComplete(r, a);
        },
        failed: (f, a) => { g.fishing.cancel(); this.tele.clear(); this.screens.showFailed(f, a); },
        toast: (html, cls) => g.feed.toast(html, cls ?? "", 3200),
        bossIntro: (def, m) => {
          const e = g.monster(m.id);
          if (e) e.root.scale.setScalar(1.7);
          g.cinematic(m.x, m.z, 3.4);
          this.screens.bossTitle(def);
          sfx.roar(true);
          g.chase.shake(0.7);
          g.feed.announce(`BOSS: ${def.name}`, "#ff4fd8", "☠", true);
        },
        bossPhase: (def, p) => { this.screens.bossPhaseCard(def, p); g.feed.flash("#ff2d6b", 0.5); },
        bossKilled: (def, m, done) => this.bossKillCinematic(def, m, done),
        closeOverlays: () => { this.screens.close(); this.closeModal(); },
      },
    });

    // ---- region hazards (P2): one system per flag in region.hazards
    this.hazards = new HazardHost({
      scene: g.scene, net, fx: g.fx, labels: g.labels, tele: this.tele, sky: g.world.sky, region: R,
      boat: () => g.local, npcs: () => this.actors.npcs,
      emit: (ev) => this.runner.feed(ev), toast: (html, cls) => g.feed.toast(html, cls ?? "", 2600), shake: (n) => g.chase.shake(n),
      live: () => (this.runner.status === "running" || this.runner.status === "free") && !this.runner.busy && !net.paused && !this.screens.visible,
    }, Object.entries(R.hazards).filter(([, on]) => on).map(([k]) => k));

    // ---- P4 Bounty Board
    this.bounty = new BountyRunner({
      save, region: R.id, zones: () => this.runner.freeRoamZones(), level: () => net.me.level, coins: () => net.me.coins,
      spend: (n) => { net.me.coins -= n; },
      pay: (coins, xp, mats) => { net.addCoins(coins); net.addXp(xp); for (const [id, n] of Object.entries(mats)) this.grantMaterial(id as MaterialId, n as number, true); sfx.levelUp(); },
      ctx: () => ({ elapsed: this.bounty.elapsed, npcHpPct: () => undefined, warmthPct: this.env.meters().warmth, fuelPct: this.env.meters().fuel, storm: net.state.storm, night: this.clock.phase === "night", monstersAlive: net.state.monsters.size, unbankedFish: net.me.unbanked.length }),
      toast: (html, cls) => g.feed.toast(html, cls ?? "", 3600), persist: () => net.persist(), bump: (stat) => this.ach.bump(stat),
    });

    // ---- first chapter
    const cur = save.campaign.current;
    const next = ChapterRunner.nextChapter(save);
    const pick = startChapter ?? (cur && getChapter(cur.chapterId)?.region === R.id ? cur.chapterId : next && next.region === R.id ? next.id : null);
    this.runner.start(pick);
    if (save.flags.migratedFromV1 && !save.stats.migrateToast) {
      save.stats.migrateToast = 1;
      setTimeout(() => g.feed.toast("<b>📜 Welcome back!</b> Your level, coins and trophies came with you. The new campaign starts at Act 1.", "good", 6000), 2500);
    }
  }

  // ======================================================================= fishing
  private weatherTags(): Set<WeatherTag> {
    const s = new Set<WeatherTag>();
    const st = this.net.state;
    if (st.storm) { s.add("storm"); s.add("rain"); }
    if (st.wind.gust) s.add("gust");
    if (this.region.weather.aurora && this.clock.phase === "night") s.add("aurora");
    this.env.weather(s);
    if (!s.size) s.add("clear");
    return s;
  }
  private roll(zone: ReturnType<typeof zoneAt>, storm: boolean, forceMinTier?: FishRoll["tier"]): FishRoll {
    const me = this.net.me, save = this.net.save;
    const bait = save.baitEquipped && (save.bait[save.baitEquipped] ?? 0) > 0 ? save.baitEquipped : null;
    const r = campaignRoll({
      region: this.region.id, zone, storm, time: this.clock.phase, weather: this.weatherTags(), x: me.bobX || me.x, z: me.bobZ || me.z,
      bait, rareBonus: this.net.loadout.rareBonus, level: me.level, setup: this.runner.def?.setup, forceMinTier,
    });
    if (r.usedBait && bait) {
      save.bait[bait] = Math.max(0, (save.bait[bait] ?? 0) - 1);
      if (!save.bait[bait]) { delete save.bait[bait]; save.baitEquipped = null; }
      this.g.feed.toast(`<b>🪱 Bait taken!</b> Something big bit the ${speciesInfo(bait)?.name ?? bait}…`, "good", 2600);
      this.net.persist();
    }
    return { speciesId: r.species.id, tier: r.species.tier, weightKg: r.weightKg, points: r.points, behaviour: r.species.behaviour, usedBait: r.usedBait };
  }

  private onLanded(card: FishCardS, perfect: boolean, roll: FishRoll) {
    const save = this.net.save, me = this.net.me;
    const first = recordCatch(save, card);
    const sp = speciesInfo(card.speciesId);
    if (first) {
      setTimeout(() => this.g.feed.toast(`<b>📖 New Codex entry:</b> ${sp?.name ?? card.speciesId}`, "good", 3200), 900);
      this.updateCodexStat();
    }
    // materials (§4): chance rises with tier; perfect reels give a skill bonus
    const drop = MATERIAL_DROP[tierRank(card.tier)];
    let n = Math.random() < drop.chance ? drop.n : 0;
    if (perfect) n += this.net.loadout.skills.perfectMats;
    if (n) setTimeout(() => this.grantMaterial(this.region.material, n, true), 700);
    // achievements
    this.streak++;
    this.ach.bump("fish");
    if (perfect) this.ach.bump("perfect");
    this.ach.max("streakMax", this.streak);
    if (roll.usedBait) this.ach.bump("baitCatches");
    this.ach.bump(`species_${card.speciesId}`);
    if (card.tier === "legendary") this.ach.bump("legendaries");
    if (card.tier === "legendary") this.ach.set("legendSpecies", LEGENDARY_SPECIES().filter((id) => save.codex[id]).length);
    // bait offer
    const cs = getCampaignSpecies(card.speciesId);
    if (cs?.baitable) { this.keepCard = card; setTimeout(() => this.shud.offerBait(cs.name), 600); }
    void me;
  }

  private updateCodexStat(silent = false) {
    const c = regionCompletion(this.net.save, this.region.id);
    const st = this.net.save.stats;
    st[`codex_${this.region.id}`] = c.pct;
    st.codexRegionsDone = regionList().filter((r) => regionCompletion(this.net.save, r.id).pct >= 100).length;
    if (!silent) this.ach.check();
  }

  grantMaterial(id: MaterialId, n: number, float: boolean) {
    const save = this.net.save;
    save.materials[id] = (save.materials[id] ?? 0) + n;
    const m = MATERIALS[id];
    const bp = this.g.boat()?.position;
    if (float && bp) this.g.labels.float(`+${n} ${m.icon}`, new THREE.Vector3(bp.x - 1.5, bp.y + 5.5, bp.z), "mat", 1.8);
    if (float) sfx.coin();
    this.net.persist();
  }

  // ======================================================================= bait
  private baitTypes() { const b = this.net.save.bait; return Object.keys(b).filter((k) => (b[k] ?? 0) > 0); }
  baitKey() {
    if (this.shud.offering && this.keepCard) { this.keepBait(); return; }
    const types = this.baitTypes(), save = this.net.save;
    if (!types.length) { this.g.feed.toast("No bait yet: keep a small fish (like a Silver Sardine) when you land one.", "", 2600); sfx.fail(); return; }
    const opts: (string | null)[] = [null, ...types];
    const i = opts.indexOf(save.baitEquipped);
    save.baitEquipped = opts[(i + 1) % opts.length];
    sfx.click();
    this.g.feed.toast(save.baitEquipped ? `<b>🪱 Bait:</b> ${speciesInfo(save.baitEquipped)?.name}` : "Bait removed", "", 1600);
    this.net.persist();
  }
  keepBait() {
    const card = this.keepCard;
    this.shud.closeOffer();
    this.keepCard = null;
    if (!card || !this.net.takeFromBag(card)) return;
    const save = this.net.save;
    save.bait[card.speciesId] = (save.bait[card.speciesId] ?? 0) + 1;
    if (!save.baitEquipped) save.baitEquipped = card.speciesId;
    sfx.mission();
    this.g.feed.toast(`<b>🪱 ${speciesInfo(card.speciesId)?.name} kept as bait</b>${save.baitEquipped === card.speciesId ? " · equipped" : ""}`, "good", 2400);
    this.net.persist();
  }

  // ======================================================================= dock actions
  get atDock() { const me = this.net.me; return !me.sunk && Math.hypot(me.x - DOCK_POS.x, me.z - DOCK_POS.z) < DOCK_RADIUS + 6; }
  rest() {
    if (!this.atDock || this.runner.busy) { this.g.feed.toast("Rest at the dock (inside the golden ring).", "bad", 2000); return; }
    if (this.region.weather.endlessNight) { this.g.feed.toast("There is no dawn in the Trench.", "bad", 2000); return; }
    this.g.fishing.cancel();
    this.restFade.classList.remove("go"); void this.restFade.offsetWidth; this.restFade.classList.add("go");
    sfx.levelUp();
    setTimeout(() => {
      const label = this.clock.rest();
      this.net.heal(999);
      this.net.save.clockHour = this.clock.hour;
      this.net.persist();
      this.g.feed.toast(`<b>🌙 You rest until ${label}.</b> Hull repaired.`, "good", 2600);
    }, 700);
  }
  private closeModal() { this.modal?.remove(); this.modal = null; }
  get modalOpen() { return !!this.modal?.isConnected; }
  openWorkshop(atDock = this.atDock) {
    const net = this.net;
    this.g.fishing.cancel();
    this.modal = openWorkshop(this.g.ui, {
      save: net.save, coins: () => net.me.coins, spend: (n) => { net.me.coins -= n; }, xp: () => net.me.xp, atDock,
      onChanged: (what) => {
        net.setLoadout(computeLoadout(net.save, this.runner.assist));
        if (what === "gear") this.ach.bump("crafts");
        if (what === "skills") this.ach.bump("skillPicks");
        this.cosApplied = "";
        net.persist();
      },
    });
  }
  openChart() {
    this.g.fishing.cancel();
    this.modal = openSeaChart(this.g.ui, {
      save: this.net.save, current: this.region.id,
      onPlay: (id) => { const c = getChapter(id)!; if (c.region !== this.region.id) this.travel(c.region, id); else this.runner.start(id); },
      onFreeRoam: (r) => { if (r !== this.region.id) this.travel(r); else this.runner.start(null); },
      onReplayEnding: () => { this.runner.busy = true; replayEnding(this.g.ui, this.net.save, this.g.dialogue, () => { this.runner.busy = false; }); },
    });
  }
  openCodex(tab: "fish" | "ach" = "fish") { this.g.fishing.cancel(); this.closeModal(); this.modal = openCodex(this.g.ui, this.net.save, tab); }
  /** regions are separate maps: travel = reload into that region */
  travel(r: RegionId, chapter?: number) {
    const def = getRegion(r);
    if (!def || def.stub || !chaptersOfRegion(r).length && def.stub) { this.g.feed.toast("Those waters aren't charted yet.", "bad", 2400); return; }
    this.net.save.campaign.region = r;
    this.net.persist();
    const p = new URLSearchParams(location.search);
    p.set("solo", "1"); p.set("region", r);
    if (chapter) p.set("chapter", String(chapter)); else p.delete("chapter");
    location.href = `${location.pathname}?${p}`;
  }

  // ======================================================================= bosses
  private onMonsterKilled(m: MonsterS, boss: boolean) {
    if (boss) {
      const id = this.runner.def?.boss;
      if (id) this.ach.bump(`boss_${id}`);
      if (this.runner.damageTaken === 0) {
        this.ach.bump("bossNoDamage");
        if (id) { this.net.save.stats[`flawless_${id}`] = 1; this.ach.set("flawlessBosses", ["reef_serpent", "crab_titan", "storm_kraken", "ice_leviathan", "maelstrom_eye"].filter((b) => this.net.save.stats[`flawless_${b}`]).length); }
      }
      if (this.runner.mode !== "normal") this.ach.bump("hardBosses");
      this.tele.clear();
    } else {
      const L = this.net.loadout.skills;
      if (L.lootMats) this.grantMaterial(this.region.material, L.lootMats, true);
    }
    this.runner.onMonsterKilled(m, boss);
  }
  private bossKillCinematic(def: { name: string; trophy: MaterialId }, m: MonsterS, done: () => void) {
    const g = this.g;
    g.slowmo(0.25, 1.8);
    g.feed.flash("#ffffff", 0.95);
    g.chase.shake(1);
    sfx.roar(true);
    const p = new THREE.Vector3(m.x, 3, m.z);
    g.fx.confettiAt(p);
    for (let i = 0; i < 6; i++) setTimeout(() => { g.fx.sparkAt(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8)), i % 2 ? "#ffd24a" : MATERIALS[def.trophy].color, 70); g.fx.splashAt(m.x + (Math.random() - 0.5) * 6, m.z + (Math.random() - 0.5) * 6, 2.5); }, 150 + i * 180);
    setTimeout(() => { this.screens.bossKill(def as never); sfx.catchJingle("legendary"); }, 500);
    setTimeout(done, 3000);
  }

  // ======================================================================= results
  private onChapterComplete(r: ChapterResult) {
    const save = this.net.save;
    this.ach.bump("chaptersDone");
    const act = chaptersOfRegion(r.chapter.region).filter((c) => c.act === r.chapter.act);
    this.ach.set(`actS_${r.chapter.act}`, act.filter((c) => save.campaign.chapters[c.id]?.grade === "S").length);
    if (act.every((c) => save.campaign.chapters[c.id]?.done)) this.ach.set(`actDone_${r.chapter.act}`, 1);
    if (r.chapter.id === FINALE_CHAPTER && r.mode === "normal") { const u = applyFinaleUnlocks(save); if (r.firstClear) this.finaleUnlocks = u; this.ach.check(); }
    // P4: S grades over every mode's best, Hard / Legendary clears, Legendary unlock
    const all = allChapters();
    const best = (id: number) => [save.campaign.chapters[id], save.campaign.modeRecords?.hard?.[id], save.campaign.modeRecords?.legendary?.[id]];
    this.ach.set("sGrades", all.filter((c) => best(c.id).some((x) => x?.grade === "S")).length);
    if (r.mode !== "normal") {
      if (r.mode === "hard" || r.mode === "legendary") this.ach.bump("hardClears");
      if (r.mode === "legendary") this.ach.bump("legendaryClears");
      const hardAll = all.filter((c) => save.campaign.modeRecords?.hard?.[c.id]?.done || save.campaign.modeRecords?.legendary?.[c.id]?.done).length;
      this.ach.set("hardAll", hardAll);
      this.ach.set("legendaryAll", all.filter((c) => save.campaign.modeRecords?.legendary?.[c.id]?.done).length);
      if (hardAll >= all.length && !save.flags.legendaryUnlocked) {
        save.flags.legendaryUnlocked = true;
        setTimeout(() => this.g.feed.toast("<b>👑 Legendary mode unlocked!</b> Hard rules, and every chapter is ironman. Pick it on the Sea Chart.", "good", 6000), 1500);
      }
    }
    this.cosApplied = "";
  }
  private onAchievement(a: Achievement) {
    const r = a.reward;
    const txt = [r?.title ? `Title: ${TITLES_BY_ID[r.title]?.name}` : "", r?.cosmetic ? `Cosmetic: ${COSMETICS_BY_ID[r.cosmetic]?.name}` : "", r?.coins ? `+${r.coins} coins` : ""].filter(Boolean).join(" · ");
    this.shud.achievement(a, txt);
    sfx.mission();
    this.net.persist();
  }

  // ======================================================================= per frame
  get busy() { return this.runner.busy || this.screens.visible; }
  get overlayOpen() { return this.busy || this.modalOpen; }

  update(dt: number, me: PlayerS | undefined, paused: boolean) {
    const g = this.g, net = this.net, save = net.save;
    if (!paused) this.clock.update(dt);
    save.clockHour = this.clock.hour;
    g.world.sky.forcedHour = this.clock.hour;
    const night = g.world.sky.night;
    this.runner.update(paused ? 0 : dt, me);
    this.tele.update(dt, performance.now() / 1000);
    this.hazards?.update(paused ? 0 : dt, performance.now() / 1000);
    if (this.gateSnap > 0 && g.reel.active && !paused) g.reel.tension = Math.max(g.reel.tension, Math.min(1.05, g.reel.tension + dt * 0.75));
    else if (!g.reel.active) this.gateSnap = 0;
    this.decor?.update(dt, performance.now() / 1000, night);
    // lantern + night visibility
    const L = net.loadout;
    const boat = g.boat();
    if (boat && !this.lantern) { this.lantern = new THREE.PointLight("#ffcf7a", 0, L.lightRadius, 1.2); this.lantern.position.set(0, 3, 0); boat.root.add(this.lantern); }
    if (this.lantern) { this.lantern.intensity = night * (6 + L.lightRadius * 0.35); this.lantern.distance = L.lightRadius * 1.6; }
    g.world.sky.visMult = 1 - night * (0.5 - Math.min(0.4, L.lightRadius / 160));
    // cosmetics
    const eq = save.equipped;
    const sig = `${eq.paint}|${eq.sail}|${eq.flag}|${save.title}`;
    if (boat && sig !== this.cosApplied) {
      this.cosApplied = sig;
      boat.applyCosmetics({ paint: COSMETICS_BY_ID[eq.paint] ?? COSMETICS_BY_ID[DEFAULT_COSMETICS.paint], sail: COSMETICS_BY_ID[eq.sail] ?? COSMETICS_BY_ID[DEFAULT_COSMETICS.sail], flag: COSMETICS_BY_ID[eq.flag] ?? COSMETICS_BY_ID[DEFAULT_COSMETICS.flag] });
      boat.setTitle(TITLES_BY_ID[save.title]?.name ?? "");
    }
    // load (§3)
    const kg = me ? me.unbanked.reduce((a, c) => a + c.weightKg, 0) : 0;
    const lf = loadFactor(kg, L.capacityKg);
    g.local.speedMult = lf * L.skills.speedMult;
    g.local.windMult = L.skills.windMult;
    if (kg >= 50) this.ach.max("heavyLoadKg", Math.floor(kg));
    // hud
    g.hud.maxHp = net.maxHp;
    g.hud.cooldownMs = L.harpoonCooldownMs;
    const atDock = this.atDock && !this.runner.busy && g.fishing.phase === "idle";
    if (atDock && !this.wasAtDock && save.flags.seenWorkshop !== true && (save.materials.shell ?? 0) >= 4) g.feed.toast("🔨 You have shells: open the <b>Workshop</b> to craft better gear.", "good", 3600);
    this.wasAtDock = atDock;
    const bait = save.baitEquipped && save.bait[save.baitEquipped] ? { name: speciesInfo(save.baitEquipped)?.name ?? save.baitEquipped, count: save.bait[save.baitEquipped] } : null;
    this.shud.update(dt, {
      clock: this.clock.label, phase: this.clock.phase, timer: this.runner.timer(), title: TITLES_BY_ID[save.title]?.name ?? "",
      loadKg: kg, capKg: L.capacityKg, loadFactor: lf, bait, baitTypes: this.baitTypes().length,
      atDock, restLabel: this.clock.restTarget.label, skillPoints: Math.max(0, skillPointsLeft(save, me?.xp ?? save.xp)),
    });
    this.env.update(dt, me, paused);
    if (this.runner.status === "free" && !this.runner.busy && !paused && !this.screens.visible) this.bounty.tick(dt);
  }

  // ======================================================================= P4: bounties, tracker
  openBounties() {
    if (!this.atDock) { this.g.feed.toast("The Bounty Board is at the dock.", "", 1800); return; }
    this.g.fishing.cancel();
    this.modal = openBountyBoard(this.g.ui, { runner: this.bounty, coins: () => this.net.me.coins, canAccept: this.runner.status === "free", regionId: this.region.id });
  }
  get trackerLabel() { return this.runner.status === "free" && this.bounty.active ? `BOUNTY · ${this.region.name.toUpperCase()}` : this.runner.trackerLabel; }
  trackerItems() { return this.runner.status === "free" ? this.bounty.trackerItems() : this.runner.trackerItems(); }

  onKey(code: string): boolean {
    if (this.overlayOpen) return false;
    switch (code) {
      case "KeyB": this.baitKey(); return true;
      case "KeyC": this.openCodex(); return true;
      case "Digit1": if (this.atDock) this.openWorkshop(); else this.g.feed.toast("The Workshop is at the dock.", "", 1600); return true;
      case "Digit2": this.openChart(); return true;
      case "Digit3": this.openBounties(); return true;
      case "KeyV": this.openCodex("ach"); return true;
      case "KeyR": if (this.atDock) this.rest(); return true;
    }
    return false;
  }

  hint(me: PlayerS | undefined, phase: string) { return this.runner.hint(me, phase) || (this.runner.busy ? "" : this.env.hint(me, phase)); }
  mapExtras(): MapExtra[] {
    const lm = this.region.landmarks.filter((l) => l.kind === "wreck").map((l) => ({ x: l.x, z: l.z, icon: "⚓", color: this.clock.phase === "night" ? "#a8c0ff" : "#d9c9a8", pulse: this.clock.phase === "night" }));
    return [...lm, ...this.actors.mapExtras(), ...this.env.mapExtras()];
  }
  bossBar() { return this.runner.bossBar(); }
  isBoss(id: string) { return this.runner.bossId === id; }
  tierColor(card: FishCardS) { return TIER_INFO[card.tier].color; }
  /** for the dev API */
  startCustom(def: CampaignChapter) { this.runner.start(def); }
}
