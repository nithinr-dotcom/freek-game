# Tidebreakers

A multiplayer 3D fishing game that runs in the browser: Three.js client, Colyseus server. The game design is in `docs/DESIGN.md`.

## Run
```bash
npm install
npm run dev:server   # game server on :2567 (DEV_FAST=1 for short timers)
npm run dev:client   # http://localhost:6280  (?offline=1 = solo sandbox)
```
Friends on the same network open `http://<your-ip>:6280`.

## Tests
`npm run smoke -w server` plays a bot match: create, join, catch, bank, fight a monster.

## Models
Every model is procedural. To use real CC0 `.glb` files, add them to `client/public/models/` and list them in `manifest.json` (see `client/src/world/assets.ts`).
