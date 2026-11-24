/** Orchestrates renderer, world, entities, local control, network events and UI. */
import * as THREE from "three";
import {
  MOVE_SEND_HZ, HARPOON_COOLDOWN_MS, HARPOON_RANGE, SQUADS, TIER_INFO, BOAT_MAX_HP, RESPAWN_MS, DOCK_POS,
  zoneAt, tierRank, MONSTERS, type PlayerS, type MonsterS, type SquadS, type WindS, type SquadId,
} from "@freek/shared";
import type { GameNet } from "./types";
import { Input } from "./input";
import { ChaseCamera } from "./camera";
import { LocalBoat } from "./localBoat";
import { Fishing } from "./fishing";
import { SoloNet } from "../solo/SoloNet";
import { SoloMode } from "./soloMode";
import type { SoloModeLike } from "./modeLike";
import { EndlessMode, type EndlessOpts } from "../endless/EndlessMode";
import { Companion } from "../entities/Companion";
import { PhotoMode } from "./photoMode";
import { openAquarium } from "../ui/aquarium";
import { currentCompanion } from "../endless/meta";
import { loadSettings, type Settings } from "../solo/save";
import { Dialogue } from "../ui/dialogue";
import { PauseMenu } from "../ui/pauseMenu";
import { ZoneBarriers } from "../world/barrier";
import { gfxTier, haptics, InputMode, type GfxTier } from "./device";
import { TouchControls } from "../ui/touchControls";
import { openSettingsModal } from "../ui/settings";
import { World } from "../world/world";
import { Boat } from "../entities/Boat";
import { MonsterEntity } from "../entities/Monster";
import { FishingLine } from "../entities/FishingLine";
import { Effects } from "../fx/effects";
import { Labels } from "../ui/labels";
import { Hud } from "../ui/hud";
import { Minimap } from "../ui/minimap";
import { Feed } from "../ui/feed";
import { MissionTracker } from "../ui/missions";
import { Chat } from "../ui/chat";
import { Help } from "../ui/help";
import { SquadPicker } from "../ui/squadPicker";
import { ReelGame } from "../ui/reel";
import { Reveal } from "../ui/reveal";
import { Leaderboard } from "../ui/leaderboard";
import { sfx } from "../audio";
import { arr, damp, dampAngle, mapEach, h } from "../util";

interface RemoteTarget { x: number; z: number; rot: number; speed: number }

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private world: World;
  private fx: Effects;
  private labels: Labels;
  private input: Input;
  private chase: ChaseCamera;
  private local = new LocalBoat();
  private clock = { last: performance.now(), getDelta(): number { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; return d; } };
  private time = 0;
  private net: GameNet | null = null;
  private boats = new Map<string, Boat>();
  private targets = new Map<string, RemoteTarget>();
  private lines = new Map<string, FishingLine>();
  private monsters = new Map<string, MonsterEntity>();
  private prevSunk = new Map<string, boolean>();
  private uiRoot: HTMLElement;
  private hud!: Hud; private minimap!: Minimap; private feed!: Feed; private missions!: MissionTracker; private chat!: Chat;
  private help!: Help; private squadPicker!: SquadPicker; private reel!: ReelGame; private reveal!: Reveal; private board!: Leaderboard;
  private fishing: Fishing | null = null;
  private moveAcc = 0;
  private harpoonReadyAt = 0;
  private sunkAt = 0;
  private haveSnapped = false;
  private tabDownAt = 0;
  private timeOffset = 0;
  private lastStorm = false;
  private attractAngle = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();
  private fps = { acc: 0, frames: 0, el: null as HTMLElement | null };
  private disconnected = false;
  // ---- solo
  private solo: SoloNet | null = null;
  private soloMode: SoloModeLike | null = null;
  private campaign: SoloMode | null = null;
  private endless: EndlessMode | null = null;
  private companion: Companion | null = null;
  private photo: PhotoMode | null = null;
  private dialogue!: Dialogue;
  private pause!: PauseMenu;
  /** slow motion (boss kill cinematic) */
  private timeScale = 1; private slowFor = 0;
  private barriers: ZoneBarriers;
  private dev = new URLSearchParams(location.search).get("dev") === "1";
  private lockToastAt = 0;
  private cinematic: { x: number; z: number; t: number; dur: number } | null = null;
  private tier: GfxTier = gfxTier();
  private touch: TouchControls | null = null;
  private aimLine: THREE.Line;
  private aimTarget: THREE.Vector3 | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, labelsRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.tier.dprCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 2500);
    this.camera.position.set(40, 30, 60);
    this.world = new World(this.scene, this.tier);
    this.fx = new Effects(this.scene, this.tier);
    this.aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: "#ffd24a", dashSize: 1.5, gapSize: 1, transparent: true, opacity: 0.9, depthTest: false }));
    this.aimLine.visible = false;
    this.aimLine.frustumCulled = false;
    this.aimLine.renderOrder = 5;
    this.scene.add(this.aimLine);
    this.world.sky.onThunder = (d) => sfx.thunder(d);
    this.labels = new Labels(labelsRoot);
    this.input = new Input(canvas);
    this.chase = new ChaseCamera(this.camera);
    this.barriers = new ZoneBarriers(this.scene);
    this.applySettings(loadSettings());
    window.addEventListener("resize", () => this.resize());
    window.visualViewport?.addEventListener("resize", () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private resize() {
    const w = window.innerWidth, hh = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.tier.dprCap));
    this.renderer.setSize(w, hh, false);
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
  }

  applySettings(s: Settings) {
    sfx.setVolume(s.volume);
    this.chase.sensitivity = s.camSensitivity;
    const t = gfxTier(s.graphics);
    if (t.dprCap !== this.tier.dprCap || t.shadowSize !== this.tier.shadowSize) {
      this.tier = { ...this.tier, dprCap: t.dprCap, shadowSize: t.shadowSize };
      const sh = this.world?.sky.sun.shadow;
      if (sh && sh.mapSize.x !== t.shadowSize) { sh.mapSize.set(t.shadowSize, t.shadowSize); sh.map?.dispose(); sh.map = null as unknown as THREE.WebGLRenderTarget; }
      this.resize();
    }
  }

  // ======================================================================= attach
  attach(net: GameNet, opts: { chapter?: number; endless?: EndlessOpts } = {}) {
    this.net = net;
    const ui = this.uiRoot;
    this.hud = new Hud(ui);
    this.minimap = new Minimap(ui);
    this.missions = new MissionTracker(ui);
    this.feed = new Feed(ui);
    this.chat = new Chat(ui);
    this.reel = new ReelGame(ui);
    this.reveal = new Reveal(ui);
    this.board = new Leaderboard(ui);
    this.squadPicker = new SquadPicker(ui);
    this.help = new Help(ui, this.dev && net instanceof SoloNet);
    this.fps.el = h("div.fps");
    if (new URLSearchParams(location.search).has("fps")) ui.append(this.fps.el);
    this.hud.setRoom(net.code, net.isPrivate);
    this.hud.onSquadClick = () => this.squadPicker.show();
    this.hud.onHelp = () => this.help.toggle();
    this.hud.onBoard = () => { if (this.board.visible) this.board.hide(); else { this.board.pinned = true; this.board.show(); } };
    this.hud.onMute = () => sfx.toggleMute();
    this.hud.onSettings = () => openSettingsModal(ui, (st) => this.applySettings(st));
    if (window.innerWidth < 700 || window.innerHeight < 500) this.missions.setCollapsed(true);
    this.squadPicker.onPick = (s) => { net.send("setSquad", { squad: s }); sfx.click(); };
    this.chat.onSend = (t) => net.send("chat", { text: t });
    this.reel.onClick = () => sfx.reelClick();
    this.fishing = new Fishing(net, this.hud, this.reel);
    this.setupTouch(net);
    this.fishing.onBite = () => {
      haptics.bite();
      const me = this.me;
      if (me) this.fx.splashAt(me.bobX, me.bobZ, 0.7);
      this.lines.get(net.sessionId)?.bite();
    };

    // ---- schema state callbacks
    net.onPlayerAdd((p, id) => this.addBoat(p, id));
    net.onPlayerRemove((_p, id) => this.removeBoat(id));
    net.onMonsterAdd((m, id) => this.addMonster(m, id));
    net.onMonsterRemove((_m, id) => this.removeMonster(id));
    net.onDisconnect((code) => {
      if (this.disconnected) return;
      this.disconnected = true;
      this.feed.announce(`Disconnected from the server (${code}). Reload to rejoin.`, "#ff6b6b", "⚠", true);
      const o = h("div.overlay.show.disconnect", null, h("div.modal", null, h("h2", null, "Lost at sea"), h("p", null, "The connection to the server was lost."), h("button.tb-btn.primary", { onclick: () => location.reload() }, "Back to lobby")));
      ui.append(o);
    });

    // ---- messages
    net.on("catch", (p) => {
      haptics.catch(p.card.tier);
      const tier = p.card.tier;
      const ti = TIER_INFO[tier];
      const rank = tierRank(tier);
      this.feed.flash(ti.color, 0.25 + rank * 0.12);
      sfx.catchJingle(tier);
      this.reveal.show(p.card, { newBest: p.newBest, xp: p.xp, perfect: p.perfect, zone: p.zone });
      const bp = this.boats.get(net.sessionId)?.position;
      if (bp) {
        this.fx.splashAt(bp.x, bp.z, 1 + rank * 0.4);
        this.labels.float(`+${p.xp} XP`, this.tmp.set(bp.x, bp.y + 6, bp.z), "xp", 1.8);
        this.labels.float(`+${p.card.points}`, this.tmp.set(bp.x + 1.5, bp.y + 4.5, bp.z), "pts", 1.6);
        if (rank >= 3) this.fx.confettiAt(this.tmp.set(bp.x, bp.y + 3, bp.z));
      }
      if (tier === "legendary") this.chase.shake(0.9);
      else if (tier === "epic") this.chase.shake(0.4);
    });
    net.on("announce", (p) => this.onAnnounce(p));
    net.on("missionComplete", (p) => {
      this.feed.missionBanner(p.title, p.xp, p.coins, p.squad);
      this.missions.burst();
      sfx.mission();
    });
    net.on("levelUp", (p) => {
      haptics.levelUp();
      this.feed.levelUp(p.level);
      sfx.levelUp();
      this.fishing!.level = p.level;
      const bp = this.boats.get(net.sessionId)?.position;
      if (bp) this.fx.confettiAt(this.tmp.set(bp.x, bp.y + 3, bp.z));
    });
    net.on("banked", (p) => {
      if (!p.fish && !p.points) return;
      sfx.coin();
      this.feed.toast(`<b>⚓ Banked ${p.fish} fish</b> · +${p.points} squad points`, "good", 3200);
      const bp = this.boats.get(net.sessionId)?.position;
      if (bp) this.labels.float(`+${p.points} BANKED`, this.tmp.set(bp.x, bp.y + 5, bp.z), "banked", 2);
    });
    net.on("damaged", (p) => {
      haptics.damage();
      this.chase.shake(0.35 + Math.min(0.6, p.amount / 50));
      this.hud.damageFlash(p.amount / 40);
      sfx.damage();
      const bp = this.boats.get(net.sessionId)?.position;
      if (bp) this.labels.float(`-${p.amount}`, this.tmp.set(bp.x, bp.y + 4, bp.z), "dmg", 1.2);
    });
    net.on("harpoonFx", (p) => this.onHarpoonFx(p));
    net.on("monsterAttack", (p) => this.onMonsterAttack(p));
    net.on("monsterLoot", (p) => {
      p.cards.forEach((c, i) => setTimeout(() => {
        sfx.catchJingle(c.tier);
        this.feed.flash(TIER_INFO[c.tier].color, 0.4);
        this.reveal.show(c, { title: "MONSTER LOOT!" });
      }, 600 + i * 400));
    });
    net.on("hallOfFame", (p) => this.board.setHallOfFame(arr(p.entries)));
    net.on("chat", (p) => this.chat.add(p.from, p.text, p.squad));
    net.on("error", (p) => this.feed.toast(`⚠ ${p.message}`, "bad", 3000));

    // ---- input
    this.input.onPrimaryDown = () => { sfx.unlock(); if (this.overlayOpen) return; this.fishing?.primaryDown(this.me); };
    this.input.onPrimaryUp = () => this.fishing?.primaryUp(this.chase.heading);
    this.input.onPrimaryCancel = () => this.fishing?.cancelCharge();
    this.input.onSecondary = () => { sfx.unlock(); this.fireHarpoon(); };
    this.input.onKeyDown = (code) => this.onKey(code);
    this.input.onKeyUp = (code) => {
      if (code === "Space") this.fishing?.primaryUp(this.chase.heading);
      if (code === "Tab" && !this.board.pinned) {
        if (performance.now() - this.tabDownAt < 250) this.board.pinned = true;
        else this.board.hide();
      }
    };

    if (net instanceof SoloNet) {
      this.setupSolo(net, opts.chapter, opts.endless);
    } else {
      this.chat.add("", `Joined room ${net.code}. Share the code with friends!`, undefined, true);
      // squad picker right after joining
      setTimeout(() => this.squadPicker.show(), 400);
    }
    if (!this.solo && !localStorage.getItem("tb_seen_help")) { localStorage.setItem("tb_seen_help", "1"); setTimeout(() => this.help.toggle(), 2500); }
  }

  private get overlayOpen() { return this.help?.visible || this.squadPicker?.visible || this.pause?.visible || !!this.soloMode?.overlayOpen || !!this.cinematic || !!this.photo?.active; }

  // ======================================================================= solo
  private setupSolo(net: SoloNet, chapter?: number, endless?: EndlessOpts) {
    const ui = this.uiRoot;
    this.solo = net;
    this.dialogue = new Dialogue(ui);
    this.pause = new PauseMenu(ui);
    this.el(".chat")?.classList.add("hidden");
    this.board.setSolo(true);
    this.hud.setSolo(true);
    const ctx = {
      ui, scene: this.scene, fx: this.fx, labels: this.labels, feed: this.feed, hud: this.hud, chase: this.chase,
      local: this.local, fishing: this.fishing!, reel: this.reel, dialogue: this.dialogue, world: this.world,
      boat: () => this.boats.get(net.sessionId),
      monster: (id: string) => this.monsters.get(id),
      cinematic: (x: number, z: number, dur: number) => { this.cinematic = { x, z, t: 0, dur }; },
      slowmo: (scale: number, seconds: number) => { this.timeScale = scale; this.slowFor = seconds; },
      dev: this.dev,
    };
    this.pause.onResume = () => this.setPaused(false);
    this.pause.onSettings = (s) => this.applySettings(s);
    this.pause.onQuit = () => { net.persist(); location.href = location.pathname; };
    this.pause.onAquarium = () => { this.setPaused(false); openAquarium(ui); };
    this.pause.onPhoto = () => { this.setPaused(false); this.photo?.toggle(); };
    if (endless) {
      const mode = new EndlessMode(net, ctx, endless);
      this.endless = mode;
      this.soloMode = mode;
      this.pause.configureEndless(() => { this.setPaused(false); mode.abandon(); });
    } else {
      const mode = new SoloMode(net, ctx, chapter);
      this.campaign = mode;
      this.soloMode = mode;
      this.pause.onChart = () => { this.setPaused(false); mode.openChart(); };
      this.pause.onCodex = () => { this.setPaused(false); mode.openCodex(); };
      this.pause.onWorkshop = () => { this.setPaused(false); mode.openWorkshop(); };
      this.pause.onRestart = () => { this.setPaused(false); mode.runner.start(mode.runner.def, { retry: true }); };
    }
    this.companion = new Companion(this.scene, currentCompanion());
    this.photo = new PhotoMode(this.renderer, this.uiRoot, (on) => { this.labels.root.style.visibility = on ? "hidden" : ""; });
    window.addEventListener("pagehide", () => net.persist());
    if (this.dev) this.feed.toast("DEV: K storm · N monster · G gust · J complete · window.__dev", "", 5000);
  }

  /** dev API access */
  get soloModeRef() { return this.campaign; }
  get endlessRef() { return this.endless; }
  get reelRef() { return this.reel; }
  get localRef() { return this.local; }

  private el(sel: string) { return this.uiRoot.querySelector(sel); }

  private setPaused(p: boolean) {
    if (!this.solo) return;
    if (p) this.pause.show(); else this.pause.hide();
  }
  private get me(): PlayerS | undefined { return this.net?.state?.players?.get(this.net.sessionId); }

  private onKey(code: string) {
    sfx.unlock();
    const net = this.net;
    if (!net) return;
    if (code === "KeyP" && this.photo && !this.pause?.visible && !this.soloMode?.overlayOpen) { this.photo.toggle(); return; }
    if (this.photo?.active) { if (code === "Escape") this.photo.toggle(); return; }
    if (this.soloMode && !this.pause?.visible && !this.help.visible && this.soloMode.onKey(code)) return;
    switch (code) {
      case "Space": if (!this.overlayOpen) this.fishing?.primaryDown(this.me); break;
      case "Escape":
        if (this.help.visible) this.help.hide();
        else if (this.squadPicker.visible) this.squadPicker.hide();
        else if (this.board.visible) this.board.hide();
        else if (this.solo && this.pause.visible) this.setPaused(false);
        else if (this.solo && (this.fishing?.phase ?? "idle") === "idle" && !this.soloMode?.overlayOpen) this.setPaused(true);
        else this.fishing?.cancel();
        break;
      case "KeyF": this.fireHarpoon(); break;
      case "KeyH": this.help.toggle(); break;
      case "KeyQ": if (!this.solo) this.squadPicker.visible ? this.squadPicker.hide() : this.squadPicker.show(); break;
      case "KeyM": { sfx.toggleMute(); break; }
      case "Enter": if (!this.solo) setTimeout(() => this.chat.focus(), 0); break;
      case "Tab":
        this.tabDownAt = performance.now();
        if (this.board.visible && this.board.pinned) this.board.hide();
        else { this.board.pinned = false; this.board.show(); }
        break;
    }
    if (net instanceof SoloNet && this.dev) {
      if (code === "KeyK") net.toggleStorm();
      if (code === "KeyN") net.spawnMonster(zoneAt(this.local.x, this.local.z) === "abyss" ? "kraken" : "serpent");
      if (code === "KeyG") net.gust();
      if (code === "KeyJ") (window as any).__dev?.complete();
    }
  }

  // ======================================================================= entities
  private addBoat(p: PlayerS, id: string) {
    if (this.boats.has(id)) return;
    const isLocal = id === this.net?.sessionId;
    const b = new Boat(this.scene, this.labels, id, isLocal);
    b.setInfo(p.name, p.squad, p.level);
    b.setPose(p.x, p.z, p.rot, 0);
    this.boats.set(id, b);
    this.targets.set(id, { x: p.x, z: p.z, rot: p.rot, speed: p.speed });
    const line = new FishingLine(this.scene);
    line.onLand = () => {
      const bp = line.isVisible ? b : null;
      void bp;
      const pl = this.net?.state.players.get(id);
      if (pl) { this.fx.splashAt(pl.bobX, pl.bobZ, 0.5); if (isLocal) sfx.splash(0.6); }
    };
    this.lines.set(id, line);
    if (isLocal) { this.local.snap(p.x, p.z, p.rot); this.haveSnapped = true; }
  }
  private removeBoat(id: string) {
    this.boats.get(id)?.dispose(this.scene);
    this.boats.delete(id);
    this.lines.get(id)?.dispose();
    this.lines.delete(id);
    this.targets.delete(id);
  }
  private addMonster(m: MonsterS, id: string) {
    if (this.monsters.has(id)) return;
    const e = new MonsterEntity(this.scene, this.labels, id, m.kind);
    e.onSurface = (x, z, big) => {
      this.fx.splashAt(x, z, big ? 4 : 2.5);
      const d = this.boats.get(this.net!.sessionId)?.position.distanceTo(this.tmp.set(x, 0, z)) ?? 999;
      if (d < 160) sfx.roar(big);
    };
    e.sync(m);
    this.monsters.set(id, e);
    if (this.soloMode?.isBoss(id)) e.root.scale.setScalar(1.7);
  }
  private removeMonster(id: string) {
    const e = this.monsters.get(id);
    if (!e) return;
    this.fx.splashAt(e.x, e.z, e.isBoss ? 5 : 3);
    this.fx.sparkAt(this.tmp.set(e.x, 2, e.z), "#ffd24a", 80);
    e.dispose();
    this.monsters.delete(id);
  }

  // ======================================================================= events
  private onAnnounce(p: { kind: string; text: string; color?: string; playerId?: string; x?: number; z?: number }) {
    const icons: Record<string, string> = { legendary: "🌟", epic: "💜", monster_spawn: "☠", monster_kill: "⚔", storm_start: "⛈", storm_end: "🌤", squad_mission: "🎯", join: "⛵", leave: "👋", sunk: "💀" };
    const important = ["legendary", "monster_spawn", "monster_kill", "storm_start"].includes(p.kind);
    this.feed.announce(p.text, p.color ?? (p.kind === "legendary" ? TIER_INFO.legendary.color : "#ffffff"), icons[p.kind] ?? "📣", important);
    if (p.kind === "legendary" && p.playerId) {
      const id = p.playerId;
      this.fx.beam(() => this.boats.get(id)?.position ?? null, "#ffcf6a", 12);
      this.fx.beam(() => this.boats.get(id)?.position ?? null, "#ff4fd8", 10);
    } else if (p.kind === "epic" && p.playerId) {
      const id = p.playerId;
      this.fx.beam(() => this.boats.get(id)?.position ?? null, TIER_INFO.epic.color, 6);
    }
    if (p.kind === "monster_spawn") sfx.roar(/kraken/i.test(p.text));
    else if (p.kind === "storm_start") sfx.thunder(0.2);
    else if (p.kind !== "legendary") sfx.announce();
  }

  private onHarpoonFx(p: { from: string; sx: number; sz: number; tx: number; tz: number; hitMonster?: string; dmg?: number }) {
    const shooter = this.boats.get(p.from);
    const from = () => (shooter ? this.tmp2.copy(shooter.position).add(new THREE.Vector3(0, 2, 0)) : null);
    const near = shooter ? shooter.position.distanceTo(this.camera.position) < 120 : false;
    if (near || p.from === this.net?.sessionId) sfx.harpoon();
    this.fx.harpoon(from, p.sx, p.sz, p.tx, p.tz, !!p.hitMonster, () => {
      const m = p.hitMonster ? this.monsters.get(p.hitMonster) : undefined;
      if (m) {
        const hp = m.hitPoint(new THREE.Vector3());
        this.fx.sparkAt(hp, "#ffd36a", 40);
        this.fx.splashAt(m.x, m.z, 1.2);
        if (p.dmg) this.labels.float(`-${p.dmg}`, hp, p.from === this.net?.sessionId ? "hit mine" : "hit", 1.2);
        sfx.hit();
      } else {
        this.fx.splashAt(p.tx, p.tz, 0.8);
      }
    });
  }

  private onMonsterAttack(p: { monsterId: string; x: number; z: number; radius: number }) {
    const m = this.monsters.get(p.monsterId);
    m?.attack();
    const big = m?.isBoss ?? p.radius > 12;
    this.fx.warning(p.x, p.z, p.radius, big ? 0.9 : 0.6, () => {
      sfx.slam();
      this.fx.splashAt(p.x, p.z, big ? 5 : 3);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.fx.splashAt(p.x + Math.cos(a) * p.radius * 0.7, p.z + Math.sin(a) * p.radius * 0.7, 1.2);
      }
      const me = this.me;
      const d = Math.hypot(this.local.x - p.x, this.local.z - p.z);
      if (me && !me.sunk && d < p.radius + 2) {
        // knockback is client-side (server convention)
        this.local.knockback(p.x, p.z, big ? 18 : 13);
        this.chase.shake(0.5);
      } else if (d < 60) this.chase.shake(0.15);
    });
  }

  private fireHarpoon(target?: { x: number; z: number }) {
    const net = this.net, me = this.me;
    if (!net || !me || me.sunk || this.overlayOpen) return;
    const now = performance.now();
    if (now < this.harpoonReadyAt) return;
    const pt = target ?? this.cursorWater();
    if (!pt) return;
    let tx = pt.x, tz = pt.z;
    const dx = tx - this.local.x, dz = tz - this.local.z;
    const d = Math.hypot(dx, dz);
    if (d > HARPOON_RANGE) { tx = this.local.x + (dx / d) * HARPOON_RANGE; tz = this.local.z + (dz / d) * HARPOON_RANGE; }
    net.send("harpoon", { tx, tz });
    this.harpoonReadyAt = now + this.harpoonCooldown;
  }

  private get harpoonCooldown() { return this.solo ? this.solo.loadout.harpoonCooldownMs : HARPOON_COOLDOWN_MS; }

  /** touch harpoon: drag vector (screen px) -> water point, or auto-aim at the nearest monster / ahead */
  private touchAimPoint(aim: { dx: number; dy: number } | null): { x: number; z: number } {
    const bx = this.local.x, bz = this.local.z;
    if (!aim) {
      let best: { x: number; z: number } | null = null, bd = HARPOON_RANGE + 8;
      mapEach<MonsterS>(this.net?.state?.monsters, (m) => {
        if (m.state === "submerged") return;
        const d = Math.hypot(m.x - bx, m.z - bz);
        if (d < bd) { bd = d; best = { x: m.x, z: m.z }; }
      });
      if (best) return best;
      return { x: bx + Math.sin(this.local.rot) * 35, z: bz + Math.cos(this.local.rot) * 35 };
    }
    const hd = this.chase.heading;
    const fx = Math.sin(hd), fz = Math.cos(hd); // screen up
    const rx = -Math.cos(hd), rz = Math.sin(hd); // screen right
    let wx = fx * -aim.dy + rx * aim.dx, wz = fz * -aim.dy + rz * aim.dx;
    const len = Math.hypot(wx, wz) || 1;
    const dist = HARPOON_RANGE * Math.min(1, Math.max(0.3, Math.hypot(aim.dx, aim.dy) / 110));
    wx /= len; wz /= len;
    return { x: bx + wx * dist, z: bz + wz * dist };
  }

  private setupTouch(net: GameNet) {
    const solo = net instanceof SoloNet;
    this.touch = new TouchControls(this.uiRoot, this.input, {
      castDown: () => { sfx.unlock(); if (!this.overlayOpen) this.fishing?.primaryDown(this.me); },
      castUp: () => this.fishing?.primaryUp(this.chase.heading),
      cancel: () => this.fishing?.cancel(),
      harpoon: (aim) => { sfx.unlock(); this.fireHarpoon(this.touchAimPoint(aim)); },
      aimPreview: (aim) => { const p = aim ? this.touchAimPoint(aim) : null; this.aimTarget = p ? new THREE.Vector3(p.x, 0, p.z) : null; },
      board: () => { if (this.board.visible) this.board.hide(); else { this.board.pinned = true; this.board.show(); } },
      chat: () => this.chat.focus(),
      squad: () => (this.squadPicker.visible ? this.squadPicker.hide() : this.squadPicker.show()),
      menu: () => { if (solo) this.setPaused(!this.pause.visible); else this.help.toggle(); },
      settings: () => openSettingsModal(this.uiRoot, (st) => this.applySettings(st)),
      phase: () => this.fishing?.phase ?? "idle",
      cooldownLeft: () => this.harpoonReadyAt - performance.now(),
      cooldownTotal: () => this.harpoonCooldown,
    }, { solo });
  }

  private cursorWater(): THREE.Vector3 | null {
    this.ndc.set((this.input.mouseX / window.innerWidth) * 2 - 1, -(this.input.mouseY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.waterPlane, out);
  }

  // ======================================================================= frame
  private frame() { this.step(Math.min(0.05, this.clock.getDelta()), true); }

  /** one simulation + render step (dev API drives this with a fixed dt when the tab is throttled) */
  step(rawDt: number, render = true) {
    if (this.slowFor > 0) { this.slowFor -= rawDt; if (this.slowFor <= 0) this.timeScale = 1; }
    const dt = rawDt * this.timeScale;
    this.time += dt;
    const net = this.net;
    if (this.solo) this.solo.paused = !!(this.pause?.visible || this.soloMode?.busy || this.cinematic || this.photo?.active);
    net?.tick(dt);
    const state = net?.state;
    const meId = net?.sessionId ?? "";
    const me = this.me;
    const wind: WindS | undefined = state?.wind;
    const storm = !!state?.storm;

    // ---- local control
    if (me && net) {
      const wasSunk = this.prevSunk.get(meId) ?? false;
      if (wasSunk && !me.sunk) { this.local.snap(me.x, me.z, me.rot); this.fishing?.reset(); }
      if (!wasSunk && me.sunk) { this.sunkAt = performance.now(); sfx.sink(); this.fishing?.reset(); }
      if (!this.haveSnapped) { this.local.snap(me.x, me.z, me.rot); this.haveSnapped = true; }
      const serverDiff = Math.hypot(me.x - this.local.x, me.z - this.local.z);
      if (!me.sunk && serverDiff > 8 && this.moveAcc > -1) {
        // server clamped/moved us
        this.local.x = me.x; this.local.z = me.z;
      }
      const canDrive = !me.sunk && me.state !== "stunned" && !this.input.typing && !this.overlayOpen;
      const throttle = Math.max(-1, Math.min(1, this.input.axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]) + this.input.touchThrottle));
      const steer = Math.max(-1, Math.min(1, this.input.axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]) + this.input.touchSteer));
      const reelSlow = this.fishing?.reeling ? 0.35 : 1;
      if (!this.solo?.paused) this.local.update(dt, throttle * reelSlow, steer, wind, canDrive);
      this.enforceLockedZones(me);
      this.soloMode?.clampBoat?.(this.local);
      this.moveAcc += dt;
      if (this.moveAcc >= 1 / MOVE_SEND_HZ && !me.sunk) {
        this.moveAcc = 0;
        net.send("move", { x: round2(this.local.x), z: round2(this.local.z), rot: round3(this.local.rot), speed: round2(this.local.speed) });
      }
      this.input.allowDragOrbit = !this.fishing?.reeling;
      this.fishing?.update(dt, me, this.input.primaryHeld && !this.input.typing, wind?.gust ? wind.speed : wind ? wind.speed * 0.2 : 0);
      if (this.fishing) this.fishing.level = me.level;
    }

    // ---- boats
    mapEach<PlayerS>(state?.players, (p, id) => {
      let b = this.boats.get(id);
      if (!b) { this.addBoat(p, id); b = this.boats.get(id)!; }
      b.setInfo(p.name, p.squad as SquadId, p.level);
      const wasSunk = this.prevSunk.get(id) ?? false;
      if (wasSunk !== p.sunk) {
        b.setSunk(p.sunk);
        if (p.sunk) this.fx.splashAt(b.x, b.z, 2.5);
      }
      this.prevSunk.set(id, p.sunk);
      if (id === meId) b.setPose(this.local.x, this.local.z, this.local.rot, this.local.speed);
      else {
        const t = this.targets.get(id)!;
        if (Math.hypot(p.x - b.x, p.z - b.z) > 40) b.setPose(p.x, p.z, p.rot, p.speed); // teleport (respawn)
        t.x = p.x; t.z = p.z; t.rot = p.rot; t.speed = p.speed;
        b.setPose(damp(b.x, t.x + Math.sin(t.rot) * t.speed * 0.06, 8, dt), damp(b.z, t.z + Math.cos(t.rot) * t.speed * 0.06, 8, dt), dampAngle(b.rot, t.rot, 8, dt), t.speed);
      }
      // fishing line
      const line = this.lines.get(id);
      if (line) {
        const fishingState = p.state === "waiting" || p.state === "hooked" || p.state === "reeling";
        if (fishingState && !p.sunk && (p.bobX !== 0 || p.bobZ !== 0)) {
          b.rodTipWorld(this.tmp);
          line.show(p.bobX, p.bobZ, this.tmp);
          const localPhase = id === meId ? this.fishing?.phase : undefined;
          line.mode = p.state === "reeling" || localPhase === "reeling" || localPhase === "landing" ? "reel" : p.state === "hooked" || localPhase === "bite" ? "bite" : "wait";
        } else if (line.isVisible) line.hide();
        b.rodBend = damp(b.rodBend, line.mode === "reel" ? 1 : line.mode === "bite" ? 0.5 : 0, 6, dt);
      }
      b.update(dt, this.time, wind?.speed ?? 0.3, this.fx.wake);
      if (line && line.isVisible) line.update(dt, this.time, b.rodTipWorld(this.tmp));
    });

    // ---- monsters
    mapEach<MonsterS>(state?.monsters, (m, id) => {
      let e = this.monsters.get(id);
      if (!e) { this.addMonster(m, id); e = this.monsters.get(id)!; }
      e.sync(m);
      e.update(dt, this.time);
    });

    // ---- camera + world
    const myBoat = this.boats.get(meId);
    if (this.cinematic && myBoat) {
      const c = this.cinematic;
      c.t += dt;
      const k = Math.min(1, c.t / 0.8);
      const bx = myBoat.position.x, bz = myBoat.position.z;
      const mx = c.x, mz = c.z;
      const dx = mx - bx, dz = mz - bz, d = Math.hypot(dx, dz) || 1;
      const cx = bx - (dx / d) * 18, cz = bz - (dz / d) * 18;
      this.camera.position.lerp(this.tmp2.set(cx, 9 + k * 4, cz), 1 - Math.exp(-4 * dt));
      this.camera.lookAt(mx, 6, mz);
      if (c.t >= c.dur) this.cinematic = null;
    } else if (myBoat && me) {
      const focus = myBoat.position;
      this.chase.update(dt, focus, this.local.rot, Math.abs(this.local.speed) > 2 || this.fishing?.busy === true);
      const [dx, dy] = this.input.consumeDrag();
      if (dx || dy) this.chase.orbit(dx, dy);
      const wh = this.input.consumeWheel();
      if (wh) this.chase.zoom(wh);
    } else {
      // attract mode: slow orbit around the dock
      this.attractAngle += dt * 0.05;
      const r = 70;
      this.camera.position.set(DOCK_POS.x + Math.sin(this.attractAngle) * r, 22 + Math.sin(this.time * 0.2) * 3, DOCK_POS.z + Math.cos(this.attractAngle) * r);
      this.camera.lookAt(DOCK_POS.x + 10, 2, DOCK_POS.z);
    }
    if (this.companion && myBoat) this.companion.update(dt, this.time, myBoat.position, this.local.rot, this.local.speed);
    const focus = myBoat ? myBoat.position : this.tmp.set(DOCK_POS.x, 0, DOCK_POS.z);
    this.world.update(dt, this.time, focus, this.camera.position, wind?.speed ?? 0.3, storm);
    if (this.solo) {
      this.barriers.setLocked(!this.solo.zonesOpen.reef, !this.solo.zonesOpen.abyss);
      this.barriers.update(this.time, this.camera.position);
    }
    this.fx.update(dt, this.time, this.camera.position, wind?.dirRad ?? 0, wind?.speed ?? 0.3, this.world.sky.storm);
    sfx.setRain(this.world.sky.storm);
    if (storm !== this.lastStorm) { this.lastStorm = storm; }

    // ---- UI
    if (net && this.hud) {
      if (state?.serverTime) this.timeOffset = damp(this.timeOffset, state.serverTime - Date.now(), 0.5, dt) || state.serverTime - Date.now();
      const nowS = Date.now() + this.timeOffset;
      this.hud.update(dt, me, wind, { on: storm, secondsLeft: ((state?.stormEndsAt ?? 0) - nowS) / 1000, nextIn: ((state?.nextStormAt ?? 0) - nowS) / 1000 }, this.harpoonReadyAt - performance.now());
      if (me) {
        this.hud.zone(zoneAt(this.local.x, this.local.z));
        this.hud.setLowHp(!me.sunk && me.hp < (this.solo?.maxHp ?? BOAT_MAX_HP) * 0.25);
        if (me.sunk) this.hud.setSunkCountdown((RESPAWN_MS - (performance.now() - this.sunkAt)) / 1000);
        const st = this.fishing?.phase ?? "idle";
        if (this.soloMode) {
          this.soloMode.update(dt, me, !!this.solo?.paused);
          this.missions.update(arr(me.missions), [], "#ffd24a", { label: this.soloMode.trackerLabel, items: this.soloMode.trackerItems() });
          this.hud.setHint(this.soloMode.hint(me, st));
        } else {
          const squad: SquadS | undefined = state?.squads?.get(me.squad);
          this.missions.update(arr(me.missions), squad ? arr(squad.missions) : [], SQUADS[me.squad]?.color ?? "#fff");
        }
        this.hud.setStatus(me.state === "stunned" ? "STUNNED" : st === "waiting" ? "Waiting for a bite…  (Esc to reel in)" : st === "casting" ? "Casting…" : "");
      }
      const players: PlayerS[] = [];
      mapEach<PlayerS>(state?.players, (p) => players.push(p));
      const mons: MonsterS[] = [];
      mapEach<MonsterS>(state?.monsters, (m) => mons.push(m));
      this.minimap.update(dt, players, meId, mons, me ? { x: this.local.x, z: this.local.z, rot: this.local.rot } : null, this.soloMode?.lockedBorder()?.r, this.soloMode?.mapExtras());
      this.updateBossBar(mons);
      const squads: SquadS[] = [];
      mapEach<SquadS>(state?.squads as any, (s) => squads.push(s));
      this.board.update(dt, players, squads, meId, this.solo ? { save: this.solo.save, chapterLabel: this.soloMode?.trackerLabel ?? "" } : undefined);
      this.squadPicker.update(players, meId);
      this.reveal.update(dt);
      this.touch?.update();
      this.updateAimLine();
      const harpoonAim = !!me && !me.sunk;
      this.hud.setCrosshair(this.input.mouseX, this.input.mouseY, harpoonAim && !InputMode.touch);
    }

    if (!render) return;
    this.renderer.render(this.scene, this.camera);
    this.photo?.afterRender();
    this.labels.update(dt, this.camera, window.innerWidth, window.innerHeight);
    this.fpsTick(dt);
  }

  private updateAimLine() {
    const t = this.aimTarget;
    this.aimLine.visible = !!t;
    if (!t) return;
    const attr = this.aimLine.geometry.attributes.position as THREE.BufferAttribute;
    attr.setXYZ(0, this.local.x, 1.2, this.local.z);
    attr.setXYZ(1, t.x, 0.6, t.z);
    attr.needsUpdate = true;
    this.aimLine.computeLineDistances();
  }

  /** solo: push the boat back from locked zone borders */
  private enforceLockedZones(me: PlayerS) {
    const lock = this.soloMode?.lockedBorder();
    if (!lock || me.sunk) return;
    const r = Math.hypot(this.local.x - DOCK_POS.x, this.local.z - DOCK_POS.z);
    const max = lock.r - 4;
    if (r > max) {
      const k = (max - 1.5) / r;
      this.local.x = DOCK_POS.x + (this.local.x - DOCK_POS.x) * k;
      this.local.z = DOCK_POS.z + (this.local.z - DOCK_POS.z) * k;
      this.local.speed = -Math.abs(this.local.speed) * 0.4;
      if (performance.now() - this.lockToastAt > 3000) {
        this.lockToastAt = performance.now();
        this.feed.toast(`<b>🔒 Locked:</b> ${lock.label} opens in a later chapter`, "bad", 2600);
        this.chase.shake(0.25);
        sfx.hit();
      }
    }
  }

  private updateBossBar(mons: MonsterS[]) {
    if (this.soloMode) { this.hud.setBoss(this.soloMode.bossBar()); return; }
    const boss = mons.find((m) => MONSTERS[m.kind]?.boss && m.state !== "submerged");
    this.hud.setBoss(boss ? { name: MONSTERS[boss.kind].name, hp: boss.hp, maxHp: boss.maxHp || MONSTERS[boss.kind].hp } : null);
  }

  private fpsTick(dt: number) {
    this.fps.acc += dt; this.fps.frames++;
    if (this.fps.acc >= 0.5) {
      if (this.fps.el) this.fps.el.textContent = `${Math.round(this.fps.frames / this.fps.acc)} fps · ${this.renderer.info.render.calls} calls`;
      this.fps.acc = 0; this.fps.frames = 0;
    }
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
