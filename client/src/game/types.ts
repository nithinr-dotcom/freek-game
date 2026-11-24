import type { C2S, S2C, StateShape, PlayerS, MonsterS } from "@freek/shared";

export interface StateEvents {
  onPlayerAdd(cb: (p: PlayerS, id: string) => void): void;
  onPlayerRemove(cb: (p: PlayerS, id: string) => void): void;
  onMonsterAdd(cb: (m: MonsterS, id: string) => void): void;
  onMonsterRemove(cb: (m: MonsterS, id: string) => void): void;
}

/** What the game needs from the network layer. Implemented by OnlineNet (net.ts) and SoloNet (solo/SoloNet.ts). */
export interface GameNet extends StateEvents {
  readonly offline: boolean;
  readonly sessionId: string;
  readonly code: string;
  readonly isPrivate: boolean;
  /** Live synced state (Colyseus schema instance or the fake). May be partially empty right after join. */
  readonly state: StateShape;
  send<K extends keyof C2S>(type: K, payload: C2S[K]): void;
  on<K extends keyof S2C>(type: K, cb: (p: S2C[K]) => void): void;
  onDisconnect(cb: (code: number) => void): void;
  /** called each frame (offline uses it to simulate the server) */
  tick(dt: number): void;
  leave(): void;
}
