/**
 * Colyseus schema mirroring `StateShape` in @freek/shared/protocol.ts.
 * Field names must stay identical to the shared interfaces.
 */
import { schema, t, type SchemaType } from "@colyseus/schema";
import { BOAT_MAX_HP } from "@freek/shared";

export const FishCard = schema({
  speciesId: t.string().default(""),
  tier: t.string().default("common"),
  weightKg: t.number().default(0),
  points: t.number().default(0),
  at: t.number().default(0),
  catcher: t.string().default(""),
}, "FishCard");
export type FishCard = SchemaType<typeof FishCard>;

export const Mission = schema({
  id: t.string().default(""),
  title: t.string().default(""),
  progress: t.number().default(0),
  target: t.number().default(1),
  squad: t.boolean().default(false),
}, "Mission");
export type Mission = SchemaType<typeof Mission>;

export const Player = schema({
  id: t.string().default(""),
  name: t.string().default(""),
  squad: t.string().default("coral"),
  x: t.number().default(0),
  z: t.number().default(0),
  rot: t.number().default(0),
  speed: t.number().default(0),
  hp: t.number().default(BOAT_MAX_HP),
  sunk: t.boolean().default(false),
  state: t.string().default("sailing"),
  bobX: t.number().default(0),
  bobZ: t.number().default(0),
  level: t.number().default(1),
  xp: t.number().default(0),
  coins: t.number().default(0),
  unbankedPoints: t.number().default(0),
  bankedPoints: t.number().default(0),
  unbanked: t.array(FishCard),
  trophies: t.array(FishCard),
  missions: t.array(Mission),
  catches: t.number().default(0),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const Squad = schema({
  id: t.string().default("coral"),
  points: t.number().default(0),
  missions: t.array(Mission),
  kills: t.number().default(0),
}, "Squad");
export type Squad = SchemaType<typeof Squad>;

export const Monster = schema({
  id: t.string().default(""),
  kind: t.string().default("serpent"),
  x: t.number().default(0),
  z: t.number().default(0),
  rot: t.number().default(0),
  hp: t.number().default(0),
  maxHp: t.number().default(0),
  state: t.string().default("roaming"),
  targetId: t.string().default(""),
}, "Monster");
export type Monster = SchemaType<typeof Monster>;

export const Wind = schema({
  dirRad: t.number().default(0),
  speed: t.number().default(0.3),
  gust: t.boolean().default(false),
}, "Wind");
export type Wind = SchemaType<typeof Wind>;

export const OceanState = schema({
  code: t.string().default(""),
  players: t.map(Player),
  squads: t.map(Squad),
  monsters: t.map(Monster),
  wind: t.ref(Wind).default(() => new Wind()),
  storm: t.boolean().default(false),
  stormEndsAt: t.number().default(0),
  nextStormAt: t.number().default(0),
  serverTime: t.number().default(0),
}, "OceanState");
export type OceanState = SchemaType<typeof OceanState>;
