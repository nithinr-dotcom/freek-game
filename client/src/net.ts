/**
 * All Colyseus networking lives here.
 *  - createRoom / joinByCode: matchmaking (roomId === 5-char room code)
 *  - listRooms / fetchHallOfFame: HTTP endpoints on the game server
 *  - OnlineNet: wraps a joined Room, implements GameNet for the game.
 */
import { Client, Callbacks, type Room } from "@colyseus/sdk";
import { ROOM_NAME, SERVER_PORT, type C2S, type S2C, type StateShape, type PlayerS, type MonsterS, type FishCardS, type JoinOptions } from "@freek/shared";
import type { GameNet } from "./game/types";

export interface RoomListing { roomId: string; code: string; hostName: string; clients: number; maxClients: number }

function serverHostPort(): string {
  const q = new URLSearchParams(location.search).get("server");
  if (q) return q;
  return `${location.hostname || "localhost"}:${SERVER_PORT}`;
}
const secure = location.protocol === "https:";
export const HTTP_URL = `${secure ? "https" : "http"}://${serverHostPort()}`;

let client: Client | null = null;
function getClient(): Client {
  // the SDK derives ws(s):// from the http(s):// endpoint
  if (!client) client = new Client(HTTP_URL);
  return client;
}

export async function listRooms(): Promise<RoomListing[]> {
  const res = await fetch(`${HTTP_URL}/rooms`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.rooms) ? data.rooms : [];
  return list.map((r) => ({
    roomId: String(r.roomId ?? r.code ?? ""),
    code: String(r.code ?? r.roomId ?? ""),
    hostName: String(r.hostName ?? r.metadata?.hostName ?? "?"),
    clients: Number(r.clients ?? 0),
    maxClients: Number(r.maxClients ?? 12),
  }));
}

export async function fetchHallOfFame(): Promise<FishCardS[]> {
  const res = await fetch(`${HTTP_URL}/halloffame`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : [];
}

export async function createRoom(name: string, isPrivate: boolean, squad?: JoinOptions["squad"]): Promise<OnlineNet> {
  const opts: JoinOptions = { name, isPrivate, squad };
  const room = await getClient().create(ROOM_NAME, opts);
  return new OnlineNet(room, isPrivate);
}

export async function joinByCode(code: string, name: string): Promise<OnlineNet> {
  const opts: JoinOptions = { name, code };
  const room = await getClient().joinById(code.trim().toUpperCase(), opts);
  return new OnlineNet(room, false);
}

const S2C_TYPES: (keyof S2C)[] = [
  "bite", "hookResult", "catch", "lineSnap", "announce", "missionComplete", "levelUp", "banked", "damaged",
  "harpoonFx", "monsterAttack", "monsterLoot", "hallOfFame", "chat", "error",
];

export class OnlineNet implements GameNet {
  readonly offline = false;
  private handlers = new Map<string, ((p: any) => void)[]>();
  /** messages that arrived before anyone subscribed (e.g. hallOfFame right after join) */
  private pending = new Map<string, any[]>();
  private cb: ReturnType<typeof Callbacks.get<any>>;

  constructor(public readonly room: Room<any, any>, public readonly isPrivate: boolean) {
    for (const t of S2C_TYPES) {
      room.onMessage(t as string, (payload: any) => this.dispatch(t, payload ?? {}));
    }
    // Ignore unknown messages quietly instead of SDK warnings.
    room.onMessage("*", () => {});
    this.cb = Callbacks.get(room as any);
  }

  get sessionId() { return this.room.sessionId; }
  get code() { return (this.room.state as any)?.code || this.room.roomId; }
  get state(): StateShape { return this.room.state as StateShape; }

  private dispatch(type: string, payload: any) {
    const list = this.handlers.get(type);
    if (list && list.length) for (const fn of list) fn(payload);
    else {
      const q = this.pending.get(type) ?? [];
      q.push(payload);
      if (q.length > 20) q.shift();
      this.pending.set(type, q);
    }
  }

  on<K extends keyof S2C>(type: K, fn: (p: S2C[K]) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(fn as (p: any) => void);
    this.handlers.set(type, list);
    const q = this.pending.get(type);
    if (q) { this.pending.delete(type); for (const p of q) fn(p); }
  }

  send<K extends keyof C2S>(type: K, payload: C2S[K]) {
    try { this.room.send(type as string, payload); } catch { /* socket closing */ }
  }

  // ---- schema state callbacks (Colyseus 0.18 `Callbacks.get(room)` API) ----
  onPlayerAdd(fn: (p: PlayerS, id: string) => void) { this.cb.onAdd("players", (p: any, id: any) => fn(p, String(id)), true); }
  onPlayerRemove(fn: (p: PlayerS, id: string) => void) { this.cb.onRemove("players", (p: any, id: any) => fn(p, String(id))); }
  onMonsterAdd(fn: (m: MonsterS, id: string) => void) { this.cb.onAdd("monsters", (m: any, id: any) => fn(m, String(id)), true); }
  onMonsterRemove(fn: (m: MonsterS, id: string) => void) { this.cb.onRemove("monsters", (m: any, id: any) => fn(m, String(id))); }

  onDisconnect(fn: (code: number) => void) { this.room.onLeave((code: number) => fn(code)); }
  tick() {}
  leave() { this.room.leave().catch(() => {}); }
}
