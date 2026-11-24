/** Solo day/night clock: one full day = 10 minutes. Rest at the dock skips ahead. */
import type { TimeOfDay } from "@freek/shared";

export const DAY_SECONDS = 600;

export function phaseOf(hour: number): TimeOfDay {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 20 || h < 5) return "night";
  if (h >= 17) return "dusk";
  return "day";
}

export class SoloClock {
  constructor(public hour = 10) {}
  /** endless night regions pin the clock */
  frozenAt: number | null = null;
  update(dt: number) {
    if (this.frozenAt !== null) { this.hour = this.frozenAt; return; }
    this.hour = (this.hour + (dt * 24) / DAY_SECONDS) % 24;
  }
  get phase(): TimeOfDay { return phaseOf(this.hour); }
  /** next resting target: day -> dusk, dusk -> night, night -> morning */
  get restTarget(): { hour: number; label: string } {
    const p = this.phase;
    return p === "day" ? { hour: 17.2, label: "dusk" } : p === "dusk" ? { hour: 20.5, label: "night" } : { hour: 7, label: "morning" };
  }
  rest(): string { const t = this.restTarget; this.hour = t.hour; return t.label; }
  /** "18:40" */
  get label() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
  /** seconds of real time until the next phase change */
  get secondsToNextPhase() {
    const h = this.hour, edges = [5, 17, 20, 29];
    const next = edges.find((e) => e > h) ?? 29;
    return ((next - h) * DAY_SECONDS) / 24;
  }
}
