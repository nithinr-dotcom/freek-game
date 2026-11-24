/**
 * ?dev=1 debug API on window.__dev (solo). Lets scripts drive a backgrounded tab with fixed-timestep frames.
 * Examples: __dev.jumpChapter(4); __dev.setTime("night"); __dev.giveItems(); __dev.step(5); __dev.catchFish("perch", 1.1)
 */
import { allChapters, getChapter, GEAR_SLOTS, MATERIAL_IDS, MATERIALS, TIER_INFO, fishPoints, getCampaignSpecies, type CampaignChapter, type GearSlot, type MaterialId } from "@freek/shared";
import type { Game } from "../game/Game";
import { computeLoadout } from "./loadout";
import { DEV_CHAPTERS } from "./devChapters";
import { devP3 } from "./devP3";

export function installDevApi(game: Game) {
  const mode = () => game.soloModeRef!;
  const net = () => mode().net;
  const api = {
    game, mode, net, save: () => net().save,
    /** run n seconds of game time in fixed steps (renders the last frame) */
    step(seconds = 1, dt = 1 / 30) { const n = Math.max(1, Math.round(seconds / dt)); for (let i = 0; i < n; i++) game.step(dt, i === n - 1); return api.state(); },
    state() {
      const m = mode(), r = m.runner, me = net().me;
      return {
        chapter: r.def?.id ?? null, status: r.status, elapsed: Math.round(r.elapsed), damage: r.damageTaken, assist: r.assist,
        objectives: r.obj?.items.map((o) => `${o.optional ? "opt" : "main"}:${o.def.id}=${o.state}(${Math.floor(o.progress)}/${o.target})`),
        hour: Math.round(m.clock.hour * 10) / 10, phase: m.clock.phase, hp: me.hp, maxHp: net().maxHp, x: Math.round(me.x), z: Math.round(me.z),
        bag: me.unbanked.length, coins: me.coins, level: me.level, bait: { ...net().save.bait }, baitEquipped: net().save.baitEquipped,
        speedMult: Math.round(game.localRef.speedMult * 100) / 100, boss: m.bossBar(), monsters: net().state.monsters.size, fishPhase: (game as any).fishing?.phase,
      };
    },
    /** become "at" chapter n (earlier chapters marked done) and start it */
    jumpChapter(n: number) {
      const s = net().save;
      for (const c of allChapters()) {
        if (c.id >= n) { if (s.campaign.chapters[c.id]?.done) delete s.campaign.chapters[c.id]; continue; }
        s.campaign.chapters[c.id] ??= { done: true, stars: 1, grade: "C", fails: 0 };
        s.campaign.chapters[c.id].done = true;
        if (c.rewards.unlockRegion && !s.campaign.unlockedRegions.includes(c.rewards.unlockRegion)) s.campaign.unlockedRegions.push(c.rewards.unlockRegion);
        if (c.boss && !s.bossesBeaten.includes(c.boss)) s.bossesBeaten.push(c.boss);
      }
      s.campaign.current = null;
      mode().runner.start(n);
      return api.state();
    },
    start(n: number) { mode().runner.start(n); return api.state(); },
    retry(assist = false) { const r = mode().runner; r.start(r.def, { retry: true, assist }); return api.state(); },
    testChapter(kind: keyof typeof DEV_CHAPTERS) { mode().startCustom(DEV_CHAPTERS[kind] as CampaignChapter); return api.state(); },
    /** force the main objective done (chapter completes with whatever optionals hold) */
    complete() { const o = mode().runner.obj; if (!o) return; o.main.state = "done"; o.main.progress = o.main.target; api.step(0.1); return api.state(); },
    fail(reason = "Dev fail") { mode().runner.fail(reason); return api.state(); },
    skipDialogue() { (game as any).dialogue?.finish(); document.querySelectorAll<HTMLElement>(".dlg-skip").forEach((b) => b.click()); },
    setTime(t: "day" | "dusk" | "night" | number) { mode().clock.hour = typeof t === "number" ? t : t === "day" ? 11 : t === "dusk" ? 17.5 : 22; return mode().clock.label; },
    storm() { net().toggleStorm(); }, gust() { net().gust(); },
    giveItems(coins = 5000, mats = 40) {
      const s = net().save;
      net().me.coins += coins;
      for (const id of MATERIAL_IDS) if (s.campaign.unlockedRegions.includes(MATERIALS[id].region)) s.materials[id] = (s.materials[id] ?? 0) + (MATERIALS[id].trophy ? 2 : mats);
      s.bait.sardine = (s.bait.sardine ?? 0) + 3;
      net().persist();
      return { coins: net().me.coins, materials: s.materials };
    },
    give(id: MaterialId, n = 10) { mode().grantMaterial(id, n, true); },
    bait(id = "sardine", n = 1) { const s = net().save; s.bait[id] = (s.bait[id] ?? 0) + n; s.baitEquipped = id; },
    setGear(slot: GearSlot, tier: number) { net().save.gear[slot] = tier; net().setLoadout(computeLoadout(net().save, mode().runner.assist)); return net().loadout; },
    skill(id: string, rank = 1) { net().save.skills[id] = rank; net().setLoadout(computeLoadout(net().save, mode().runner.assist)); return net().loadout.skills; },
    /** land a fish directly (bypasses cast + minigame) */
    catchFish(speciesId = "perch", kg?: number, perfect = false) {
      const sp = getCampaignSpecies(speciesId)!;
      const w = kg ?? Math.round((sp.minKg + (sp.maxKg - sp.minKg) * 0.3) * 10) / 10;
      const n = net() as any;
      n.pending = { card: { speciesId, tier: sp.tier, weightKg: w, points: fishPoints(sp.tier, w), at: Date.now(), catcher: n.me.name } };
      n.pendingRoll = { speciesId, tier: sp.tier, weightKg: w, points: fishPoints(sp.tier, w), behaviour: sp.behaviour };
      n.me.state = "reeling";
      n.send("reelResult", { success: true, maxTension: perfect ? 0.1 : 0.8 });
      api.step(0.2);
      return api.state();
    },
    snap() { const n = net() as any; n.pending = { card: { speciesId: "perch", tier: "common", weightKg: 1, points: 1, at: 0, catcher: "" } }; n.me.state = "reeling"; n.send("reelResult", { success: false, maxTension: 1 }); api.step(0.1); },
    /** roll the campaign fish table n times at the boat (condition checks) */
    rollMany(n = 200) {
      const counts: Record<string, number> = {};
      const me = net().me;
      me.bobX = me.x; me.bobZ = me.z;
      for (let i = 0; i < n; i++) { const r = (net().hooks.rollFish!)(((): any => (Math.hypot(me.x, me.z) < 140 ? "shallows" : Math.hypot(me.x, me.z) < 300 ? "reef" : "abyss"))(), false)!; counts[r.speciesId] = (counts[r.speciesId] ?? 0) + 1; }
      return counts;
    },
    autoReel(on = true) { game.reelRef.autoplay = on; },
    teleport(x: number, z: number) { const l = game.localRef; l.snap(x, z, l.rot); net().me.x = x; net().me.z = z; api.step(0.1); return api.state(); },
    bank() { api.teleport(0, -40); api.teleport(0, -6); api.step(0.3); return api.state(); },
    damage(n = 10) { net().damage(n, "dev"); api.step(0.05); return api.state(); },
    killBoss() { const id = mode().runner.bossId; const m = id ? net().state.monsters.get(id) : null; if (m) { m.hp = 1; (net() as any).fireOne(m.x, m.z, false); } api.step(0.5); return api.state(); },
    hitBoss(dmg = 100) { const id = mode().runner.bossId; const m = id ? net().state.monsters.get(id) : null; if (!m) return null; m.hp = Math.max(1, m.hp - dmg); net().controllers.get(m.id)?.onHit?.(dmg); return api.state(); },
    tier: TIER_INFO, gearSlots: GEAR_SLOTS, getChapter,
  };
  Object.assign(api, devP3(game, api));
  (window as any).__dev = api;
  return api;
}
