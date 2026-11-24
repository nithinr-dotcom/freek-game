/** Act 2 (Coral Maze) chapter scripts. */
import { registerChapterScript } from "./registry";

// 7 · Into the Maze: point at the pearls while they're missing
registerChapterScript(7, (env) => ({
  hint(_me, phase) {
    if (phase !== "idle") return "";
    const main = env.obj()?.main;
    const pearls = main?.data.sub?.items[0];
    if (!main || main.state !== "active" || !pearls || pearls.state === "done") return "";
    return `🦪 Pearls: ${Math.floor(pearls.progress)}/5. They're the white dots on the map, strung along the way to the Arch.`;
  },
}));

// 10 · Pearl Diver: hook the tow, then serpents come for Nell
registerChapterScript(10, (env) => {
  let towT = -1;
  const ambush = [22, 65, 120];
  return {
    update(dt) {
      const nell = env.actors.npc("nell");
      if (!nell || !nell.alive || nell.arrived) return;
      if (towT < 0) { if (nell.attached) { towT = 0; env.toast("<b>⛓ Nell's on the rope!</b> Wide turns: her hull is thin."); } return; }
      towT += dt;
      if (ambush.length && towT >= ambush[0]) {
        ambush.shift();
        if (env.net.state.monsters.size < 2) {
          const a = Math.random() * Math.PI * 2;
          env.net.spawnMonster("serpent", { hp: 180, at: { x: nell.x + Math.cos(a) * 48, z: nell.z + Math.sin(a) * 48 } });
        }
      }
    },
    hint(_me, phase) {
      const nell = env.actors.npc("nell");
      if (phase !== "idle" || !nell || nell.attached || !nell.alive) return "";
      return "⛓ Sail to Nell in the Diver's Grotto (the boat on the map, far north) and come alongside to hook the tow rope.";
    },
  };
});
