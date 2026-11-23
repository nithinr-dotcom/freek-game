/**
 * End-to-end smoke test. Usage: `npm run smoke -w server`
 * Uses an already running server on SMOKE_URL (default http://localhost:2567) if it is up and in DEV_FAST mode,
 * otherwise spawns one with DEV_FAST=1 (and a temp data dir) and kills it afterwards.
 */
import { Client, type Room } from "@colyseus/sdk";
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOM_NAME, DOCK_RADIUS } from "@freek/shared";

const URL_BASE = process.env.SMOKE_URL ?? "http://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond: unknown, label: string) {
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${label}`);
  if (!cond) failures++;
  return !!cond;
}
async function waitFor<T>(fn: () => T | undefined | null | false, ms: number, label: string): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v as T; await sleep(50); }
  console.log(`  (timeout waiting for ${label})`);
  return undefined;
}
/** Collect messages of a type into a queue. */
function inbox(room: Room, type: string) {
  const q: any[] = [];
  room.onMessage(type, (m: any) => q.push(m));
  return q;
}

async function health(): Promise<any> {
  try { const r = await fetch(`${URL_BASE}/health`); return r.ok ? await r.json() : null; } catch { return null; }
}

async function ensureServer(): Promise<ChildProcess | undefined> {
  const h = await health();
  if (h?.devFast) { console.log("using running DEV_FAST server"); return; }
  if (h) throw new Error("a server is running without DEV_FAST=1; stop it or restart it with DEV_FAST=1");
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "freek-smoke-"));
  console.log(`spawning DEV_FAST server (data: ${dataDir})`);
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: dir, env: { ...process.env, DEV_FAST: "1", FREEK_DATA_DIR: dataDir }, stdio: ["ignore", "inherit", "inherit"],
  });
  for (let i = 0; i < 100; i++) { await sleep(150); if (await health()) return child; }
  child.kill();
  throw new Error("server did not start");
}

/** Client-side boat: sails toward a point at ~13 m/s sending `move` at 15 Hz. */
async function sailTo(room: Room<any, any>, tx: number, tz: number, stopDist = 1, maxMs = 20_000, until?: () => boolean) {
  const me = room.state.players.get(room.sessionId);
  let x = me.x, z = me.z;
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    if (until?.()) return true;
    const srv = room.state.players.get(room.sessionId);
    if (srv && Math.hypot(srv.x - x, srv.z - z) > 4) { x = srv.x; z = srv.z; } // accept server correction
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
    if (d <= stopDist) { room.send("move", { x, z, rot: Math.atan2(dx, dz), speed: 0 }); return true; }
    const step = Math.min(d, 13 / 15);
    x += (dx / d) * step; z += (dz / d) * step;
    room.send("move", { x, z, rot: Math.atan2(dx, dz), speed: 13 });
    await sleep(1000 / 15);
  }
  return false;
}

async function main() {
  const child = await ensureServer();
  const ca = new Client(URL_BASE);
  const cb = new Client(URL_BASE);
  let a: Room<any, any> | undefined, b: Room<any, any> | undefined;
  try {
    // --- create + list + join by code ---
    console.log("[1] create / list / join");
    a = await ca.create(ROOM_NAME, { name: "SmokeA", isPrivate: false, squad: "tide" });
    a.onMessage("*", () => {});
    const code = a.roomId;
    check(/^[A-HJ-NP-Z2-9]{5}$/.test(code), `room code looks valid: ${code}`);
    await waitFor(() => a!.state.code === code && a!.state.players.size === 1, 3000, "state sync");
    check(a.state.code === code, "state.code equals roomId");
    const list = await (await fetch(`${URL_BASE}/rooms`)).json();
    check(Array.isArray(list) && list.some((r: any) => r.code === code && r.hostName === "SmokeA" && r.maxClients === 12), "/rooms lists the room");

    const hofA = inbox(a, "hallOfFame");
    b = await cb.joinById(code, { name: "SmokeB" });
    b.onMessage("*", () => {});
    const both = (r: Room<any, any>) => r.state.players.size === 2;
    await waitFor(() => both(a!) && both(b!), 4000, "both players");
    check(both(a) && both(b), "A and B both see 2 players");
    const pa = a.state.players.get(a.sessionId);
    check(pa.squad === "tide" && b.state.players.get(b.sessionId).squad !== "tide", `squads: A=${pa.squad}, B=${b.state.players.get(b.sessionId).squad}`);
    check(pa.missions.length === 3 && a.state.squads.get("tide").missions.length === 1, "missions assigned");
    void hofA;

    // --- fishing ---
    console.log("[2] fishing");
    await sailTo(a, 0, 36, 0.5);
    const bites = inbox(a, "bite"), hooks = inbox(a, "hookResult"), catches = inbox(a, "catch"), snaps = inbox(a, "lineSnap");
    let caught = false;
    for (let attempt = 1; attempt <= 4 && !caught; attempt++) {
      bites.length = 0; hooks.length = 0; snaps.length = 0;
      await waitFor(() => a!.state.players.get(a!.sessionId).state === "sailing", 3000, "sailing state");
      a.send("cast", { power: 0.8, aimRad: 0 });
      const bite = await waitFor(() => bites[0], 5000, "bite");
      if (!bite) continue;
      a.send("hook", {});
      const hr = await waitFor(() => hooks[0], 2000, "hookResult");
      if (!hr?.ok) { console.log("  hook failed, retrying"); continue; }
      console.log(`  hooked tier=${hr.tier} difficulty=${hr.difficulty} durationMs=${hr.durationMs}`);
      // a too-fast reel must be rejected... (we don't test it here to keep the fish); wait the duration
      for (let t = 0; t < hr.durationMs; t += 200) { a.send("reel", { tension: 0.3, progress: t / hr.durationMs }); await sleep(200); }
      a.send("reelResult", { success: true, maxTension: 0.3 });
      const c = await waitFor(() => catches[0] || snaps[0], 3000, "catch");
      if (c && catches[0]) caught = true; else console.log("  line snapped (monster?), retrying");
    }
    check(caught, `catch received: ${catches[0] ? `${catches[0].card.speciesId} ${catches[0].card.tier} ${catches[0].card.weightKg}kg ${catches[0].card.points}pts` : "none"}`);
    await waitFor(() => a!.state.players.get(a!.sessionId).unbankedPoints > 0, 2000, "unbanked");
    const me = a.state.players.get(a.sessionId);
    check(me.unbanked.length >= 1 && me.unbankedPoints > 0, `unbanked grew: ${me.unbanked.length} fish, ${me.unbankedPoints} pts`);
    check(me.trophies.length >= 1 && me.catches >= 1, "trophies + catches updated");

    // --- banking ---
    console.log("[3] banking");
    const banked = inbox(a, "banked");
    await sailTo(a, 0, 0, DOCK_RADIUS * 0.5, 15_000, () => banked.length > 0);
    const bk = await waitFor(() => banked[0], 3000, "banked");
    check(bk && bk.points > 0, `banked message: ${JSON.stringify(bk)}`);
    await waitFor(() => a!.state.players.get(a!.sessionId).bankedPoints > 0, 2000, "bankedPoints");
    check(a.state.players.get(a.sessionId).bankedPoints > 0 && a.state.squads.get("tide").points > 0, "bankedPoints + squad points");

    // --- monsters + harpoons ---
    console.log("[4] monsters");
    const fx = inbox(a, "harpoonFx");
    const loot = inbox(a, "monsterLoot");
    const mon = await waitFor(() => [...a!.state.monsters.values()][0], 25_000, "monster spawn");
    check(!!mon, `monster spawned: ${mon ? `${mon.kind} hp=${mon.hp}` : "none"}`);
    if (mon) {
      const id = mon.id, maxHp = mon.maxHp;
      let hits = 0;
      const end = Date.now() + 40_000;
      while (Date.now() < end) {
        const m = a.state.monsters.get(id);
        if (!m) break;
        const p = a.state.players.get(a.sessionId);
        if (p.sunk) { await sleep(500); continue; }
        if (Math.hypot(m.x - p.x, m.z - p.z) > 35) { await sailTo(a, m.x, m.z, 30, 1500); continue; }
        if (m.state === "submerged") { await sleep(300); continue; }
        a.send("harpoon", { tx: m.x, tz: m.z });
        await sleep(1250);
        hits = fx.filter((f) => f.hitMonster === id).length;
      }
      const m = a.state.monsters.get(id);
      check(hits > 0, `harpoon hits registered: ${hits}`);
      check(!m || m.hp < maxHp, `monster hp dropped: ${m ? `${m.hp}/${maxHp}` : "killed"}`);
      if (!m) check(loot.length > 0, `monster loot received: ${loot[0]?.cards?.map((c: any) => `${c.tier} ${c.speciesId}`).join(",")}`);
    }

    // --- chat ---
    const chatB = inbox(b, "chat");
    a.send("chat", { text: "  hello " + "x".repeat(300) });
    const ch = await waitFor(() => chatB[0], 2000, "chat");
    check(ch && ch.text.length === 140 && ch.from === "SmokeA", "chat broadcast + trimmed to 140");
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await a?.leave().catch(() => {});
    await b?.leave().catch(() => {});
    await sleep(300);
    if (child) { child.kill("SIGTERM"); await sleep(500); }
  }
  console.log(failures ? `\nSMOKE FAILED (${failures})` : "\nSMOKE OK");
  process.exit(failures ? 1 : 0);
}

main();
