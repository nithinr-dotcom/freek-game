import { Room, matchMaker, type Client } from "colyseus";
import {
  MAX_PLAYERS, MAX_PER_SQUAD, SQUAD_IDS, SQUADS, ROOM_NAME, TIER_INFO, levelFromXp,
  type JoinOptions, type RoomMeta, type S2C, type SquadId, type FishCardS, type ZoneId, type Tier, type Species,
} from "@freek/shared";
import { OceanState, Player, Squad, FishCard } from "../schema/State.js";
import type { PlayerRuntime } from "./types.js";
import { WindSystem } from "../systems/wind.js";
import { FishingSystem } from "../systems/fishing.js";
import { BoatSystem, spawnPoint } from "../systems/boats.js";
import { MonsterSystem } from "../systems/monsters.js";
import { MissionSystem } from "../systems/missions.js";
import {
  getProfile, putProfile, saveProfiles, getHallOfFame, offerHallOfFame, onHallOfFameChange, compareCards,
} from "../progression/persistence.js";
import { TICK_MS, SAVE_EVERY_MS } from "../config.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O / I / 0 / 1
const TROPHY_COUNT = 5;
const reservedCodes = new Set<string>();

function randomCode() {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}
async function uniqueCode(preferred?: string): Promise<string> {
  const ok = async (c: string) => !reservedCodes.has(c) && (await matchMaker.query({ roomId: c })).length === 0;
  const pref = preferred?.toUpperCase();
  if (pref && /^[A-HJ-NP-Z2-9]{5}$/.test(pref) && (await ok(pref))) return pref;
  for (;;) { const c = randomCode(); if (await ok(c)) return c; }
}
function cleanName(n: unknown) {
  const s = typeof n === "string" ? n.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 16) : "";
  return s || `Sailor${Math.floor(Math.random() * 900 + 100)}`;
}
const isSquad = (s: unknown): s is SquadId => typeof s === "string" && (SQUAD_IDS as string[]).includes(s);

export class OceanRoom extends Room<{ state: OceanState; metadata: RoomMeta }> {
  maxClients = MAX_PLAYERS;
  state = new OceanState();
  runtime = new Map<string, PlayerRuntime>();

  wind!: WindSystem;
  fishing!: FishingSystem;
  boats!: BoatSystem;
  monsters!: MonsterSystem;
  missions!: MissionSystem;
  private offHof?: () => void;
  private code = "";

  async onCreate(options: JoinOptions) {
    this.code = await uniqueCode(options?.code);
    reservedCodes.add(this.code);
    this.roomId = this.code;
    this.state.code = this.code;
    const isPrivate = !!options?.isPrivate;
    await this.setMatchmaking({ metadata: { code: this.code, isPrivate, hostName: cleanName(options?.name) }, private: isPrivate });

    this.wind = new WindSystem(this);
    this.fishing = new FishingSystem(this);
    this.boats = new BoatSystem(this);
    this.monsters = new MonsterSystem(this);
    this.missions = new MissionSystem(this);

    for (const id of SQUAD_IDS) {
      const s = new Squad({ id, points: 0, kills: 0 });
      this.missions.fillSquad(s);
      this.state.squads.set(id, s);
    }

    this.registerMessages();
    this.offHof = onHallOfFameChange((entries) => this.broadcast("hallOfFame", { entries }));
    this.clock.setInterval(() => this.saveAll(), SAVE_EVERY_MS);
    this.setTimestep((dt) => this.tick(dt), TICK_MS);
    console.log(`[room] created ${this.code} (${isPrivate ? "private" : "public"}) by ${cleanName(options?.name)}`);
  }

  private registerMessages() {
    const withPlayer = <M>(fn: (p: Player, rt: PlayerRuntime, msg: M) => void) => (client: Client, msg: M) => {
      const p = this.state.players.get(client.sessionId);
      const rt = this.runtime.get(client.sessionId);
      if (p && rt) fn(p, rt, msg ?? ({} as M));
    };
    this.onMessage("move", withPlayer((p, rt, m: any) => this.boats.move(p, rt, m)));
    this.onMessage("cast", withPlayer((p, rt, m: any) => this.fishing.cast(p, rt, m)));
    this.onMessage("hook", withPlayer((p, rt) => this.fishing.hook(p, rt)));
    this.onMessage("reel", withPlayer((_p, rt, m: any) => this.fishing.reel(rt, m)));
    this.onMessage("reelResult", withPlayer((p, rt, m: any) => this.fishing.reelResult(p, rt, m)));
    this.onMessage("cancelFishing", withPlayer((p, rt) => this.fishing.cancel(p, rt)));
    this.onMessage("harpoon", withPlayer((p, rt, m: any) => this.monsters.harpoon(p, rt, m)));
    this.onMessage("setSquad", withPlayer((p, _rt, m: any) => this.setSquad(p, m?.squad)));
    this.onMessage("chat", withPlayer((p, _rt, m: any) => {
      const text = typeof m?.text === "string" ? m.text.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 140) : "";
      if (text) this.broadcast("chat", { from: p.name, text, squad: p.squad as SquadId });
    }));
    this.onMessage("*", () => { /* ignore unknown */ });
  }

  // ---------- lifecycle ----------
  onJoin(client: Client, options: JoinOptions) {
    const name = cleanName(options?.name);
    const used = new Set([...this.runtime.values()].map((r) => r.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const sp = spawnPoint(slot);
    const p = new Player({ id: client.sessionId, name, squad: this.pickSquad(options?.squad), x: sp.x, z: sp.z, rot: sp.rot });

    const prof = getProfile(name);
    if (prof) {
      p.xp = prof.xp; p.coins = prof.coins; p.level = levelFromXp(prof.xp).level;
      for (const c of [...prof.trophies].sort(compareCards).slice(0, TROPHY_COUNT)) p.trophies.push(new FishCard(c));
    }
    this.missions.fillPlayer(p);
    this.state.players.set(client.sessionId, p);
    this.runtime.set(client.sessionId, { client, slot, lastMoveAt: Date.now(), lastHarpoonAt: 0, stunnedUntil: 0, respawnAt: 0 });

    client.send("hallOfFame", { entries: getHallOfFame() });
    const sq = SQUADS[p.squad as SquadId];
    this.announce({ kind: "join", text: `${name} joined squad ${sq.name}`, color: sq.color, playerId: p.id });
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      this.saveProfile(p);
      saveProfiles();
      this.announce({ kind: "leave", text: `${p.name} left`, playerId: p.id });
    }
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    this.monsters.removePlayer(client.sessionId);
  }

  onDispose() {
    this.saveAll();
    this.offHof?.();
    reservedCodes.delete(this.code);
    console.log(`[room] disposed ${this.code}`);
  }

  // ---------- tick ----------
  private tick(dtMs: number) {
    const now = Date.now();
    this.state.serverTime = now;
    this.wind.update(dtMs, now);
    this.boats.update(dtMs, now);
    this.fishing.update(now);
    this.monsters.update(dtMs, now);
  }

  // ---------- helpers used by systems ----------
  sendTo<K extends keyof S2C>(sessionId: string, type: K, msg: S2C[K]) {
    this.runtime.get(sessionId)?.client.send(type as string, msg);
  }
  announce(msg: S2C["announce"]) { this.broadcast("announce", msg); }
  membersOf(squad: SquadId) { return [...this.state.players.values()].filter((p) => p.squad === squad); }

  private pickSquad(wanted?: unknown): SquadId {
    if (isSquad(wanted) && this.membersOf(wanted).length < MAX_PER_SQUAD) return wanted;
    let best: SquadId = SQUAD_IDS[0], n = Infinity;
    for (const id of SQUAD_IDS) { const c = this.membersOf(id).length; if (c < n) { n = c; best = id; } }
    return best;
  }

  setSquad(p: Player, squad: unknown) {
    if (!isSquad(squad) || p.squad === squad) return;
    if (this.membersOf(squad).length >= MAX_PER_SQUAD) {
      this.sendTo(p.id, "error", { message: `Squad ${SQUADS[squad].name} is full` });
      return;
    }
    p.squad = squad;
  }

  addXp(p: Player, xp: number) {
    if (xp <= 0) return;
    const before = p.level;
    p.xp += Math.round(xp);
    p.level = levelFromXp(p.xp).level;
    if (p.level > before) this.sendTo(p.id, "levelUp", { level: p.level });
  }

  /** Put a caught/looted card into the player's carried catch, trophies and the hall of fame. Returns newBest. */
  addCard(p: Player, card: FishCardS): boolean {
    p.unbanked.push(new FishCard(card));
    p.unbankedPoints += card.points;
    const prevBest = p.trophies.length ? p.trophies[0] : undefined;
    const newBest = !prevBest || compareCards(card, prevBest) < 0;
    const all = [...p.trophies.map((c) => c.toJSON() as FishCardS), card].sort(compareCards).slice(0, TROPHY_COUNT);
    p.trophies.clear();
    for (const c of all) p.trophies.push(new FishCard(c));
    offerHallOfFame(card);
    return newBest;
  }

  landFish(p: Player, fish: { species: Species; weightKg: number; points: number; tier: Tier }, zone: ZoneId, perfect: boolean, storm: boolean) {
    const card: FishCardS = { speciesId: fish.species.id, tier: fish.tier, weightKg: fish.weightKg, points: fish.points, at: Date.now(), catcher: p.name };
    const newBest = this.addCard(p, card);
    p.catches += 1;
    const xp = card.points * 2;
    this.sendTo(p.id, "catch", { card, zone, perfect, xp, newBest });
    this.addXp(p, xp);
    this.missions.event(p, { type: "catch", tier: fish.tier, weightKg: fish.weightKg, zone, perfect, storm });
    if (fish.tier === "legendary" || fish.tier === "epic") {
      this.announce({
        kind: fish.tier, color: TIER_INFO[fish.tier].color, playerId: p.id, x: p.x, z: p.z,
        text: `${fish.tier === "legendary" ? "LEGENDARY" : "EPIC"}! ${p.name} landed a ${fish.species.name} (${fish.weightKg} kg)`,
      });
    }
  }

  private saveProfile(p: Player) {
    putProfile({ name: p.name, xp: p.xp, coins: p.coins, level: p.level, trophies: p.trophies.map((c) => c.toJSON() as FishCardS) });
  }
  private saveAll() {
    for (const p of this.state.players.values()) this.saveProfile(p);
    saveProfiles();
  }
}

export { ROOM_NAME };
