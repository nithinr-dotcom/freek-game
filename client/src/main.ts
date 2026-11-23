import "./style.css";
import { Game } from "./game/Game";
import { OfflineNet } from "./game/offline";
import { Lobby } from "./ui/lobby";
import { Assets } from "./world/assets";
import { sfx } from "./audio";

async function boot() {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const ui = document.getElementById("ui") as HTMLElement;
  const labels = document.getElementById("labels") as HTMLElement;
  const params = new URLSearchParams(location.search);
  const offline = params.get("offline") === "1";

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

  if (offline) {
    game.attach(new OfflineNet(localStorage.getItem("tb_name") || "Captain"));
  } else {
    new Lobby(ui, (net) => game.attach(net), () => { location.search = "?offline=1"; });
  }
  (window as any).__game = game;
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;inset:20px;color:#fff;background:#300a;padding:20px;z-index:99">${String(e?.stack ?? e)}</pre>`);
});
