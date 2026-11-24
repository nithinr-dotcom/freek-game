/**
 * Local fishing state machine:
 * idle -> charging (hold) -> casting (sent `cast`) -> waiting (server state) -> bite (msg) -> hooking (sent `hook`)
 * -> reeling (hookResult ok, minigame) -> landing (sent `reelResult`) -> idle (catch / lineSnap).
 */
import type { PlayerS, S2C, Tier } from "@freek/shared";
import type { GameNet } from "./types";
import type { Hud } from "../ui/hud";
import type { ReelGame, ReelMods } from "../ui/reel";
import { sfx } from "../audio";

export type FishPhase = "idle" | "charging" | "casting" | "waiting" | "bite" | "hooking" | "reeling" | "landing";

export class Fishing {
  phase: FishPhase = "idle";
  power = 0;
  private chargeT = 0;
  private phaseT = 0;
  private biteWindow = 0;
  private reelSendT = 0;
  onBite: (() => void) | null = null;
  onCast: (() => void) | null = null;
  /** solo campaign: behaviour + gear modifiers for the fish just hooked */
  modsProvider: (() => ReelMods | null) | null = null;
  /** Endless: a reason the hand line can't be used right now (null = allowed) */
  blocked: (() => string | null) | null = null;

  constructor(private net: GameNet, private hud: Hud, private reel: ReelGame) {
    net.on("bite", (p) => this.bite(p));
    net.on("hookResult", (p) => this.hookResult(p));
    net.on("lineSnap", () => {
      if (this.phase === "landing" || this.phase === "reeling") { this.reel.stop(); }
      sfx.snap();
      this.hud.showPrompt("SNAP! The line broke…", "bad", 2);
      this.setPhase("idle");
    });
    net.on("catch", () => { this.setPhase("idle"); });
  }

  private setPhase(p: FishPhase) { this.phase = p; this.phaseT = 0; if (p !== "charging") this.hud.setPower(null); }

  get busy() { return this.phase !== "idle"; }
  get reeling() { return this.phase === "reeling"; }

  /** primary pressed (Space / left click) */
  primaryDown(me: PlayerS | undefined) {
    if (!me || me.sunk) return;
    if (this.phase === "idle") {
      if (me.state === "stunned") { this.hud.showPrompt("Stunned! Can't fish right now.", "bad", 1.5); return; }
      if (me.state !== "sailing") return;
      const why = this.blocked?.();
      if (why) { this.hud.showPrompt(why, "bad", 1.6); return; }
      this.setPhase("charging");
      this.chargeT = 0;
      this.power = 0;
    } else if (this.phase === "bite") {
      this.setPhase("hooking");
      this.hud.hidePrompt();
      sfx.hook();
      this.net.send("hook", {});
    }
  }
  /** primary released; aimRad = heading to cast toward */
  primaryUp(aimRad: number) {
    if (this.phase !== "charging") return;
    const power = Math.max(0.08, this.power);
    this.setPhase("casting");
    sfx.cast();
    this.onCast?.();
    this.net.send("cast", { power, aimRad });
  }
  /** abort a charge without casting (mouse press became a camera drag) */
  cancelCharge() { if (this.phase === "charging") this.setPhase("idle"); }
  cancel() {
    if (this.phase === "idle") return;
    if (this.phase !== "charging") this.net.send("cancelFishing", {});
    this.reel.stop();
    this.hud.hidePrompt();
    this.setPhase("idle");
  }
  /** something external (sinking) forces a reset */
  reset() { this.reel.stop(); this.hud.hidePrompt(); this.setPhase("idle"); }

  private bite(p: S2C["bite"]) {
    if (this.phase !== "waiting" && this.phase !== "casting") return;
    this.setPhase("bite");
    this.biteWindow = (p.windowMs || 900) / 1000;
    sfx.bite();
    this.onBite?.();
    this.hud.showPrompt(`<span class="hook-big">HOOK!</span><span class="hook-key">SPACE / CLICK</span>`, "hook");
  }

  private hookResult(p: S2C["hookResult"]) {
    if (!p.ok) {
      this.hud.showPrompt(this.phase === "bite" ? "Too slow — it got away!" : "It got away…", "bad", 1.8);
      sfx.fail();
      this.setPhase("idle");
      return;
    }
    this.setPhase("reeling");
    this.hud.hidePrompt();
    this.reelLevel = this.level;
    this.reel.start(p.tier as Tier | undefined, p.difficulty ?? 0.4, p.durationMs ?? 6000, this.reelLevel, (r) => {
      this.net.send("reelResult", { success: r.success, maxTension: r.maxTension });
      if (r.success) { this.setPhase("landing"); this.hud.showPrompt("Landing…", "", 1.5); }
      else { this.setPhase("landing"); }
    }, this.modsProvider?.() ?? null);
  }
  private reelLevel = 1;
  private desyncT = 0;
  level = 1;

  update(dt: number, me: PlayerS | undefined, held: boolean, gust: number) {
    this.phaseT += dt;
    if (!me) return;
    if (me.sunk && this.phase !== "idle") { this.reset(); return; }
    switch (this.phase) {
      case "charging": {
        if (!held) { /* release handled by primaryUp */ }
        this.chargeT += dt;
        // ping-pong 0..1 over 1.2 s
        const c = (this.chargeT / 1.2) % 2;
        this.power = c < 1 ? c : 2 - c;
        this.hud.setPower(this.power);
        break;
      }
      case "casting":
        if (me.state === "waiting" || me.state === "hooked") this.setPhase("waiting");
        else if (this.phaseT > 4) this.setPhase("idle");
        break;
      case "waiting":
        if (me.state === "sailing" && this.phaseT > 1) this.setPhase("idle");
        break;
      case "bite":
        this.biteWindow -= dt;
        if (this.biteWindow < -1.5) { this.hud.hidePrompt(); this.setPhase("idle"); }
        break;
      case "hooking":
        if (this.phaseT > 4) this.setPhase("idle");
        break;
      case "reeling":
        this.reel.update(dt, held, gust);
        this.reelSendT -= dt;
        if (this.reelSendT <= 0 && this.reel.active) {
          this.reelSendT = 0.2;
          this.net.send("reel", { tension: this.reel.tension, progress: Math.max(0, Math.min(1, this.reel.progress)) });
        }
        break;
      case "landing":
        if (this.phaseT > 5) this.setPhase("idle");
        break;
    }
    // if the server put us back to sailing while we think we're fishing (cancelled server-side)
    if ((this.phase === "waiting") && me.state === "stunned") this.setPhase("idle");
    // recover from a desync: we're idle but the server still thinks we're fishing
    if (this.phase === "idle" && me.state !== "sailing" && me.state !== "stunned" && !me.sunk) {
      this.desyncT += dt;
      if (this.desyncT > 3) { this.desyncT = 0; this.net.send("cancelFishing", {}); }
    } else this.desyncT = 0;
  }
}
