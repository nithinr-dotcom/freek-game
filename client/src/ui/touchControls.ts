/**
 * Mobile touch controls: floating joystick (left), CAST/REEL button + HARPOON button with drag-to-aim (right),
 * small icon bar, fullscreen + landscape lock, rotate hint. Only visible in touch mode.
 */
import { HARPOON_COOLDOWN_MS } from "@freek/shared";
import type { Input } from "../game/input";
import { InputMode } from "../game/device";
import { h } from "../util";

export interface TouchHooks {
  castDown(): void;
  castUp(): void;
  cancel(): void;
  /** aim = screen-space drag vector from the harpoon button, or null for auto-aim */
  harpoon(aim: { dx: number; dy: number } | null): void;
  aimPreview(aim: { dx: number; dy: number } | null): void;
  board(): void;
  chat(): void;
  squad(): void;
  menu(): void;
  settings(): void;
  phase(): string;
  cooldownLeft(): number;
}

const R = 62; // joystick radius px

export class TouchControls {
  readonly el: HTMLElement;
  private joyZone: HTMLElement; private joyBase: HTMLElement; private joyKnob: HTMLElement;
  private joyId = -1; private joyCx = 0; private joyCy = 0;
  private castBtn: HTMLElement; private castIcon: HTMLElement; private castLabel: HTMLElement;
  private harpBtn: HTMLElement; private harpRing: SVGCircleElement;
  private cancelBtn: HTMLElement;
  private rotateHint: HTMLElement;
  private castId = -1;
  private harpId = -1; private harpStart = { x: 0, y: 0 }; private aiming = false;
  private lastPhase = "";

  constructor(root: HTMLElement, private input: Input, private hooks: TouchHooks, opts: { solo: boolean }) {
    // joystick
    this.joyBase = h("div.joy-base");
    this.joyKnob = h("div.joy-knob");
    this.joyBase.append(this.joyKnob);
    this.joyZone = h("div.joy-zone", null, this.joyBase, h("div.joy-hint", null, "Drag to sail"));
    this.joyZone.addEventListener("pointerdown", (e) => this.joyDown(e));
    this.joyZone.addEventListener("pointermove", (e) => this.joyMove(e));
    for (const ev of ["pointerup", "pointercancel"]) this.joyZone.addEventListener(ev, (e) => this.joyUp(e as PointerEvent));

    // cast / reel
    this.castIcon = h("span.cb-icon", null, "🎣");
    this.castLabel = h("span.cb-label", null, "CAST");
    this.castBtn = h("button.touch-btn.cast-btn", null, this.castIcon, this.castLabel);
    this.castBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.castId = e.pointerId;
      try { this.castBtn.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      this.castBtn.classList.add("pressed");
      this.input.touchPrimary = true;
      this.hooks.castDown();
    });
    const castUp = (e: PointerEvent) => {
      if (e.pointerId !== this.castId) return;
      this.castId = -1;
      this.castBtn.classList.remove("pressed");
      this.input.touchPrimary = false;
      this.hooks.castUp();
    };
    this.castBtn.addEventListener("pointerup", castUp);
    this.castBtn.addEventListener("pointercancel", castUp);

    // harpoon with cooldown ring + drag to aim
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    this.harpRing = document.createElementNS(svgNS, "circle");
    this.harpRing.setAttribute("cx", "32"); this.harpRing.setAttribute("cy", "32"); this.harpRing.setAttribute("r", "29");
    this.harpRing.setAttribute("class", "hb-ring");
    svg.append(this.harpRing);
    this.harpBtn = h("button.touch-btn.harp-btn", null, svg, h("span.hb-icon", null, "🔱"));
    this.harpBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.harpId = e.pointerId; this.harpStart = { x: e.clientX, y: e.clientY }; this.aiming = false;
      try { this.harpBtn.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      this.harpBtn.classList.add("pressed");
    });
    this.harpBtn.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.harpId) return;
      const dx = e.clientX - this.harpStart.x, dy = e.clientY - this.harpStart.y;
      if (!this.aiming && Math.hypot(dx, dy) > 16) this.aiming = true;
      if (this.aiming) this.hooks.aimPreview({ dx, dy });
    });
    const harpUp = (e: PointerEvent, fire: boolean) => {
      if (e.pointerId !== this.harpId) return;
      this.harpId = -1;
      this.harpBtn.classList.remove("pressed");
      const dx = e.clientX - this.harpStart.x, dy = e.clientY - this.harpStart.y;
      this.hooks.aimPreview(null);
      if (fire) this.hooks.harpoon(this.aiming ? { dx, dy } : null);
      this.aiming = false;
    };
    this.harpBtn.addEventListener("pointerup", (e) => harpUp(e, true));
    this.harpBtn.addEventListener("pointercancel", (e) => harpUp(e, false));

    this.cancelBtn = h("button.touch-btn.cancel-btn", { onpointerdown: (e: PointerEvent) => { e.preventDefault(); e.stopPropagation(); this.hooks.cancel(); } }, "✕");

    const icon = (cls: string, label: string, title: string, fn: () => void) =>
      h(`button.touch-icon${cls}`, { title, onpointerdown: (e: PointerEvent) => { e.preventDefault(); e.stopPropagation(); fn(); } }, label);
    const icons = h("div.touch-icons", null,
      icon(".ti-menu", opts.solo ? "⏸" : "?", opts.solo ? "Pause" : "Help", () => this.hooks.menu()),
      icon(".ti-board", "🏆", "Leaderboard", () => this.hooks.board()),
      opts.solo ? null : icon(".ti-chat", "💬", "Chat", () => this.hooks.chat()),
      opts.solo ? null : icon(".ti-squad", "👥", "Squad", () => this.hooks.squad()),
      icon(".ti-settings", "⚙", "Settings", () => this.hooks.settings()),
      icon(".ti-full", "⛶", "Fullscreen", () => void toggleFullscreen()),
    );

    this.rotateHint = h("div.rotate-hint", null,
      h("span", null, "↻ Rotate for the best experience"),
      h("button", { onpointerdown: (e: PointerEvent) => { e.stopPropagation(); sessionStorage.setItem("tb_rot_dismissed", "1"); this.rotateHint.remove(); } }, "✕"),
    );
    if (sessionStorage.getItem("tb_rot_dismissed")) this.rotateHint.remove();

    this.el = h("div.touch-ui", null, this.joyZone, h("div.touch-right", null, this.cancelBtn, this.harpBtn, this.castBtn), icons, this.rotateHint);
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
    root.append(this.el);
    this.setVisible(InputMode.touch);
    InputMode.onChange((m) => this.setVisible(m === "touch"));
  }

  private setVisible(v: boolean) {
    this.el.classList.toggle("show", v);
    if (!v) { this.input.touchThrottle = 0; this.input.touchSteer = 0; this.input.touchPrimary = false; this.joyId = -1; this.joyBase.classList.remove("active"); }
  }

  private joyDown(e: PointerEvent) {
    if (this.joyId !== -1) return;
    e.preventDefault();
    this.joyId = e.pointerId;
    try { this.joyZone.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    const r = this.joyZone.getBoundingClientRect();
    this.joyCx = e.clientX; this.joyCy = e.clientY;
    this.joyBase.style.left = `${e.clientX - r.left}px`;
    this.joyBase.style.top = `${e.clientY - r.top}px`;
    this.joyBase.classList.add("active");
    this.joyZone.classList.add("used");
    this.setKnob(0, 0);
  }
  private joyMove(e: PointerEvent) {
    if (e.pointerId !== this.joyId) return;
    this.setKnob(e.clientX - this.joyCx, e.clientY - this.joyCy);
  }
  private joyUp(e: PointerEvent) {
    if (e.pointerId !== this.joyId) return;
    this.joyId = -1;
    this.joyBase.classList.remove("active");
    this.input.touchThrottle = 0; this.input.touchSteer = 0;
  }
  private setKnob(dx: number, dy: number) {
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
    this.input.touchThrottle = dz(-dy / R);
    this.input.touchSteer = dz(-dx / R); // left = positive steer (same as the A key)
  }

  update() {
    if (!this.el.classList.contains("show")) return;
    const ph = this.hooks.phase();
    if (ph !== this.lastPhase) {
      this.lastPhase = ph;
      const [icon, label] =
        ph === "charging" ? ["🎯", "RELEASE"] :
        ph === "casting" || ph === "waiting" ? ["⏳", "WAIT…"] :
        ph === "bite" ? ["❗", "HOOK!"] :
        ph === "hooking" ? ["🪝", "…"] :
        ph === "reeling" ? ["🌀", "REEL"] :
        ph === "landing" ? ["🐟", "…"] : ["🎣", "CAST"];
      this.castIcon.textContent = icon;
      this.castLabel.textContent = label;
      this.castBtn.dataset.phase = ph;
      this.cancelBtn.classList.toggle("show", ph !== "idle" && ph !== "charging");
    }
    const k = Math.max(0, Math.min(1, this.hooks.cooldownLeft() / HARPOON_COOLDOWN_MS));
    const circ = 2 * Math.PI * 29;
    this.harpRing.style.strokeDasharray = `${circ}`;
    this.harpRing.style.strokeDashoffset = `${circ * k}`;
    this.harpBtn.classList.toggle("ready", k <= 0);
  }
}

export async function toggleFullscreen() {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen(); else doc.webkitExitFullscreen?.();
      return;
    }
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else el.webkitRequestFullscreen?.();
  } catch { /* not allowed */ }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.("landscape");
  } catch { /* unsupported (desktop, iOS) */ }
}
