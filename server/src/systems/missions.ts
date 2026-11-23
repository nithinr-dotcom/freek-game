import {
  MISSION_POOL, ACTIVE_MISSIONS_PER_PLAYER, ACTIVE_MISSIONS_PER_SQUAD, missionTarget, tierRank,
  SQUADS, type MissionTemplate, type Tier, type ZoneId, type SquadId,
} from "@freek/shared";
import { Mission, type Player, type Squad } from "../schema/State.js";
import type { OceanRoom } from "../rooms/OceanRoom.js";

export type MissionEvent =
  | { type: "catch"; tier: Tier; weightKg: number; zone: ZoneId; perfect: boolean; storm: boolean }
  | { type: "bank"; points: number }
  | { type: "harpoon_hit" }
  | { type: "monster_kill" };

const BY_ID: Record<string, MissionTemplate> = Object.fromEntries(MISSION_POOL.map((m) => [m.id, m]));
const PLAYER_POOL = MISSION_POOL.filter((m) => !m.squad);
const SQUAD_POOL = MISSION_POOL.filter((m) => m.squad);

function pick(pool: MissionTemplate[], exclude: Set<string>): MissionTemplate {
  const opts = pool.filter((m) => !exclude.has(m.id));
  const from = opts.length ? opts : pool;
  return from[Math.floor(Math.random() * from.length)];
}
function make(t: MissionTemplate) {
  return new Mission({ id: t.id, title: t.title, progress: 0, target: missionTarget(t.kind), squad: !!t.squad });
}

/** Returns new progress value for a mission given an event (or null if unaffected). */
function advance(t: MissionTemplate, progress: number, e: MissionEvent): number | null {
  const k = t.kind;
  switch (k.type) {
    case "catch_count": return e.type === "catch" ? progress + 1 : null;
    case "catch_tier": return e.type === "catch" && tierRank(e.tier) >= tierRank(k.tier) ? progress + 1 : null;
    case "catch_zone": return e.type === "catch" && e.zone === k.zone ? progress + 1 : null;
    case "catch_weight": return e.type === "catch" && e.weightKg >= k.kg ? 1 : null;
    case "bank_points": return e.type === "bank" ? Math.max(progress, e.points) : null;
    case "harpoon_hits": return e.type === "harpoon_hit" ? progress + 1 : null;
    case "monster_kill": return e.type === "monster_kill" ? progress + 1 : null;
    case "perfect_reel": return e.type === "catch" && e.perfect ? progress + 1 : null;
    case "storm_catch": return e.type === "catch" && e.storm ? progress + 1 : null;
  }
}

export class MissionSystem {
  constructor(private room: OceanRoom) {}

  fillPlayer(p: Player) {
    while (p.missions.length < ACTIVE_MISSIONS_PER_PLAYER) {
      p.missions.push(make(pick(PLAYER_POOL, new Set(p.missions.map((m) => m.id)))));
    }
  }
  fillSquad(s: Squad) {
    while (s.missions.length < ACTIVE_MISSIONS_PER_SQUAD) {
      s.missions.push(make(pick(SQUAD_POOL, new Set(s.missions.map((m) => m.id)))));
    }
  }

  /** Feed an action of `p` into their personal missions and their squad's missions. */
  event(p: Player, e: MissionEvent) {
    this.playerEvent(p, e);
    const squad = this.room.state.squads.get(p.squad);
    if (squad) this.squadEvent(squad, e);
  }

  playerEvent(p: Player, e: MissionEvent) {
    for (let i = 0; i < p.missions.length; i++) {
      const m = p.missions[i];
      const t = BY_ID[m.id];
      if (!t) continue;
      const next = advance(t, m.progress, e);
      if (next === null) continue;
      m.progress = Math.min(m.target, next);
      if (m.progress >= m.target) {
        this.room.sendTo(p.id, "missionComplete", { title: t.title, xp: t.xp, coins: t.coins, squad: false });
        p.coins += t.coins;
        this.room.addXp(p, t.xp);
        const active = new Set(p.missions.map((x) => x.id));
        p.missions.splice(i, 1, make(pick(PLAYER_POOL, active)));
      }
    }
  }

  squadEvent(s: Squad, e: MissionEvent) {
    for (let i = 0; i < s.missions.length; i++) {
      const m = s.missions[i];
      const t = BY_ID[m.id];
      if (!t) continue;
      const next = advance(t, m.progress, e);
      if (next === null) continue;
      m.progress = Math.min(m.target, next);
      if (m.progress >= m.target) {
        const members = this.room.membersOf(s.id as SquadId);
        for (const p of members) {
          this.room.sendTo(p.id, "missionComplete", { title: t.title, xp: t.xp, coins: t.coins, squad: true });
          p.coins += t.coins;
          this.room.addXp(p, t.xp);
        }
        const sq = SQUADS[s.id as SquadId];
        this.room.announce({ kind: "squad_mission", text: `Squad ${sq.name} completed "${t.title}"!`, color: sq.color });
        const active = new Set(s.missions.map((x) => x.id));
        s.missions.splice(i, 1, make(pick(SQUAD_POOL, active)));
      }
    }
  }
}
