/** P3 additions to the ?dev=1 API (window.__dev): meters, floes, plates, the Eye Duel, finale. */
import { envHost } from "./hazards/host";
import type { ColdMeter } from "./hazards/cold";
import type { Lantern } from "./hazards/lantern";
import type { IceFloes } from "./hazards/iceFloes";
import type { Whirlpool } from "./hazards/whirlpool";
import type { Horrors } from "./hazards/horrors";
import type { Game } from "../game/Game";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function devP3(game: Game, api: any) {
  const host = () => envHost.current;
  const net = () => game.soloModeRef!.net;
  return {
    p3() {
      const h = host(), c = h?.get<ColdMeter>("cold"), l = h?.get<Lantern>("lantern"), f = h?.get<IceFloes>("floes"), w = h?.get<Whirlpool>("whirlpool");
      return {
        hazards: h?.list.map((x) => x.id), warmth: c ? Math.round(c.warmth * 1000) / 1000 : undefined, heatersLit: c?.heaters.filter((b) => b.lit).length,
        frozenSlow: c?.slowed, fuel: l ? Math.round(l.fuel * 1000) / 1000 : undefined, visRadius: l ? Math.round(l.radius) : undefined,
        floes: f?.floes.length, thrown: f?.floes.filter((x) => x.thrown).length, whirlpool: w?.active ? { x: w.x, z: w.z, R: w.R, strength: w.strength, pull: w.enabledPull } : null,
        horrors: h?.get<Horrors>("horrors")?.alive, fogFar: Math.round(h?.ctx.world.sky.fog.far ?? 0),
        weather: [...(game.soloModeRef as unknown as { weatherTags(): Set<string> }).weatherTags()],
      };
    },
    warmth(v: number) { const c = host()?.get<ColdMeter>("cold"); if (c) c.warmth = v; return api.step(0.05); },
    fuel(v: number) { const l = host()?.get<Lantern>("lantern"); if (l) l.fuel = v; return api.step(0.05); },
    /** nearest floe to the boat */
    nearestFloe() {
      const f = host()?.get<IceFloes>("floes"), me = net().me;
      if (!f) return null;
      let best = f.floes[0], bd = Infinity;
      for (const x of f.floes) { const d = Math.hypot(x.x - me.x, x.z - me.z); if (d < bd) { bd = d; best = x; } }
      return { x: best.x, z: best.z, r: best.r, d: bd };
    },
    /** fire the harpoon at a world point */
    harpoonAt(x: number, z: number) { net().send("harpoon", { tx: x, tz: z }); return api.step(0.4); },
    controller() { const id = game.soloModeRef!.runner.bossId; return id ? net().controllers.get(id) : null; },
    winDuel() { const c = api.controller() as { devWinDuel?(): void } | null; c?.devWinDuel?.(); return api.step(0.3); },
    /** hold (true) or release the reel input for the Eye Duel / normal reels */
    hold(on = true) { (game as unknown as { input: { touchPrimary: boolean } }).input.touchPrimary = on; },
  };
}
