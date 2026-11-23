/** Keyboard + mouse state for the game canvas. */
export class Input {
  readonly keys = new Set<string>();
  mouseX = 0; mouseY = 0;
  /** orbit drag delta accumulated since last consume */
  dragDX = 0; dragDY = 0;
  wheel = 0;
  leftHeld = false;
  dragging = false;
  allowDragOrbit = true;
  /** true when typing into a text field */
  get typing() {
    const a = document.activeElement as HTMLElement | null;
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
  }
  onKeyDown: ((code: string, e: KeyboardEvent) => void) | null = null;
  onKeyUp: ((code: string, e: KeyboardEvent) => void) | null = null;
  onPrimaryDown: (() => void) | null = null;
  onPrimaryUp: (() => void) | null = null;
  /** a left press turned into a camera drag */
  onPrimaryCancel: (() => void) | null = null;
  onSecondary: (() => void) | null = null;
  private downX = 0; private downY = 0;
  private midDrag = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (this.typing) return;
      if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.onKeyDown?.(e.code, e);
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.onKeyUp?.(e.code, e);
    });
    window.addEventListener("blur", () => { this.keys.clear(); if (this.leftHeld) { this.leftHeld = false; this.onPrimaryUp?.(); } });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      this.downX = e.clientX; this.downY = e.clientY;
      if (e.button === 0) { this.leftHeld = true; this.dragging = false; this.onPrimaryDown?.(); }
      else if (e.button === 1) { this.midDrag = true; e.preventDefault(); }
      else if (e.button === 2) this.onSecondary?.();
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      const dx = e.clientX - this.mouseX, dy = e.clientY - this.mouseY;
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      if (this.midDrag) { this.dragDX += dx; this.dragDY += dy; return; }
      if (this.leftHeld && this.allowDragOrbit) {
        if (!this.dragging && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 7) {
          this.dragging = true; // became an orbit drag: cancel the primary action
          this.onPrimaryCancel?.();
        }
        if (this.dragging) { this.dragDX += dx; this.dragDY += dy; }
      }
    });
    const up = (e: PointerEvent) => {
      if (e.button === 0 && this.leftHeld) {
        this.leftHeld = false;
        if (!this.dragging) this.onPrimaryUp?.();
        this.dragging = false;
      }
      if (e.button === 1) this.midDrag = false;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  get primaryHeld() { return (this.leftHeld && !this.dragging) || this.keys.has("Space"); }
  axis(neg: string[], pos: string[]) {
    if (this.typing) return 0;
    let v = 0;
    if (neg.some((k) => this.keys.has(k))) v -= 1;
    if (pos.some((k) => this.keys.has(k))) v += 1;
    return v;
  }
  consumeDrag() { const d = [this.dragDX, this.dragDY]; this.dragDX = this.dragDY = 0; return d; }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
}
