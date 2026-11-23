import { defineServer, defineRoom, createRouter, createEndpoint, matchMaker } from "colyseus";
import { SERVER_PORT, ROOM_NAME, type RoomMeta } from "@freek/shared";
import { OceanRoom } from "./rooms/OceanRoom.js";
import { loadAll, getHallOfFame, saveProfiles } from "./progression/persistence.js";
import { DEV_FAST, SAVE_EVERY_MS } from "./config.js";

loadAll();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const routes = createRouter({
  health: createEndpoint("/health", { method: "GET" }, async () => json({ ok: true, time: Date.now(), devFast: DEV_FAST })),
  rooms: createEndpoint("/rooms", { method: "GET" }, async () => {
    const rooms = await matchMaker.query({ name: ROOM_NAME });
    return json(rooms
      .filter((r) => !r.private && !(r.metadata as RoomMeta | undefined)?.isPrivate)
      .map((r) => {
        const meta = r.metadata as RoomMeta | undefined;
        return { roomId: r.roomId, code: meta?.code ?? r.roomId, hostName: meta?.hostName ?? "", clients: r.clients, maxClients: r.maxClients };
      }));
  }),
  halloffame: createEndpoint("/halloffame", { method: "GET" }, async () => json({ entries: getHallOfFame() })),
});

const server = defineServer({
  rooms: { [ROOM_NAME]: defineRoom(OceanRoom) },
  routes,
  greet: false,
});

setInterval(() => saveProfiles(), SAVE_EVERY_MS).unref();
server.onShutdown(() => saveProfiles(true));

const port = Number(process.env.PORT ?? SERVER_PORT);
await server.listen(port, "0.0.0.0");
console.log(`[server] Tidebreakers listening on ws://0.0.0.0:${port}${DEV_FAST ? " (DEV_FAST)" : ""}`);
