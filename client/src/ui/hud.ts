/** Main HUD: player panel, room code, catch bag, wind compass, storm timer, zone text, meters, prompts, vignette. */
import { SQUADS, ZONES, BOAT_MAX_HP, HARPOON_COOLDOWN_MS, levelFromXp, xpForLevel, TIER_INFO, tierRank, type PlayerS, type WindS, type ZoneId } from "@freek/shared";
import { h, escapeHtml } from "../util";

function setText(el: HTMLElement, s: string) { if (el.textContent !== s) el.textContent = s; }

export class Hud {
  readonly el: HTMLElement;
  private hpFill: HTMLElement; private hpText: HTMLElement; private hpLag: HTMLElement;
  private lvl: HTMLElement; private xpFill: HTMLElement; private xpText: HTMLElement;
  private coins: HTMLElement; private nameEl: HTMLElement;
  private codeEl: HTMLElement;
  private squadBtn: HTMLElement;
  private bag: HTMLElement; private bagCount: HTMLElement; private bagPts: HTMLElement; private bagHint: HTMLElement;
  private windArrow: HTMLElement; private windSpeed: HTMLElement; private windGust: HTMLElement; private compassRose: HTMLElement;
  private storm: HTMLElement; private stormText: HTMLElement;
  private zoneBanner: HTMLElement;
  private power: HTMLElement; private powerFill: HTMLElement;
  private prompt: HTMLElement;
  private cooldown: HTMLElement; private cdRing: SVGCircleElement;
  private vignette: HTMLElement;
  private sunkOverlay: HTMLElement; private sunkCount: HTMLElement;
  private crosshair: HTMLElement;
  private statusLine: HTMLElement;
  private hint: HTMLElement;
  private boss: HTMLElement; private bossFill: HTMLElement; private bossName: HTMLElement; private bossHp: HTMLElement;
  private codeLbl!: HTMLElement;
  private lastHp = -1;
  private lastLevel = -1;
  private lastZone: ZoneId | "" = "";
  private promptTimer = 0;
  private hpLagValue = 100;
  onSquadClick: (() => void) | null = null;
  onHelp: (() => void) | null = null;
  onBoard: (() => void) | null = null;
  onMute: (() => boolean) | null = null;
  onSettings: (() => void) | null = null;
  /** solo: hull HP and harpoon cooldown come from gear (multiplayer keeps the constants) */
  maxHp = BOAT_MAX_HP;
  cooldownMs = HARPOON_COOLDOWN_MS;
  private bossPips: HTMLElement;

  constructor(root: HTMLElement) {
    this.hpFill = h("div.bar-fill.hp"); this.hpLag = h("div.bar-lag"); this.hpText = h("div.bar-text");
    this.lvl = h("div.lvl-badge", null, "1");
    this.xpFill = h("div.bar-fill.xp"); this.xpText = h("div.bar-text.small");
    this.coins = h("span.coins", null, "0");
    this.nameEl = h("div.p-name");
    this.codeEl = h("span.code-val", null, "-----");
    this.squadBtn = h("button.squad-btn", { onclick: () => this.onSquadClick?.(), title: "Change squad" }, "Squad");
    this.bagCount = h("span.bag-count", null, "0");
    this.bagPts = h("span.bag-pts", null, "0");
    this.bagHint = h("div.bag-hint", null, "Bank at the dock!");
    this.bag = h("div.panel.bag", null, h("div.bag-icon", { html: fishSvg("#ffd24a") }), h("div.bag-body", null, h("div.bag-line", null, this.bagCount, h("span.muted", null, " fish · "), this.bagPts, h("span.muted", null, " pts")), h("div.bag-sub", null, "unbanked catch")), this.bagHint);
    this.compassRose = h("div.compass-rose", { html: `<span class="n">N</span><span class="e">E</span><span class="s">S</span><span class="w">W</span>` });
    this.windArrow = h("div.wind-arrow", { html: `<svg viewBox="0 0 40 40"><path d="M20 3 L28 22 L21 19 L21 37 L19 37 L19 19 L12 22 Z" fill="currentColor"/></svg>` });
    this.windSpeed = h("div.wind-speed");
    this.windGust = h("div.wind-gust", null, "GUST!");
    this.stormText = h("span.storm-text");
    this.storm = h("div.panel.storm", null, h("span.storm-icon", null, "⛈"), this.stormText);
    this.zoneBanner = h("div.zone-banner");
    this.powerFill = h("div.power-fill");
    this.power = h("div.power-meter", null, h("div.power-label", null, "CAST"), h("div.power-track", null, this.powerFill, h("div.power-sweet")));
    this.prompt = h("div.prompt");
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 44 44");
    const bg = document.createElementNS(svgNS, "circle");
    bg.setAttribute("cx", "22"); bg.setAttribute("cy", "22"); bg.setAttribute("r", "19"); bg.setAttribute("class", "cd-bg");
    this.cdRing = document.createElementNS(svgNS, "circle");
    this.cdRing.setAttribute("cx", "22"); this.cdRing.setAttribute("cy", "22"); this.cdRing.setAttribute("r", "19"); this.cdRing.setAttribute("class", "cd-ring");
    svg.append(bg, this.cdRing);
    this.cooldown = h("div.cooldown", null, svg, h("span.cd-icon", null, "🔱"), h("span.cd-key", null, "F"));
    this.crosshair = h("div.crosshair");
    this.vignette = h("div.vignette");
    this.sunkCount = h("div.sunk-count");
    this.sunkOverlay = h("div.sunk-overlay", null, h("div.sunk-title", null, "SUNK!"), h("div.sunk-sub", null, "Your unbanked catch is lost to the deep…"), this.sunkCount);
    this.statusLine = h("div.status-line");
    this.hint = h("div.tutorial-hint");
    this.bossFill = h("div.boss-fill"); this.bossName = h("div.boss-name"); this.bossHp = h("div.boss-hp");
    this.bossPips = h("div.boss-pips");
    this.boss = h("div.boss-bar", null, this.bossName, h("div.boss-track", null, this.bossFill, this.bossPips, this.bossHp));
    this.codeLbl = h("span.code-lbl", null, "ROOM");

    const muteBtn = h("button.icon-btn", { title: "Mute (M)", onclick: () => { const m = this.onMute?.(); muteBtn.textContent = m ? "🔇" : "🔊"; } }, localStorage.getItem("tb_muted") === "1" ? "🔇" : "🔊");
    this.el = h("div.hud", null,
      h("div.panel.player", null,
        h("div.p-top", null, this.lvl, h("div.p-info", null, this.nameEl, h("div.bar.xp-bar", null, this.xpFill, this.xpText))),
        h("div.bar.hp-bar", null, this.hpLag, this.hpFill, this.hpText),
        h("div.p-bottom", null, h("span.coin-icon", null, "●"), this.coins, this.squadBtn),
      ),
      h("div.panel.room-code", null,
        this.codeLbl, this.codeEl,
        h("button.icon-btn.copy", { title: "Copy room code", onclick: (e: MouseEvent) => this.copyCode(e.currentTarget as HTMLElement) }, "⧉"),
      ),
      h("div.top-buttons", null,
        h("button.icon-btn", { title: "Leaderboard (Tab)", onclick: () => this.onBoard?.() }, "🏆"),
        h("button.icon-btn", { title: "Controls (H)", onclick: () => this.onHelp?.() }, "?"),
        h("button.icon-btn", { title: "Settings", onclick: () => this.onSettings?.() }, "⚙"),
        muteBtn,
      ),
      this.bag,
      h("div.panel.wind", null, h("div.compass", null, this.compassRose, this.windArrow), h("div.wind-info", null, h("div.wind-lbl", null, "WIND"), this.windSpeed, this.windGust)),
      this.storm,
      this.zoneBanner,
      this.power,
      this.prompt,
      this.cooldown,
      this.statusLine,
      this.hint,
      this.boss,
    );
    root.append(this.vignette, this.crosshair, this.el, this.sunkOverlay);
  }

  private copyCode(btn: HTMLElement) {
    const code = this.codeEl.textContent ?? "";
    const done = () => { btn.classList.add("copied"); btn.textContent = "✓"; setTimeout(() => { btn.classList.remove("copied"); btn.textContent = "⧉"; }, 1200); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done, () => fallbackCopy(code, done));
    else fallbackCopy(code, done);
  }

  setRoom(code: string, isPrivate: boolean) {
    setText(this.codeEl, code);
    this.codeEl.parentElement!.classList.toggle("private", isPrivate);
  }

  update(dt: number, me: PlayerS | undefined, wind: WindS | undefined, storm: { on: boolean; secondsLeft: number; nextIn: number }, cooldownLeft: number) {
    if (me) {
      setText(this.nameEl, me.name || "Sailor");
      const sq = SQUADS[me.squad];
      if (sq) {
        setText(this.squadBtn, sq.name);
        this.squadBtn.style.setProperty("--sq", sq.color);
      }
      // hp
      const hp = Math.max(0, me.hp);
      const MAX = this.maxHp;
      const k = hp / MAX;
      this.hpFill.style.width = `${k * 100}%`;
      this.hpFill.classList.toggle("low", k < 0.3);
      this.hpLagValue = Math.max(hp, this.hpLagValue - dt * 30);
      this.hpLag.style.width = `${(this.hpLagValue / MAX) * 100}%`;
      setText(this.hpText, `${Math.ceil(hp)} / ${MAX}`);
      if (this.lastHp >= 0 && hp < this.lastHp) { this.hpFill.parentElement!.classList.remove("hit"); void this.hpFill.offsetWidth; this.hpFill.parentElement!.classList.add("hit"); }
      if (hp > this.lastHp) this.hpLagValue = hp;
      this.lastHp = hp;
      // xp (xp treated as total xp; falls back to "xp into level" if inconsistent with level)
      let into = me.xp, need = xpForLevel(me.level || 1);
      const lf = levelFromXp(me.xp);
      if (lf.level === me.level) { into = lf.into; need = lf.need; }
      this.xpFill.style.width = `${Math.min(100, (into / Math.max(1, need)) * 100)}%`;
      setText(this.xpText, `${Math.floor(into)} / ${need} XP`);
      setText(this.lvl, String(me.level || 1));
      if (this.lastLevel > 0 && me.level > this.lastLevel) { this.lvl.classList.remove("pop"); void this.lvl.offsetWidth; this.lvl.classList.add("pop"); }
      this.lastLevel = me.level;
      setText(this.coins, String(me.coins));
      // bag
      const fish = me.unbanked ? Array.from(me.unbanked) : [];
      setText(this.bagCount, String(fish.length));
      setText(this.bagPts, String(me.unbankedPoints));
      const best = fish.reduce((a, f) => Math.max(a, tierRank(f.tier)), -1);
      this.bag.classList.toggle("has", fish.length > 0);
      this.bag.classList.toggle("precious", best >= tierRank("epic"));
      if (best >= 0) this.bag.style.setProperty("--tier", TIER_INFO[fish.find((f) => tierRank(f.tier) === best)!.tier].color);
      // sunk
      this.sunkOverlay.classList.toggle("show", me.sunk);
    }
    if (wind) {
      this.windArrow.style.transform = `rotate(${180 - (wind.dirRad * 180) / Math.PI}deg)`; // map: up = -Z
      const knots = Math.round(wind.speed * 30);
      setText(this.windSpeed, `${knots} kn`);
      this.windGust.classList.toggle("show", !!wind.gust);
      this.windArrow.classList.toggle("gust", !!wind.gust);
    }
    this.storm.classList.toggle("active", storm.on);
    const secs = Math.max(0, Math.round(storm.on ? storm.secondsLeft : storm.nextIn));
    const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    setText(this.stormText, storm.on ? `STORM · ${mmss}` : storm.nextIn > 0 && storm.nextIn < 86400 ? `Storm in ${mmss}` : "Calm seas");
    // harpoon cooldown
    const cdk = Math.max(0, Math.min(1, cooldownLeft / this.cooldownMs));
    const circ = 2 * Math.PI * 19;
    this.cdRing.style.strokeDasharray = `${circ}`;
    this.cdRing.style.strokeDashoffset = `${circ * cdk}`;
    this.cooldown.classList.toggle("ready", cdk <= 0);
    if (this.promptTimer > 0) { this.promptTimer -= dt; if (this.promptTimer <= 0) this.prompt.classList.remove("show"); }
  }

  /** zone name big fade text */
  zone(z: ZoneId) {
    if (z === this.lastZone) return;
    const first = this.lastZone === "";
    this.lastZone = z;
    const info = ZONES[z];
    const sub = z === "shallows" ? "Calm waters · common catches" : z === "reef" ? "Coral islands · rare & gold" : "Dark water · legends & monsters";
    this.zoneBanner.innerHTML = `<div class="zb-name">${info.name.toUpperCase()}</div><div class="zb-sub">${sub}</div>`;
    this.zoneBanner.style.setProperty("--zc", z === "abyss" ? "#7a8cff" : info.color);
    this.zoneBanner.classList.remove("show");
    void this.zoneBanner.offsetWidth;
    if (!first || true) this.zoneBanner.classList.add("show");
  }

  setPower(v: number | null) {
    this.power.classList.toggle("show", v !== null);
    if (v !== null) this.powerFill.style.height = `${v * 100}%`;
  }

  showPrompt(html: string, cls = "", seconds = 0) {
    this.prompt.className = `prompt show ${cls}`;
    this.prompt.innerHTML = html;
    this.promptTimer = seconds;
  }
  hidePrompt() { this.prompt.classList.remove("show"); this.promptTimer = 0; }

  setSolo(solo: boolean) {
    this.el.classList.toggle("solo", solo);
    this.codeLbl.textContent = solo ? "SOLO" : "ROOM";
    this.codeEl.parentElement!.classList.toggle("solo", solo);
  }
  private hintText = "";
  setHint(text: string) {
    if (text === this.hintText) return;
    this.hintText = text;
    this.hint.innerHTML = text ? `<span class="th-icon">💡</span>${text}` : "";
    this.hint.classList.toggle("show", !!text);
  }
  get bagEl() { return this.bag; }
  /** solo: the room-code panel is replaced by the clock/timer strip */
  setSoloStrip(on: boolean) { this.codeEl.parentElement!.classList.toggle("hidden", on); }
  private pipSig = "";
  setBoss(b: { name: string; hp: number; maxHp: number; pips?: number[]; phase?: number } | null) {
    this.boss.classList.toggle("show", !!b);
    if (!b) return;
    const sig = `${(b.pips ?? []).join(",")}|${b.phase ?? 0}`;
    if (sig !== this.pipSig) {
      this.pipSig = sig;
      this.bossPips.innerHTML = (b.pips ?? []).map((p, i) => `<i class="${(b.phase ?? 0) > i ? "passed" : ""}" style="left:${p * 100}%"></i>`).join("");
      this.boss.classList.remove("phase-pop"); void this.boss.offsetWidth; if ((b.phase ?? 0) > 0) this.boss.classList.add("phase-pop");
    }
    setText(this.bossName, `☠ ${b.name}`);
    this.bossFill.style.width = `${Math.max(0, Math.min(1, b.hp / b.maxHp)) * 100}%`;
    setText(this.bossHp, `${Math.ceil(b.hp)} / ${b.maxHp}`);
  }

  setStatus(text: string) { setText(this.statusLine, text); this.statusLine.classList.toggle("show", !!text); }

  damageFlash(strength = 1) {
    this.vignette.style.setProperty("--vs", String(Math.min(1, 0.5 + strength)));
    this.vignette.classList.remove("hit");
    void this.vignette.offsetWidth;
    this.vignette.classList.add("hit");
  }
  setLowHp(low: boolean) { this.vignette.classList.toggle("low", low); }

  setSunkCountdown(s: number) { setText(this.sunkCount, s > 0 ? `Respawning at the dock in ${Math.ceil(s)}…` : "Respawning…"); }

  setCrosshair(x: number, y: number, visible: boolean) {
    this.crosshair.style.transform = `translate(${x}px, ${y}px)`;
    this.crosshair.style.display = visible ? "" : "none";
  }

  setVisible(v: boolean) { this.el.classList.toggle("hidden", !v); }
}

function fallbackCopy(text: string, done: () => void) {
  const ta = document.createElement("textarea");
  ta.value = text; document.body.append(ta); ta.select();
  try { document.execCommand("copy"); done(); } catch { /* ignore */ }
  ta.remove();
}

export function fishSvg(color: string): string {
  return `<svg viewBox="0 0 64 32" class="fish-svg"><path d="M4 16 C14 2 38 2 50 16 C38 30 14 30 4 16 Z" fill="${color}"/><path d="M48 16 L62 5 L58 16 L62 27 Z" fill="${color}" opacity="0.8"/><circle cx="14" cy="13" r="2.5" fill="#102030"/></svg>`;
}
export { escapeHtml };
