/** Orchestrates renderer, world, entities, local control, network events and UI. */
import * as THREE from "three";
import {
  MOVE_SEND_HZ, HARPOON_COOLDOWN_MS, HARPOON_RANGE, SQUADS, TIER_INFO, BOAT_MAX_HP, RESPAWN_MS, DOCK_POS,
  zoneAt, tierRank, type PlayerS, type MonsterS, type SquadS, type WindS, type SquadId,
} from "@freek/shared";
import type { GameNet } from "./types";
import { Input } from "./input";
import { ChaseCamera } from "./camera";
import { LocalBoat } from "./localBoat";
import { Fishing } from "./fishing";
import { OfflineNet } from "./offline";
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
  private clock = new THREE.Clock();
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

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, labelsRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 2500);
    this.camera.position.set(40, 30, 60);
    this.world = new World(this.scene);
    this.fx = new Effects(this.scene);
    this.world.sky.onThunder = (d) => sfx.thunder(d);
    this.labels = new Labels(labelsRoot);
    this.input = new Input(canvas);
    this.chase = new ChaseCamera(this.camera);
    window.addEventListener("resize", () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private resize() {
    const w = window.innerWidth, hh = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, hh, false);
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
  }

  // ======================================================================= attach
  attach(net: GameNet) {
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
    this.help = new Help(ui, net.offline);
    this.fps.el = h("div.fps");
    if (new URLSearchParams(location.search).has("fps")) ui.append(this.fps.el);
    this.hud.setRoom(net.code, net.isPrivate);
    this.hud.onSquadClick = () => this.squadPicker.show();
    this.hud.onHelp = () => this.help.toggle();
    this.hud.onBoard = () => { if (this.board.visible) this.board.hide(); else { this.board.pinned = true; this.board.show(); } };
    this.hud.onMute = () => sfx.toggleMute();
    this.squadPicker.onPick = (s) => { net.send("setSquad", { squad: s }); sfx.click(); };
    this.chat.onSend = (t) => net.send("chat", { text: t });
    this.reel.onClick = () => sfx.reelClick();
    this.fishing = new Fishing(net, this.hud, this.reel);
    this.fishing.onBite = () => {
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

    if (net.offline) {
      this.chat.add("", "Offline sandbox — K: storm, N: spawn monster, G: gust, H: help", undefined, true);
    } else {
      this.chat.add("", `Joined room ${net.code}. Share the code with friends!`, undefined, true);
      // squad picker right after joining
      setTimeout(() => this.squadPicker.show(), 400);
    }
    if (!localStorage.getItem("tb_seen_help")) { localStorage.setItem("tb_seen_help", "1"); setTimeout(() => this.help.toggle(), net.offline ? 300 : 2500); }
  }

  private get overlayOpen() { return this.help?.visible || this.squadPicker?.visible; }
  private get me(): PlayerS | undefined { return this.net?.state?.players?.get(this.net.sessionId); }

  private onKey(code: string) {
    sfx.unlock();
    const net = this.net;
    if (!net) return;
    switch (code) {
      case "Space": if (!this.overlayOpen) this.fishing?.primaryDown(this.me); break;
      case "Escape":
        if (this.help.visible) this.help.hide();
        else if (this.squadPicker.visible) this.squadPicker.hide();
        else if (this.board.visible) this.board.hide();
        else this.fishing?.cancel();
        break;
      case "KeyF": this.fireHarpoon(); break;
      case "KeyH": this.help.toggle(); break;
      case "KeyQ": this.squadPicker.visible ? this.squadPicker.hide() : this.squadPicker.show(); break;
      case "KeyM": { sfx.toggleMute(); break; }
      case "Enter": setTimeout(() => this.chat.focus(), 0); break;
      case "Tab":
        this.tabDownAt = performance.now();
        if (this.board.visible && this.board.pinned) this.board.hide();
        else { this.board.pinned = false; this.board.show(); }
        break;
    }
    if (net instanceof OfflineNet) {
      if (code === "KeyK") net.toggleStorm();
      if (code === "KeyN") net.spawnMonster();
      if (code === "KeyG") net.gust();
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

  private fireHarpoon() {
    const net = this.net, me = this.me;
    if (!net || !me || me.sunk || this.overlayOpen) return;
    const now = performance.now();
    if (now < this.harpoonReadyAt) return;
    const pt = this.cursorWater();
    if (!pt) return;
    let tx = pt.x, tz = pt.z;
    const dx = tx - this.local.x, dz = tz - this.local.z;
    const d = Math.hypot(dx, dz);
    if (d > HARPOON_RANGE) { tx = this.local.x + (dx / d) * HARPOON_RANGE; tz = this.local.z + (dz / d) * HARPOON_RANGE; }
    net.send("harpoon", { tx, tz });
    this.harpoonReadyAt = now + HARPOON_COOLDOWN_MS;
  }

  private cursorWater(): THREE.Vector3 | null {
    this.ndc.set((this.input.mouseX / window.innerWidth) * 2 - 1, -(this.input.mouseY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.waterPlane, out);
  }

  // ======================================================================= frame
  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    const net = this.net;
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
      const throttle = this.input.axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]);
      const steer = this.input.axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]);
      const reelSlow = this.fishing?.reeling ? 0.35 : 1;
      this.local.update(dt, throttle * reelSlow, steer, wind, canDrive);
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
    if (myBoat && me) {
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
    const focus = myBoat ? myBoat.position : this.tmp.set(DOCK_POS.x, 0, DOCK_POS.z);
    this.world.update(dt, this.time, focus, this.camera.position, wind?.speed ?? 0.3, storm);
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
        this.hud.setLowHp(!me.sunk && me.hp < BOAT_MAX_HP * 0.25);
        if (me.sunk) this.hud.setSunkCountdown((RESPAWN_MS - (performance.now() - this.sunkAt)) / 1000);
        const squad: SquadS | undefined = state?.squads?.get(me.squad);
        this.missions.update(arr(me.missions), squad ? arr(squad.missions) : [], SQUADS[me.squad]?.color ?? "#fff");
        const st = this.fishing?.phase ?? "idle";
        this.hud.setStatus(me.state === "stunned" ? "STUNNED" : st === "waiting" ? "Waiting for a bite…  (Esc to reel in)" : st === "casting" ? "Casting…" : "");
      }
      const players: PlayerS[] = [];
      mapEach<PlayerS>(state?.players, (p) => players.push(p));
      const mons: MonsterS[] = [];
      mapEach<MonsterS>(state?.monsters, (m) => mons.push(m));
      this.minimap.update(dt, players, meId, mons, me ? { x: this.local.x, z: this.local.z, rot: this.local.rot } : null);
      const squads: SquadS[] = [];
      mapEach<SquadS>(state?.squads as any, (s) => squads.push(s));
      this.board.update(dt, players, squads, meId);
      this.squadPicker.update(players, meId);
      this.reveal.update(dt);
      const harpoonAim = !!me && !me.sunk;
      this.hud.setCrosshair(this.input.mouseX, this.input.mouseY, harpoonAim);
    }

    this.renderer.render(this.scene, this.camera);
    this.labels.update(dt, this.camera, window.innerWidth, window.innerHeight);
    this.fpsTick(dt);
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
