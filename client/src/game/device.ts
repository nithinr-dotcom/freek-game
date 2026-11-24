/**
 * Device helpers: touch/desktop input-mode detection (never both at once), graphics tier, haptics.
 * Touch mode: `(pointer: coarse)` or the first touch; back to desktop on real mouse/keyboard input.
 * `?touch=1` forces touch mode (testing on desktop).
 */
import { TIERS, type Tier } from "@freek/shared";
import { loadSettings, type GraphicsSetting } from "../solo/save";

type Mode = "touch" | "desktop";
const listeners = new Set<(m: Mode) => void>();
const forced = new URLSearchParams(location.search).get("touch") === "1";
let mode: Mode = forced || matchMedia("(pointer: coarse)").matches ? "touch" : "desktop";

function setMode(m: Mode) {
  if (m === mode) return;
  if (forced && m === "desktop") return;
  mode = m;
  document.body.classList.toggle("touch-mode", m === "touch");
  for (const l of listeners) l(m);
}
document.body.classList.toggle("touch-mode", mode === "touch");
window.addEventListener("touchstart", () => setMode("touch"), { capture: true, passive: true });
window.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch" || e.pointerType === "pen") setMode("touch"); else if (e.pointerType === "mouse") setMode("desktop"); }, { capture: true });
let lastMouse = { x: -1, y: -1 };
window.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  // ignore tiny jitter; a real mouse moves
  if (lastMouse.x >= 0 && Math.hypot(e.clientX - lastMouse.x, e.clientY - lastMouse.y) > 6) setMode("desktop");
  lastMouse = { x: e.clientX, y: e.clientY };
}, { capture: true, passive: true });
window.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return; // on-screen keyboards
  if (e.code && e.code !== "Unidentified") setMode("desktop");
}, { capture: true });

export const InputMode = {
  get touch() { return mode === "touch"; },
  onChange(fn: (m: Mode) => void) { listeners.add(fn); },
};

// ------------------------------------------------------------------ graphics tier
export interface GfxTier {
  name: "low" | "high";
  dprCap: number; shadows: boolean; shadowSize: number;
  rain: number; wake: number; splash: number; oceanSegs: number; fogScale: number;
}
const LOW: GfxTier = { name: "low", dprCap: 1.35, shadows: true, shadowSize: 1024, rain: 1200, wake: 360, splash: 700, oceanSegs: 170, fogScale: 0.7 };
const HIGH: GfxTier = { name: "high", dprCap: 2, shadows: true, shadowSize: 2048, rain: 4000, wake: 800, splash: 1400, oceanSegs: 340, fogScale: 1 };

export function autoIsLow(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = matchMedia("(pointer: coarse)").matches || forced;
  const smallScreen = Math.min(screen.width, screen.height) < 600;
  return coarse || smallScreen || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
}
export function gfxTier(setting: GraphicsSetting = loadSettings().graphics): GfxTier {
  if (setting === "low") return LOW;
  if (setting === "high") return HIGH;
  return autoIsLow() ? LOW : HIGH;
}

// ------------------------------------------------------------------ haptics
function vibrate(p: number | number[]) {
  try { if ("vibrate" in navigator && mode === "touch") navigator.vibrate(p); } catch { /* unsupported */ }
}
export const haptics = {
  bite() { vibrate(35); },
  damage() { vibrate([60, 40, 90]); },
  levelUp() { vibrate([40, 60, 40, 60, 120]); },
  catch(tier: Tier) {
    const r = TIERS.indexOf(tier);
    vibrate(r <= 0 ? 25 : r === 1 ? [25, 40, 25] : r === 2 ? [30, 40, 30, 40, 60] : r === 3 ? [40, 40, 40, 40, 40, 40, 120] : [60, 50, 60, 50, 60, 50, 250]);
  },
};
