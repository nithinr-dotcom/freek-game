/** Small shared helpers (math, rng, DOM). */
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function dampAngle(a: number, b: number, rate: number, dt: number): number {
  return a + wrapAngle(b - a) * (1 - Math.exp(-rate * dt));
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Iterable/array-like (ArraySchema, MapSchema values, plain arrays) to array. */
export function arr<T>(x: Iterable<T> | ArrayLike<T> | undefined | null): T[] {
  if (!x) return [];
  return Array.from(x as Iterable<T>);
}
/** forEach over Map / MapSchema (both expose forEach(v, k)). */
export function mapEach<V>(m: { forEach(cb: (v: V, k: string) => void): void } | undefined | null, cb: (v: V, k: string) => void) {
  if (m) m.forEach(cb);
}
export function mapGet<V>(m: { get(k: string): V | undefined } | undefined | null, k: string): V | undefined {
  return m ? m.get(k) : undefined;
}

type Attrs = Record<string, string | number | boolean | ((e: any) => void) | undefined>;
/** Tiny hyperscript: h("div.cls#id", {onclick}, children...) */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | string, attrs?: Attrs | null, ...children: (Node | string | null | undefined | false)[]): HTMLElement {
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const tag = (m && m[1]) || "div";
  const el = document.createElement(tag);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) ?? []) {
      if (part[0] === ".") el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (typeof v === "function") (el as any)[k.toLowerCase()] = v;
      else if (k === "style") el.setAttribute("style", String(v));
      else if (k === "html") el.innerHTML = String(v);
      else if (k === "text") el.textContent = String(v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function fmtKg(kg: number): string {
  return kg >= 100 ? `${Math.round(kg)} kg` : `${kg.toFixed(1)} kg`;
}
