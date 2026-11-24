/** Act 3 (Stormbreak Strait) chapter scripts. */
import { registerChapterScript } from "./registry";
import { lineGateInfo } from "../lineGates";

// 13 · Weathering: this storm doesn't blow over until the chapter is done
registerChapterScript(13, (env) => ({
  update() { if (!env.net.state.storm) env.net.forceStorm(0); },
}));

// 14 · Gust Rider: the buoys only count if they're all touched before the tuna is landed
registerChapterScript(14, (env) => ({
  event(ev) {
    if (ev.t !== "catch" || ev.card.speciesId !== "stormscale_tuna") return;
    const buoys = env.obj()?.get("buoys");
    if (buoys?.state === "active") env.obj()!.force("buoys", "broken");
  },
  hint(_me, phase) {
    if (phase === "waiting" && !env.net.state.wind.gust) return "💨 Stormscale Tuna only bite during a GUST: watch the wind meter.";
    if (phase === "idle" && env.obj()?.get("buoys")?.state === "active") return "🛟 Touch the three marker buoys (📍 dots on the map) before you land the tuna.";
    return "";
  },
}));

// 16 · Line Breaker: nag about the line until it's strong enough
registerChapterScript(16, (env) => ({
  hint(_me, phase) {
    const gate = lineGateInfo("thunder_marlin");
    if (phase !== "idle" || !gate || env.net.loadout.ratingKg >= gate.minRatingKg) return "";
    return `🧵 Your ${env.net.loadout.ratingKg} kg line can't hold a Thunder Marlin: craft a ${gate.need} at the Workshop (dock).`;
  },
}));

// 17 · Hold the Line: serpent waves against the moored supply ship
registerChapterScript(17, (env) => {
  let next = 5;
  let waves = 0;
  return {
    update(dt) {
      const ship = env.actors.npc("supply");
      const hold = env.obj()?.main;
      if (!ship || !ship.alive || !hold || hold.state !== "active") return;
      ship.priority = 3;
      next -= dt;
      if (next > 0) return;
      next = waves < 2 ? 20 : 16;
      waves++;
      let alive = 0;
      env.net.state.monsters.forEach(() => alive++);
      const n = Math.min(waves >= 4 ? 2 : 1, 3 - alive);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        env.net.spawnMonster("serpent", { hp: 120, at: { x: ship.x + Math.cos(a) * 55, z: ship.z + Math.sin(a) * 55 } });
      }
      if (n > 0 && waves === 1) env.toast("<b>🐍 Serpents incoming!</b> They're after the ship: harpoon them before they reach her.", "bad");
    },
    hint(me, phase) {
      const ship = env.actors.npc("supply");
      if (phase !== "idle" || !ship?.alive) return "";
      return Math.hypot(me.x - ship.x, me.z - ship.z) > 45 ? "⚓ Get back to the supply ship (⛵ on the map): serpents are coming for her!" : "";
    },
  };
});
