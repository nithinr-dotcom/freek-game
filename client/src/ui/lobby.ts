/** Lobby overlay: name + mode cards (Single Player campaign / Multiplayer create, join, room list). */
import { listRooms, createRoom, joinByCode, type RoomListing } from "../net";
import type { GameNet } from "../game/types";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";
import { CHAPTERS, levelFromXp } from "@freek/shared";
import { loadSave } from "../solo/save";
import { confirmModal } from "./modal";
import { chapterSelect } from "./chapterScreens";
import { MARLOW_SVG } from "./dialogue";

const NAME_KEY = "tb_name";

export type SoloAction = { type: "continue" } | { type: "new"; name: string } | { type: "chapter"; id: number };

export class Lobby {
  readonly el: HTMLElement;
  private nameInput: HTMLInputElement;
  private codeInput: HTMLInputElement;
  private list: HTMLElement;
  private err: HTMLElement;
  private privateToggle: HTMLInputElement;
  private mpCard: HTMLElement;
  private statusDot: HTMLElement;
  private statusText: HTMLElement;
  private busy = false;
  private refreshTimer = 0;

  constructor(private root: HTMLElement, private onJoined: (net: GameNet) => void, private onSolo: (a: SoloAction) => void) {
    const saved = localStorage.getItem(NAME_KEY) ?? loadSave()?.name ?? "";
    this.nameInput = h("input.tb-input", { type: "text", maxlength: 16, placeholder: "Captain name", value: saved, autocomplete: "off", spellcheck: "false" }) as HTMLInputElement;
    this.nameInput.value = saved;
    this.codeInput = h("input.tb-input.code-input", { type: "text", maxlength: 5, placeholder: "CODE", autocomplete: "off", spellcheck: "false" }) as HTMLInputElement;
    this.codeInput.addEventListener("input", () => { this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
    this.codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") this.join(this.codeInput.value); });
    this.privateToggle = h("input", { type: "checkbox" }) as HTMLInputElement;
    this.list = h("div.room-list");
    this.err = h("div.lobby-error");
    this.statusDot = h("span.status-dot");
    this.statusText = h("span.status-text", null, "checking server…");

    const createBtn = h("button.tb-btn.primary", { onclick: () => this.create() }, "⚓ Create Room");
    const joinBtn = h("button.tb-btn", { onclick: () => this.join(this.codeInput.value) }, "Join");
    const refreshBtn = h("button.tb-btn.ghost.small", { onclick: () => this.refresh(), title: "Refresh" }, "↻ Refresh");

    this.mpCard = h("div.mode-card.mp-card", null,
      h("div.mode-head", null, h("span.mode-icon", null, "⛵"), h("div", null, h("div.mode-kicker", null, "MULTIPLAYER"), h("div.mode-title", null, "Crew up")), h("div.server-status", null, this.statusDot, this.statusText)),
      h("div.mp-offline-hint", { html: "The game server is unreachable. Start it with <code>npm run dev:server</code>, or play <b>Single Player</b> meanwhile." }),
      h("div.mp-body", null,
        h("div.mp-row", null,
          h("div.mp-col", null,
            h("h3", null, "Start a crew"),
            h("label.toggle", null, this.privateToggle, h("span.track", null, h("span.knob")), h("span.toggle-label", null, "Private room")),
            createBtn,
          ),
          h("div.mp-col", null,
            h("h3", null, "Join by code"),
            h("div.join-row", null, this.codeInput, joinBtn),
            h("p.hint", null, "5 characters, e.g. K7QX2"),
          ),
        ),
        h("div.rooms-head", null, h("h3", null, "Open seas"), refreshBtn),
        this.list,
      ),
    );

    this.el = h("div.lobby",
      null,
      h("div.lobby-bg"),
      h("div.lobby-inner", null,
        h("div.title-wrap", null,
          h("h1.game-title", { html: "TIDE<span>BREAKERS</span>" }),
          h("div.subtitle", null, "Cast. Reel. Brave the Abyss."),
        ),
        h("div.lobby-card.name-card", null,
          h("label.lbl", null, "Your name"),
          this.nameInput,
        ),
        h("div.mode-grid", null, this.soloCard(), this.mpCard),
        this.err,
        h("div.lobby-foot", null, h("span", null, "Press H in game for controls")),
      ),
    );
    root.append(this.el);
    this.refresh();
    this.refreshTimer = window.setInterval(() => this.refresh(), 6000);
    setTimeout(() => (saved ? null : this.nameInput)?.focus(), 300);
  }

  private soloCard(): HTMLElement {
    const save = loadSave();
    const total = save ? Object.values(save.stars).reduce((a, b) => a + b, 0) : 0;
    const ch = save ? CHAPTERS.find((c) => c.id === save.chapter) : undefined;
    const progress = save
      ? `<div class="solo-progress"><div class="sp-chapter">${ch ? `Chapter ${ch.id}: ${escapeHtml(ch.title)}` : "Campaign complete · Free Play"}</div>
         <div class="sp-meta"><span>Lv ${levelFromXp(save.xp).level}</span><span>★ ${total}/${CHAPTERS.length * 3}</span><span>${escapeHtml(save.name)}</span></div>
         <div class="sp-bar"><i style="width:${Math.min(100, ((save.chapter - 1) / CHAPTERS.length) * 100)}%"></i></div></div>`
      : `<div class="solo-progress fresh">Old Marlow, the lighthouse keeper, needs a new sailor. Six chapters, one legend.</div>`;
    const buttons: HTMLElement[] = [];
    if (save) {
      buttons.push(h("button.tb-btn.primary.big", { onclick: () => { sfx.unlock(); this.soloGo({ type: "continue" }); } }, "▶ Continue"));
      buttons.push(h("button.tb-btn", { onclick: () => this.newGame(true) }, "New Game"));
      buttons.push(h("button.tb-btn.ghost", { onclick: () => chapterSelect(this.root, save, (id) => this.soloGo({ type: "chapter", id })) }, "Chapters"));
    } else {
      buttons.push(h("button.tb-btn.primary.big", { onclick: () => this.newGame(false) }, "▶ New Game"));
    }
    return h("div.mode-card.solo-card", null,
      h("div.mode-head", null, h("span.mode-portrait", { html: MARLOW_SVG }), h("div", null, h("div.mode-kicker", null, "SINGLE PLAYER"), h("div.mode-title", null, "Campaign"))),
      h("div", { html: progress }),
      h("div.solo-buttons", null, ...buttons),
      h("p.hint", null, "No server needed · progress saves in this browser"),
    );
  }

  private async newGame(hasSave: boolean) {
    sfx.unlock();
    const name = this.requireName();
    if (!name) return;
    if (hasSave) {
      const ok = await confirmModal(this.root, "Start a new game?", "Your campaign progress, trophies and solo Hall of Fame in this browser will be <b>erased</b>. This can't be undone.", "Erase & start", true);
      if (!ok) return;
    }
    this.soloGo({ type: "new", name });
  }

  private soloGo(a: SoloAction) {
    if (a.type !== "new") { const n = this.name; if (n) localStorage.setItem(NAME_KEY, n); }
    clearInterval(this.refreshTimer);
    this.el.classList.add("leaving");
    setTimeout(() => this.el.remove(), 600);
    this.onSolo(a);
  }

  private get name(): string {
    const n = this.nameInput.value.trim().slice(0, 16);
    return n;
  }
  private requireName(): string | null {
    const n = this.name;
    if (!n) {
      this.showError("Pick a name first, captain.");
      this.nameInput.classList.add("shake");
      setTimeout(() => this.nameInput.classList.remove("shake"), 500);
      this.nameInput.focus();
      return null;
    }
    localStorage.setItem(NAME_KEY, n);
    return n;
  }
  private showError(msg: string) {
    this.err.textContent = msg;
    this.err.classList.remove("show");
    void this.err.offsetWidth;
    this.err.classList.add("show");
  }

  async refresh() {
    try {
      const rooms = await listRooms();
      this.setOnline(true);
      this.renderRooms(rooms);
    } catch {
      this.setOnline(false);
      this.list.innerHTML = `<div class="room-empty">Can't reach the harbour master.</div>`;
    }
  }

  private setOnline(on: boolean) {
    this.mpCard.classList.toggle("offline", !on);
    this.statusDot.classList.toggle("on", on);
    this.statusText.textContent = on ? "server online" : "server offline";
  }

  private renderRooms(rooms: RoomListing[]) {
    if (!rooms.length) {
      this.list.innerHTML = `<div class="room-empty">No public crews out at sea. Create one!</div>`;
      return;
    }
    this.list.innerHTML = "";
    rooms.forEach((r, i) => {
      const full = r.clients >= r.maxClients;
      const row = h("button.room-row", { style: `animation-delay:${i * 40}ms`, disabled: full, onclick: () => this.join(r.code || r.roomId) },
        h("span.room-code", null, r.code || r.roomId),
        h("span.room-host", { html: `${escapeHtml(r.hostName)}'s crew` }),
        h("span.room-count", null, `${r.clients}/${r.maxClients}`),
        h("span.room-join", null, full ? "Full" : "Join →"),
      );
      this.list.append(row);
    });
  }

  private async create() {
    sfx.unlock();
    if (this.busy) return;
    const name = this.requireName();
    if (!name) return;
    this.setBusy(true, "Launching boat…");
    try {
      const net = await createRoom(name, this.privateToggle.checked);
      this.done(net);
    } catch (e) {
      this.showError(`Could not create room: ${(e as Error)?.message ?? e}`);
      this.setBusy(false);
    }
  }

  private async join(code: string) {
    sfx.unlock();
    if (this.busy) return;
    const name = this.requireName();
    if (!name) return;
    code = code.trim().toUpperCase();
    if (code.length !== 5) { this.showError("Room codes are 5 characters."); return; }
    this.setBusy(true, `Sailing to ${code}…`);
    try {
      const net = await joinByCode(code, name);
      this.done(net);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      this.showError(/not found|invalid|locked/i.test(msg) ? `Room ${code} not found or full.` : `Could not join: ${msg}`);
      this.setBusy(false);
    }
  }

  private setBusy(b: boolean, text = "") {
    this.busy = b;
    this.el.classList.toggle("busy", b);
    this.el.dataset.busy = text;
  }

  private done(net: GameNet) {
    clearInterval(this.refreshTimer);
    this.el.classList.add("leaving");
    setTimeout(() => this.el.remove(), 600);
    this.onJoined(net);
  }
}
