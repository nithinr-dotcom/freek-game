/** Top-right minimap canvas: zone rings, islands, dock, players (squad colours), monsters (red skulls). North (up) = -Z. */
import { ZONES, WORLD_RADIUS, DOCK_POS, DOCK_RADIUS, SQUADS, type PlayerS, type MonsterS } from "@freek/shared";
import { ISLANDS, LIGHTHOUSE_POS } from "../world/layout";
import { h } from "../util";

export class Minimap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private size = 190;
  private zoomed = false;
  private t = 0;

  constructor(root: HTMLElement) {
    this.canvas = h("canvas.minimap-canvas") as HTMLCanvasElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = this.size * dpr;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.scale(dpr, dpr);
    this.el = h("div.minimap", { title: "Click to zoom" }, this.canvas, h("div.mm-n", null, "N"));
    this.el.addEventListener("click", () => { this.zoomed = !this.zoomed; });
    root.append(this.el);
    this.bg = document.createElement("canvas");
    this.bg.width = this.bg.height = this.size * dpr;
    const b = this.bg.getContext("2d")!;
    b.scale(dpr, dpr);
    this.drawBg(b);
  }

  private drawBg(c: CanvasRenderingContext2D) {
    const s = this.size, r = s / 2;
    const k = (r - 4) / WORLD_RADIUS;
    c.save();
    c.translate(r, r);
    c.beginPath(); c.arc(0, 0, r - 2, 0, Math.PI * 2); c.clip();
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, ZONES.shallows.color); g.addColorStop(ZONES.shallows.maxR / WORLD_RADIUS, ZONES.reef.color);
    g.addColorStop(ZONES.reef.maxR / WORLD_RADIUS, ZONES.abyss.color); g.addColorStop(1, "#06142c");
    c.fillStyle = g; c.fillRect(-r, -r, s, s);
    c.setLineDash([3, 3]);
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1;
    for (const z of [ZONES.shallows.maxR, ZONES.reef.maxR]) { c.beginPath(); c.arc(0, 0, z * k, 0, Math.PI * 2); c.stroke(); }
    c.setLineDash([]);
    for (const isl of ISLANDS) {
      c.fillStyle = "#f0d79b"; c.beginPath(); c.arc(isl.x * k, isl.z * k, Math.max(2.5, isl.r * k), 0, Math.PI * 2); c.fill();
      c.fillStyle = "#6cc24a"; c.beginPath(); c.arc(isl.x * k, isl.z * k, Math.max(1.5, isl.r * k * 0.6), 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = "#ddd"; c.beginPath(); c.arc(LIGHTHOUSE_POS.x * k, LIGHTHOUSE_POS.z * k, 2, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  update(dt: number, players: PlayerS[], meId: string, monsters: MonsterS[], me: { x: number; z: number; rot: number } | null, lockedR?: number, extras?: { x: number; z: number; icon: string; color: string; pulse?: boolean }[]) {
    this.t += dt;
    const c = this.ctx, s = this.size, r = s / 2;
    c.clearRect(0, 0, s, s);
    const zoom = this.zoomed ? 3 : 1;
    const k = ((r - 4) / WORLD_RADIUS) * zoom;
    const cx = this.zoomed && me ? me.x : 0, cz = this.zoomed && me ? me.z : 0;
    c.save();
    c.beginPath(); c.arc(r, r, r - 2, 0, Math.PI * 2); c.clip();
    if (this.zoomed) {
      c.save();
      c.translate(r, r); c.scale(zoom, zoom); c.translate(-r - cx * ((r - 4) / WORLD_RADIUS), -r - cz * ((r - 4) / WORLD_RADIUS));
      c.drawImage(this.bg, 0, 0, s, s);
      c.restore();
    } else c.drawImage(this.bg, 0, 0, s, s);
    const tx = (x: number) => r + (x - cx) * k, tz = (z: number) => r + (z - cz) * k;
    if (lockedR) {
      // shade locked zones (everything beyond the barrier)
      c.save();
      c.beginPath(); c.rect(0, 0, s, s); c.arc(tx(DOCK_POS.x), tz(DOCK_POS.z), lockedR * k, 0, Math.PI * 2, true);
      c.fillStyle = "rgba(10,10,20,0.62)"; c.fill();
      c.strokeStyle = "#ff3b30"; c.lineWidth = 2; c.setLineDash([4, 3]);
      c.beginPath(); c.arc(tx(DOCK_POS.x), tz(DOCK_POS.z), lockedR * k, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    // dock ring
    c.strokeStyle = "#ffd76a"; c.lineWidth = 2;
    c.beginPath(); c.arc(tx(DOCK_POS.x), tz(DOCK_POS.z), Math.max(3, DOCK_RADIUS * k), 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#ffd76a"; c.font = "bold 9px system-ui"; c.textAlign = "center"; c.fillText("⚓", tx(DOCK_POS.x), tz(DOCK_POS.z) + 3);
    // solo: landmarks, markers, pickups, NPC boats
    for (const e of extras ?? []) {
      const pr = e.pulse ? 1 + Math.sin(this.t * 5) * 0.25 : 1;
      if (e.pulse) { c.fillStyle = e.color + "55"; c.beginPath(); c.arc(tx(e.x), tz(e.z), 6 * pr, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = e.color; c.font = `${e.icon === "•" ? 16 : 10}px system-ui`; c.textAlign = "center";
      c.fillText(e.icon, tx(e.x), tz(e.z) + (e.icon === "•" ? 5 : 4));
    }
    // monsters
    for (const m of monsters) {
      if (m.state === "submerged") continue;
      const pulse = 1 + Math.sin(this.t * 6) * 0.15;
      c.fillStyle = "rgba(255,40,40,0.35)";
      c.beginPath(); c.arc(tx(m.x), tz(m.z), 7 * pulse, 0, Math.PI * 2); c.fill();
      c.font = `${m.kind === "kraken" ? 14 : 11}px system-ui`;
      c.fillStyle = "#ff4040";
      c.fillText("☠", tx(m.x), tz(m.z) + 4);
    }
    // players
    for (const p of players) {
      if (p.sunk) continue;
      const isMe = p.id === meId;
      const pos = isMe && me ? me : p;
      const col = SQUADS[p.squad]?.color ?? "#fff";
      c.save();
      c.translate(tx(pos.x), tz(pos.z));
      // map up = -Z: world heading (sin a, cos a) -> screen (sin a, cos a)
      c.rotate(Math.PI - pos.rot);
      c.fillStyle = col;
      c.strokeStyle = isMe ? "#fff" : "rgba(0,0,0,0.6)";
      c.lineWidth = isMe ? 2 : 1;
      const sz = isMe ? 6 : 4.5;
      c.beginPath(); c.moveTo(0, -sz * 1.3); c.lineTo(sz, sz); c.lineTo(0, sz * 0.5); c.lineTo(-sz, sz); c.closePath();
      c.fill(); c.stroke();
      c.restore();
    }
    c.restore();
    c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 2;
    c.beginPath(); c.arc(r, r, r - 2, 0, Math.PI * 2); c.stroke();
  }
}
