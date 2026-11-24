/**
 * Full screen on phones. Android Chrome: enter full screen on the first tap (a page may only ask from a user gesture).
 * iPhone/iPad Safari can't hide its bars from a page, so we show an "Add to Home Screen" tip; launched from the
 * Home Screen the game runs full screen thanks to the web app manifest (public/manifest.json).
 */
import { toggleFullscreen } from "./ui/touchControls";

export const isStandalone = () =>
  matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isTouchDevice = () => matchMedia("(pointer: coarse)").matches || new URLSearchParams(location.search).get("touch") === "1";
export const inFullscreen = () => !!(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement);
/** the page can request full screen itself (not iPhone Safari) */
export const canFullscreen = () => !!(document.documentElement.requestFullscreen || (document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen) && !(isIOS() && !/iPad/.test(navigator.userAgent));

/** phones: go full screen on the first tap anywhere (skipped when installed, on iPhone, or on desktop) */
export function autoFullscreenOnFirstTap() {
  if (!isTouchDevice() || isStandalone() || !canFullscreen()) return;
  const go = () => { if (!inFullscreen()) void toggleFullscreen(); };
  window.addEventListener("pointerup", go, { once: true, capture: true });
}
