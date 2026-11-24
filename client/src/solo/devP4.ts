/** P4 additions to the ?dev=1 API (window.__dev): modes, bounties, loot, achievements, ending replay. */
import { allChapters, type CampaignMode, type ObjectiveKind } from "@freek/shared";
import type { Game } from "../game/Game";
import { ChapterRunner } from "./chapterRunner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function devP4(game: Game, api: any) {
  const mode = () => game.soloModeRef!;
  const net = () => mode().net;
  return {
    p4() {
      const n = net(), r = mode().runner, b = mode().bounty;
      return {
        mode: r.mode, selected: n.save.campaign.mode ?? "normal", hpMult: n.monsterHpMult, dmgMult: n.monsterDmgMult, fishDiff: n.fishDiffBonus,
        timeLimit: r.def ? r.timeLimitOf(r.def) : null, ironman: r.def ? r.ironmanOf(r.def) : null,
        flags: { hard: !!n.save.flags.hardUnlocked, legendary: !!n.save.flags.legendaryUnlocked, credits: !!n.save.flags.creditsSeen },
        bounty: b.active ? { ...b.active, elapsed: Math.round(b.elapsed), progress: b.engine?.main.progress } : null,
        board: b.board.list.map((x) => `${x.id} ${x.kind.type} ${x.title}${x.timeLimit ? ` ⏳${x.timeLimit}` : ""} ● ${x.reward.coins}`),
        achievements: Object.keys(n.save.achievements).length,
      };
    },
    /** unlock Hard (+ Legendary) as if the campaign were done; select a mode for the next chapter start */
    setMode(m: CampaignMode, unlock = true) {
      const s = net().save;
      if (unlock) { s.flags.hardUnlocked = true; s.flags.campaignDone = true; if (m === "legendary") s.flags.legendaryUnlocked = true; }
      s.campaign.mode = m;
      return ChapterRunner.modeOf(s);
    },
    /** mark every chapter done on a mode (Legendary-unlock checks) */
    clearMode(m: "hard" | "legendary", grade: "S" | "A" | "B" | "C" = "B", except: number[] = []) {
      const s = net().save;
      for (const c of allChapters()) if (!except.includes(c.id)) { const r = ChapterRunner.record(s, c.id, m, true)!; r.done = true; r.stars = 2; r.grade = grade; }
      return Object.keys(s.campaign.modeRecords?.[m] ?? {}).length;
    },
    /** post a bounty with a chosen objective (index 0) and accept it */
    forceBounty(kind: ObjectiveKind = { type: "catch_count", n: 2 }, timeLimit?: number) {
      const b = mode().bounty, board = b.board;
      board.list[0] = { ...board.list[0], id: `${board.list[0].region}-dev${board.seq++}`, title: "Dev Bounty", kind, timeLimit, reward: { coins: 111, xp: 50, mats: board.list[0].reward.mats } };
      b.accept(board.list[0].id);
      return api.p4();
    },
    openBounties() { mode().openBounties(); },
    rerollBounty(i = 0) { const b = mode().bounty; return b.reroll(b.board.list[i].id); },
    /** spawn a serpent next to the boat, flag it as hit and kill it: returns the loot card */
    lootTest() {
      const n = net() as any, me = n.me;
      const before = me.unbanked.length;
      const m = n.spawnMonster("serpent", { at: { x: me.x + 10, z: me.z + 10 } });
      m.state = "chasing";
      const ai = n.ai.get(m.id); if (ai) ai.hitters = true;
      m.hp = 0; n.killMonster(m);
      return me.unbanked.slice(before).map((c: any) => `${c.speciesId}/${c.tier}/${c.weightKg}`);
    },
    spawnSerpent() { const n = net() as any, me = n.me; return n.spawnMonster("serpent", { at: { x: me.x + 12, z: me.z + 12 } }); },
    replayEnding() { (mode() as any).openChart(); setTimeout(() => (document.querySelector(".cd-actions button:last-child") as HTMLElement | null)?.click(), 50); },
    openAchievements() { mode().openCodex("ach"); },
    stat(id: string, v: number) { mode().ach.set(id, v); return net().save.stats[id]; },
  };
}
