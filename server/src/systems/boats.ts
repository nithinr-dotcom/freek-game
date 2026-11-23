import {
  BOAT_MAX_SPEED, BOAT_MAX_HP, WORLD_RADIUS, DOCK_POS, DOCK_RADIUS, RESPAWN_MS, MAX_PLAYERS, SQUADS,
  type C2S, type SquadId,
} from "@freek/shared";
import type { Player } from "../schema/State.js";
import type { OceanRoom } from "../rooms/OceanRoom.js";
import type { PlayerRuntime } from "../rooms/types.js";
import { DOCK_REGEN_PER_S, clamp, num } from "../config.js";

const SPAWN_RING_R = DOCK_RADIUS * 0.65;

export function spawnPoint(slot: number) {
  const a = (slot / MAX_PLAYERS) * Math.PI * 2;
  // position (sin a, cos a) * r; facing outward means heading = a
  return { x: DOCK_POS.x + Math.sin(a) * SPAWN_RING_R, z: DOCK_POS.z + Math.cos(a) * SPAWN_RING_R, rot: a };
}

export class BoatSystem {
  constructor(private room: OceanRoom) {}

  move(p: Player, rt: PlayerRuntime, msg: C2S["move"]) {
    if (p.sunk) return;
    const now = Date.now();
    const dt = clamp((now - rt.lastMoveAt) / 1000, 1 / 30, 1);
    rt.lastMoveAt = now;
    let x = num(msg?.x, p.x), z = num(msg?.z, p.z);
    // clamp speed
    const maxStep = BOAT_MAX_SPEED * 1.3 * dt + 0.25;
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d > maxStep) { x = p.x + (dx / d) * maxStep; z = p.z + (dz / d) * maxStep; }
    // clamp world bounds
    const r = Math.hypot(x - DOCK_POS.x, z - DOCK_POS.z);
    if (r > WORLD_RADIUS) {
      x = DOCK_POS.x + ((x - DOCK_POS.x) / r) * WORLD_RADIUS;
      z = DOCK_POS.z + ((z - DOCK_POS.z) / r) * WORLD_RADIUS;
    }
    p.x = Math.round(x * 100) / 100;
    p.z = Math.round(z * 100) / 100;
    p.rot = Math.round(num(msg?.rot, p.rot) * 1000) / 1000;
    p.speed = Math.round(clamp(num(msg?.speed, 0), -BOAT_MAX_SPEED * 1.3, BOAT_MAX_SPEED * 1.3) * 100) / 100;
  }

  damage(p: Player, amount: number, byMonster: string) {
    if (p.sunk || amount <= 0) return;
    p.hp = Math.max(0, p.hp - amount);
    this.room.sendTo(p.id, "damaged", { amount, hp: p.hp, byMonster });
    if (p.hp <= 0) this.sink(p);
  }

  sink(p: Player) {
    const rt = this.room.runtime.get(p.id);
    if (!rt || p.sunk) return;
    this.room.fishing.interrupt(p, rt);
    const lost = p.unbanked.length;
    p.sunk = true;
    p.state = "sailing";
    p.speed = 0;
    p.unbanked.clear();
    p.unbankedPoints = 0;
    rt.respawnAt = Date.now() + RESPAWN_MS;
    rt.stunnedUntil = 0;
    this.room.announce({
      kind: "sunk", text: `${p.name}'s boat sank!${lost ? ` ${lost} fish lost to the deep.` : ""}`,
      color: SQUADS[p.squad as SquadId]?.color, playerId: p.id, x: p.x, z: p.z,
    });
  }

  respawn(p: Player, rt: PlayerRuntime) {
    const sp = spawnPoint(rt.slot);
    p.x = sp.x; p.z = sp.z; p.rot = sp.rot; p.speed = 0;
    p.hp = BOAT_MAX_HP;
    p.sunk = false;
    p.state = "sailing";
    rt.lastMoveAt = Date.now();
  }

  bank(p: Player) {
    const points = p.unbankedPoints;
    const fish = p.unbanked.length;
    p.bankedPoints += points;
    const squad = this.room.state.squads.get(p.squad);
    if (squad) squad.points += points;
    p.unbanked.clear();
    p.unbankedPoints = 0;
    this.room.sendTo(p.id, "banked", { points, fish });
    this.room.missions.event(p, { type: "bank", points });
  }

  update(dtMs: number, now: number) {
    for (const [id, rt] of this.room.runtime) {
      const p = this.room.state.players.get(id);
      if (!p) continue;
      if (p.sunk) {
        if (now >= rt.respawnAt) this.respawn(p, rt);
        continue;
      }
      if (p.state === "stunned" && now >= rt.stunnedUntil) p.state = "sailing";
      const docked = Math.hypot(p.x - DOCK_POS.x, p.z - DOCK_POS.z) <= DOCK_RADIUS;
      if (docked) {
        if (p.unbanked.length > 0) this.bank(p);
        if (p.hp < BOAT_MAX_HP) p.hp = Math.min(BOAT_MAX_HP, Math.round((p.hp + DOCK_REGEN_PER_S * dtMs / 1000) * 10) / 10);
      }
    }
  }
}
