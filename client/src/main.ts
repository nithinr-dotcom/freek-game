import "./style.css";
import { getChapter, getRegion, type RegionId } from "@freek/shared";
import { Game } from "./game/Game";
import { SoloNet } from "./solo/SoloNet";
import { loadSave, newSave, writeSave, clearSave, type SoloSave } from "./solo/save";
import { regionClient } from "./solo/regions";
import { useLayout } from "./world/layout";
import { installDevApi } from "./solo/dev";
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

  // solo regions are separate maps: pick the layout before the world is built
  const urlRegion = params.get("region") as RegionId | null;
  const soloRegion: RegionId = (soloUrl && urlRegion && getRegion(urlRegion) ? urlRegion : loadSave()?.campaign.region) ?? "shallows_bay";
  const loadedRegion: RegionId = soloUrl ? soloRegion : "shallows_bay";
  if (soloUrl) { const lay = regionClient(loadedRegion)?.layout; if (lay) useLayout(lay()); }

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

  const goSoloUrl = (region: RegionId, chapter?: number) => {
    location.href = `${location.pathname}?solo=1&region=${region}${chapter ? `&chapter=${chapter}` : ""}${dev ? "&dev=1" : ""}`;
  };
  const startSolo = (save: SoloSave, chapter?: number) => {
    // a different region needs a fresh world
    if (save.campaign.region !== loadedRegion && regionClient(save.campaign.region)?.layout) { writeSave(save); goSoloUrl(save.campaign.region, chapter); return; }
    game.attach(new SoloNet(save), { chapter });
    if (dev) installDevApi(game);
  };
  const saveOrNew = () => loadSave() ?? newSave(localStorage.getItem("tb_name") || "Captain");

  if (soloUrl) {
    const save = saveOrNew();
    save.campaign.region = loadedRegion;
    const ch = Number(params.get("chapter")) || undefined;
    startSolo(save, ch && getChapter(ch)?.region === loadedRegion ? ch : undefined);
  } else {
    new Lobby(ui, (net) => game.attach(net), (a: SoloAction) => {
      if (a.type === "continue") startSolo(saveOrNew());
      else if (a.type === "new") { clearSave(); const s = newSave(a.name); writeSave(s); startSolo(s); }
      else if (a.type === "chapter") {
        const s = saveOrNew(), c = getChapter(a.id);
        if (c) s.campaign.region = c.region;
        startSolo(s, a.id);
      } else if (a.type === "region") { const s = saveOrNew(); s.campaign.region = a.region; s.campaign.current = null; startSolo(s, -1); }
    });
  }
  (window as any).__game = game;
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;inset:20px;color:#fff;background:#300a;padding:20px;z-index:99">${String(e?.stack ?? e)}</pre>`);
});
