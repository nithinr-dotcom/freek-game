/** Lobby overlay: name, create (public/private), join by code, public room list. */
import { listRooms, createRoom, joinByCode, type RoomListing } from "../net";
import type { GameNet } from "../game/types";
import { h, escapeHtml } from "../util";
import { sfx } from "../audio";

const NAME_KEY = "tb_name";

export class Lobby {
  readonly el: HTMLElement;
  private nameInput: HTMLInputElement;
  private codeInput: HTMLInputElement;
  private list: HTMLElement;
  private err: HTMLElement;
  private privateToggle: HTMLInputElement;
  private busy = false;
  private refreshTimer = 0;

  constructor(private root: HTMLElement, private onJoined: (net: GameNet) => void, private onOffline: () => void) {
    const saved = localStorage.getItem(NAME_KEY) ?? "";
    this.nameInput = h("input.tb-input", { type: "text", maxlength: 16, placeholder: "Captain name", value: saved, autocomplete: "off", spellcheck: "false" }) as HTMLInputElement;
    this.nameInput.value = saved;
    this.codeInput = h("input.tb-input.code-input", { type: "text", maxlength: 5, placeholder: "CODE", autocomplete: "off", spellcheck: "false" }) as HTMLInputElement;
    this.codeInput.addEventListener("input", () => { this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
    this.codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") this.join(this.codeInput.value); });
    this.privateToggle = h("input", { type: "checkbox" }) as HTMLInputElement;
    this.list = h("div.room-list");
    this.err = h("div.lobby-error");

    const createBtn = h("button.tb-btn.primary", { onclick: () => this.create() }, "⚓ Create Room");
    const joinBtn = h("button.tb-btn", { onclick: () => this.join(this.codeInput.value) }, "Join");
    const refreshBtn = h("button.tb-btn.ghost.small", { onclick: () => this.refresh(), title: "Refresh" }, "↻ Refresh");

    this.el = h("div.lobby",
      null,
      h("div.lobby-bg"),
      h("div.lobby-inner", null,
        h("div.title-wrap", null,
          h("h1.game-title", { html: "TIDE<span>BREAKERS</span>" }),
          h("div.subtitle", null, "Cast. Reel. Brave the Abyss — together."),
        ),
        h("div.lobby-card.name-card", null,
          h("label.lbl", null, "Your name"),
          this.nameInput,
        ),
        h("div.lobby-grid", null,
          h("div.lobby-card", null,
            h("h3", null, "Start a crew"),
            h("label.toggle", null, this.privateToggle, h("span.track", null, h("span.knob")), h("span.toggle-label", null, "Private room")),
            h("p.hint", null, "Private rooms are hidden from the list — share the code with friends."),
            createBtn,
          ),
          h("div.lobby-card", null,
            h("h3", null, "Join by code"),
            h("div.join-row", null, this.codeInput, joinBtn),
            h("p.hint", null, "5 characters, e.g. K7QX2"),
          ),
        ),
        h("div.lobby-card.rooms-card", null,
          h("div.rooms-head", null, h("h3", null, "Open seas"), refreshBtn),
          this.list,
        ),
        this.err,
        h("div.lobby-foot", null,
          h("a.offline-link", { href: "?offline=1" }, "Try the offline sandbox"),
          h("span", null, " · Press H in game for controls"),
        ),
      ),
    );
    root.append(this.el);
    this.refresh();
    this.refreshTimer = window.setInterval(() => this.refresh(), 6000);
    setTimeout(() => (saved ? this.codeInput : this.nameInput).focus(), 300);
    void this.onOffline;
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
      this.renderRooms(rooms);
    } catch {
      this.list.innerHTML = `<div class="room-empty">Can't reach the harbour master (server offline?). <br/>You can still try the <a href="?offline=1">offline sandbox</a>.</div>`;
    }
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
