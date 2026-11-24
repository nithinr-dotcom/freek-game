/**
 * The Aquarium: a 3D tank with your record fish (best weight per species) from the campaign Codex and Endless Tide.
 * Up to 18 fish swim at once, the rarest first; click a card to call that fish to the glass.
 */
import * as THREE from "three";
import { TIER_INFO, tierRank, type Tier } from "@freek/shared";
import { loadSave } from "../solo/save";
import { loadMeta } from "../endless/meta";
import { speciesInfo } from "../solo/species";
import { createFish } from "../entities/fishFactory";
import { animateFish } from "../entities/fishModels";
import { h } from "../util";
import { sfx } from "../audio";

interface Entry { id: string; name: string; tier: Tier; kg: number; source: string }
interface Swimmer { e: Entry; obj: THREE.Object3D; pos: THREE.Vector3; target: THREE.Vector3; speed: number; t: number; called: number }

const TANK = { w: 16, h: 7, d: 6 };

function entries(): Entry[] {
  const out = new Map<string, Entry>();
  const save = loadSave();
  for (const [id, c] of Object.entries(save?.codex ?? {})) {
    const sp = speciesInfo(id);
    if (sp) out.set(id, { id, name: sp.name, tier: sp.tier, kg: c.recordKg, source: "Campaign" });
  }
  for (const [id, t] of Object.entries(loadMeta().trophies)) {
    const sp = speciesInfo(id);
    if (!sp) continue;
    const cur = out.get(id);
    if (!cur || t.kg > cur.kg) out.set(id, { id, name: sp.name, tier: sp.tier, kg: t.kg, source: cur ? "Campaign + Endless" : "Endless" });
  }
  return [...out.values()].sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || b.kg - a.kg);
}

export function openAquarium(root: HTMLElement) {
  const list = entries();
  const canvas = document.createElement("canvas");
  canvas.className = "aq-canvas";
  const cards = h("div.aq-cards");
  let raf = 0;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b3a52");
  scene.fog = new THREE.Fog("#0b3a52", 10, 26);
  const camera = new THREE.PerspectiveCamera(42, 2, 0.1, 80);
  camera.position.set(0, 0.6, 13.5);
  camera.lookAt(0, -0.2, 0);
  scene.add(new THREE.HemisphereLight("#bfefff", "#103040", 1.6));
  const sun = new THREE.DirectionalLight("#ffffff", 2.2);
  sun.position.set(3, 8, 5);
  scene.add(sun);
  const caustic = new THREE.PointLight("#7fe8ff", 18, 18);
  caustic.position.set(0, 3, 2);
  scene.add(caustic);
  // sand, rocks, kelp, glass edges, bubbles
  const sand = new THREE.Mesh(new THREE.BoxGeometry(TANK.w + 2, 0.8, TANK.d + 2), new THREE.MeshStandardMaterial({ color: "#d8c08a", roughness: 1, flatShading: true }));
  sand.position.y = -TANK.h / 2 - 0.4;
  scene.add(sand);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(TANK.w + 6, TANK.h + 4), new THREE.MeshBasicMaterial({ color: "#0e4a68" }));
  back.position.set(0, 0, -TANK.d / 2 - 0.6);
  scene.add(back);
  const rockMat = new THREE.MeshStandardMaterial({ color: "#5a6a70", flatShading: true, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.9), rockMat);
    r.position.set((Math.random() - 0.5) * TANK.w, -TANK.h / 2 + 0.1, -TANK.d / 2 + Math.random() * 2);
    r.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(r);
  }
  const kelp: THREE.Mesh[] = [];
  const kelpMat = new THREE.MeshStandardMaterial({ color: "#2f8f4a", flatShading: true, side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) {
    const hgt = 2 + Math.random() * 3.5;
    const k = new THREE.Mesh(new THREE.ConeGeometry(0.22, hgt, 4, 6), kelpMat);
    k.geometry.translate(0, hgt / 2, 0);
    k.position.set((Math.random() - 0.5) * TANK.w, -TANK.h / 2, -TANK.d / 2 + Math.random() * 2.5);
    k.userData.ph = Math.random() * 6;
    kelp.push(k);
    scene.add(k);
  }
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(TANK.w + 1.4, TANK.h + 1, TANK.d + 1.4)), new THREE.LineBasicMaterial({ color: "#bfefff", transparent: true, opacity: 0.35 }));
  scene.add(edge);
  const bubbleGeo = new THREE.SphereGeometry(0.08, 6, 4);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: "#dff8ff", transparent: true, opacity: 0.6 });
  const bubbles: THREE.Mesh[] = [];
  for (let i = 0; i < 40; i++) {
    const b = new THREE.Mesh(bubbleGeo, bubbleMat);
    b.position.set((Math.random() - 0.5) * TANK.w, -TANK.h / 2 + Math.random() * TANK.h, (Math.random() - 0.5) * TANK.d);
    b.userData.sp = 0.6 + Math.random();
    bubbles.push(b);
    scene.add(b);
  }
  // fish
  const rnd = () => new THREE.Vector3((Math.random() - 0.5) * (TANK.w - 2), (Math.random() - 0.5) * (TANK.h - 2), (Math.random() - 0.5) * (TANK.d - 1.5));
  const swimmers: Swimmer[] = list.slice(0, 18).map((e) => {
    const obj = createFish(e.id);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const len = 0.9 + tierRank(e.tier) * 0.25 + Math.min(1.2, Math.log10(1 + e.kg) * 0.45);
    obj.scale.multiplyScalar(len / Math.max(size.x, size.y, size.z, 0.001));
    const pos = rnd();
    obj.position.copy(pos);
    scene.add(obj);
    if (tierRank(e.tier) >= 3) { const l = new THREE.PointLight(TIER_INFO[e.tier].color, 2.5, 3); obj.add(l); }
    return { e, obj, pos, target: rnd(), speed: 0.8 + Math.random() * 0.8, t: Math.random() * 10, called: 0 };
  });

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(200, r.width), hh = Math.max(150, r.height);
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  let last = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    for (const s of swimmers) {
      s.t += dt;
      if (s.called > 0) { s.called -= dt; s.target.set(0, 0, TANK.d / 2 - 0.6); }
      const d = s.target.clone().sub(s.pos);
      if (d.length() < 0.5 && s.called <= 0) s.target = rnd();
      const v = d.normalize().multiplyScalar(s.speed * dt * (s.called > 0 ? 2.5 : 1));
      s.pos.add(v);
      s.obj.position.set(s.pos.x, s.pos.y + Math.sin(s.t * 1.7) * 0.06, s.pos.z);
      const want = Math.atan2(v.x, v.z);
      let diff = want - s.obj.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      s.obj.rotation.y += diff * Math.min(1, dt * 3);
      animateFish(s.obj, t, 1.2);
    }
    for (const k of kelp) k.rotation.z = Math.sin(t * 0.9 + k.userData.ph) * 0.12;
    for (const b of bubbles) { b.position.y += b.userData.sp * dt; if (b.position.y > TANK.h / 2) b.position.y = -TANK.h / 2; }
    caustic.position.x = Math.sin(t * 0.4) * 5;
    renderer.render(scene, camera);
  };

  for (const e of list) {
    const s = swimmers.find((x) => x.e.id === e.id);
    cards.append(h(`button.aq-card${s ? "" : ".off"}`, { style: `--tc:${TIER_INFO[e.tier].color}`, title: s ? "Call it to the glass" : "Only the 18 rarest swim in the tank", onclick: () => { if (s) { s.called = 4; sfx.click(); } } },
      h("b", null, e.name), h("span", null, `${TIER_INFO[e.tier].label} · ${e.kg} kg`), h("small", null, e.source)));
  }
  const close = () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKey, true); el.classList.remove("show"); setTimeout(() => { el.remove(); renderer.dispose(); }, 250); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
  const el = h("div.overlay.aquarium", null, h("div.modal.aq-modal", null,
    h("button.icon-btn.en-x", { onclick: close, title: "Close" }, "✕"),
    h("div.en-cash-k", null, `${list.length} SPECIES ON DISPLAY`),
    h("h2", null, "🐠 Aquarium"),
    list.length ? canvas : h("p.aq-empty", { html: "The tank is empty. Catch fish in the <b>campaign</b> or in <b>Endless Tide</b>: every species you land is displayed here at its record weight." }),
    list.length ? cards : null,
  ));
  root.append(el);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", resize);
  requestAnimationFrame(() => { el.classList.add("show"); resize(); if (list.length) loop(); });
}
