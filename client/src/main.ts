import "./style.css";
import { CHAPTERS, FREE_PLAY_CHAPTER } from "@freek/shared";
import { Game } from "./game/Game";
import { SoloNet } from "./solo/SoloNet";
import { loadSave, newSave, writeSave, clearSave, type SoloSave } from "./solo/save";
import { Lobby, type SoloAction } from "./ui/lobby";
import { Assets } from "./world/assets";
import { sfx } from "./audio";

async function boot() {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const ui = document.getElementById("ui") as HTMLElement;
  const labels = document.getElementById("labels") as HTMLElement;
  const params = new URLSearchParams(location.search);
  const dev = params.get("dev") === "1";
  const soloUrl = params.get("offline") === "1" || params.get("solo") === "1";

  const loading = document.createElement("div");
  loading.className = "loading";
  loading.innerHTML = `<div class="loading-title">TIDE<span>BREAKERS</span></div><div class="loading-bar"><i></i></div>`;
  ui.append(loading);

  await Assets.init();
  const game = new Game(canvas, ui, labels);
  loading.classList.add("out");
  setTimeout(() => loading.remove(), 600);
  window.addEventListener("pointerdown", () => sfx.unlock(), { once: true });
  window.addEventListener("keydown", () => sfx.unlock(), { once: true });

  const startSolo = (save: SoloSave, replayChapter?: number) => {
    game.attach(new SoloNet(save), { replayChapter });
  };
  const fromChapterChoice = (id: number) => {
    const save = loadSave() ?? newSave(localStorage.getItem("tb_name") || "Captain");
    if (dev && id !== save.chapter) {
      // dev chapter jump: become "at" chapter N with earlier rewards granted
      save.chapter = Math.max(1, Math.min(FREE_PLAY_CHAPTER, id));
      save.unlocks.harpoonUpgrade = save.chapter > 3;
      save.unlocks.legendaryRod = save.chapter > 5;
      save.unlocks.reef = save.chapter >= 2;
      save.unlocks.abyss = save.chapter >= 4;
      save.finished = save.chapter > CHAPTERS.length;
      save.current = { progress: [], elapsed: 0, sank: false, introSeen: false };
      writeSave(save);
      startSolo(save);
    } else if (id < save.chapter && id <= CHAPTERS.length) startSolo(save, id);
    else startSolo(save);
  };

  if (soloUrl) {
    const ch = Number(params.get("chapter"));
    if (ch) fromChapterChoice(ch);
    else startSolo(loadSave() ?? newSave(localStorage.getItem("tb_name") || "Captain"));
  } else {
    new Lobby(ui, (net) => game.attach(net), (a: SoloAction) => {
      if (a.type === "continue") startSolo(loadSave() ?? newSave(a.type === "continue" ? localStorage.getItem("tb_name") || "Captain" : "Captain"));
      else if (a.type === "new") { clearSave(); const s = newSave(a.name); writeSave(s); startSolo(s); }
      else fromChapterChoice(a.id);
    });
  }
  (window as any).__game = game;
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;inset:20px;color:#fff;background:#300a;padding:20px;z-index:99">${String(e?.stack ?? e)}</pre>`);
});
