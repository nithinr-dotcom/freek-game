/** What Game needs from a single-player mode: the campaign (SoloMode) or Endless Tide (EndlessMode). */
import type { MissionS, PlayerS } from "@freek/shared";
import type { MapExtra } from "../solo/actors";

export type TrackerItem = MissionS & { optional?: boolean; state?: string; numText?: string };
export interface BossBarInfo { name: string; hp: number; maxHp: number; pips?: number[]; phase?: number }

export interface SoloModeLike {
  readonly busy: boolean;
  readonly overlayOpen: boolean;
  readonly trackerLabel: string;
  update(dt: number, me: PlayerS | undefined, paused: boolean): void;
  onKey(code: string): boolean;
  hint(me: PlayerS | undefined, phase: string): string;
  mapExtras(): MapExtra[];
  bossBar(): BossBarInfo | null;
  isBoss(id: string): boolean;
  trackerItems(): TrackerItem[];
  lockedBorder(): { r: number; label: string } | null;
  /** keep the boat inside the play area (Endless arena); default none */
  clampBoat?(p: { x: number; z: number; speed: number }): void;
}
