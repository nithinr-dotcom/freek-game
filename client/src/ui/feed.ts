/** Announcement feed (top centre), big banners (missions), level-up celebration, small toasts. */
import { h, escapeHtml } from "../util";

export class Feed {
  private feed: HTMLElement;
  private banners: HTMLElement;
  private toasts: HTMLElement;
  private levelEl: HTMLElement;
  private flashEl: HTMLElement;

  constructor(root: HTMLElement) {
    this.feed = h("div.feed");
    this.banners = h("div.banners");
    this.toasts = h("div.toasts");
    this.levelEl = h("div.levelup");
    this.flashEl = h("div.screen-flash");
    root.append(this.flashEl, this.feed, this.banners, this.toasts, this.levelEl);
  }

  announce(text: string, color = "#ffffff", icon = "📣", important = false) {
    const el = h("div.feed-item", { style: `--c:${color}` }, h("span.fi-icon", null, icon), h("span.fi-text", { html: escapeHtml(text) }));
    if (important) el.classList.add("important");
    this.feed.prepend(el);
    while (this.feed.children.length > 5) this.feed.lastElementChild?.remove();
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 500); }, important ? 7000 : 5000);
  }

  toast(html: string, cls = "", ms = 2600) {
    const el = h("div.toast", { html });
    if (cls) el.classList.add(...cls.split(" "));
    this.toasts.append(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, ms);
  }

  missionBanner(title: string, xp: number, coins: number, squad: boolean) {
    const el = h("div.mission-banner", { html: `
      <div class="mb-burst"></div>
      <div class="mb-label">${squad ? "SQUAD MISSION COMPLETE" : "MISSION COMPLETE"}</div>
      <div class="mb-title">${escapeHtml(title)}</div>
      <div class="mb-rewards"><span class="xp">+${xp} XP</span><span class="coins">+${coins} ●</span></div>` });
    if (squad) el.classList.add("squad");
    this.banners.append(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 600); }, 3600);
  }

  levelUp(level: number) {
    this.levelEl.innerHTML = `
      <div class="lu-rays"></div>
      <div class="lu-content">
        <div class="lu-label">LEVEL UP!</div>
        <div class="lu-num">${level}</div>
        <div class="lu-sub">Your rod grows stronger · better rare odds · wider catch bar</div>
      </div>`;
    this.levelEl.classList.remove("show");
    void this.levelEl.offsetWidth;
    this.levelEl.classList.add("show");
    setTimeout(() => this.levelEl.classList.remove("show"), 3400);
  }

  flash(color: string, strength = 0.6) {
    this.flashEl.style.setProperty("--fc", color);
    this.flashEl.style.setProperty("--fs", String(strength));
    this.flashEl.classList.remove("go");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("go");
  }
}
