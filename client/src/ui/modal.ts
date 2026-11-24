/** In-page confirm dialog (no window.confirm). */
import { h } from "../util";

export function confirmModal(root: HTMLElement, title: string, body: string, okText = "OK", danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (v: boolean) => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); window.removeEventListener("keydown", onKey, true); resolve(v); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(false); } };
    const el = h("div.overlay.confirm-modal", null, h("div.modal.small", null,
      h("h2", null, title),
      h("p", { html: body }),
      h("div.modal-actions", null,
        h("button.tb-btn.ghost", { onclick: () => close(false) }, "Cancel"),
        h(`button.tb-btn${danger ? ".danger" : ".primary"}`, { onclick: () => close(true) }, okText),
      ),
    ));
    root.append(el);
    window.addEventListener("keydown", onKey, true);
    requestAnimationFrame(() => el.classList.add("show"));
  });
}
