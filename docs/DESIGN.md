# Tidebreakers: multiplayer 3D fishing game (design + build spec)

Working title **Tidebreakers**. A browser game: Three.js client, Colyseus 0.18 server, TypeScript everywhere.
This file is the single source of truth. `shared/src/` holds the game data and network contract; both sides import it as `@freek/shared`.

## 1. Core loop (the dopamine design)
1. **Lobby**: enter a name, then **Create Room** (gets a 5-char code like `K7QX2`, public or private) or **Join** by code or from the public room list.
2. **Pick a squad** in the room: Coral (red), Tide (blue), Kelp (green), Sun (yellow). Up to 4 players per squad, max 12 per room.
3. **Sail** your own boat on a big ocean with islands, rocks and a fog edge. **Zones** pay out differently: Shallows (near spawn), Reef (by the islands), Abyss (far out, dark water, best loot, most monsters).
4. **Cast** (hold to charge power, release). **Wind** pushes the bobber off target and drifts the boat; strong gusts make the reel harder.
5. **Bite** (bobber dips plus sound, with a short reaction window to hook), then the **reel mini-game**: keep the fish marker inside your catch bar. Higher tiers move faster and erratically. Fill progress to land the fish; let tension max out and the line snaps.
6. **Reveal**: a tier-coloured flash, a sound and a card ("EPIC! Ghost Marlin, 41.2 kg"). Legendary catches trigger a room-wide announcement and a light beam at the catcher's boat.
7. **Missions**: three active per player, rerolled when completed. Completing one gives XP, coins, a big banner and a level-up animation. Squad missions advance from every member's actions.
8. **Sea monsters**: a timer, plus Abyss presence, spawns a monster near players. It attacks boats (damage, knockback, and you can't fish while stunned). Players fire **harpoons** (right-click or `F`, aimed at the cursor, cooldown). A defeated monster drops a **loot burst**: a guaranteed Epic+ fish for every contributor, bonus XP, and squad points.
9. **Boat HP**: reaching 0 means you **sink**. You respawn at the dock after 5 s and lose your *unbanked* catch (the fish since you last docked). **Banking** = sail into the dock ring: the catch counts as squad points and is locked in. This risk/reward choice (go deep, bank often?) makes it challenging.
10. **Leaderboards**: an in-room **squad leaderboard** (squad points, members, each member's best fish shown with its tier colour), a **trophy wall** (each player's top catches as tier-coloured cards), and a server-persisted **global hall of fame** (top 20 fish ever, by weight and tier).

## 2. Fish tiers
| Tier | Colour | Roll weight | Score multiplier | Reel difficulty |
|---|---|---|---|---|
| Common | #b0b8c0 | 60 | 1 | 0.25 |
| Rare | #3fa9ff | 25 | 2 | 0.45 |
| Gold | #ffc93c | 10 | 4 | 0.6 |
| Epic | #b05cff | 4 | 8 | 0.78 |
| Legendary | #ff5a1f (animated rainbow glow) | 1 | 20 | 0.95 |

Zone, bait and wind modify the roll weights (`shared/src/fish.ts` `rollFish()`). Points = `round(weightKg * tierMultiplier)`.

## 3. Wind
The server owns `wind {dirRad, speed 0..1, gust bool}`, drifts it slowly and fires a gust every 20 to 40 s. Effects: boat drift, cast offset, reel jitter, and visible waves and particles. The HUD shows a wind compass. Storm phase: every ~6 min, 60 s of high wind, rain and dark sky, with a ×1.5 rare-fish weight bonus.

## 4. Monsters
| Monster | HP | Behaviour |
|---|---|---|
| Reef Serpent | 300 | Circles a target boat and lunges (20 dmg) every 4 s |
| Abyss Kraken | 900 | Surfaces, slams tentacles in an area (35 dmg) every 6 s, then submerges and moves. Boss: room-wide warning |

Harpoon damage is 25 (40 at level 5+). Every player who hit it gets the loot.

## 5. Progression
XP comes from catches (`points * 2`), missions and monster kills. Level curve: `xpForLevel(n) = 100 * n^1.5`. Levels unlock rod upgrades automatically (better rare weights and a wider catch bar). Coins exist for future shop work. Progress is kept per player name in `server/data/profiles.json` (casual, no auth).

## 6. Architecture
```
shared/src/        game data + protocol (pure TS, no deps)
server/src/        Colyseus server: index.ts, rooms/OceanRoom.ts, schema/*.ts, systems/*, persistence.ts
client/src/        Vite + Three.js
  main.ts, net.ts (Colyseus SDK), ui/ (lobby, HUD, reel, toasts, leaderboard: plain DOM + CSS)
  world/ (ocean shader, sky, islands, dock, assets loader), entities/ (boat, monster, bobber/line), fx/
client/public/models/   CC0 glTF assets + manifest.json (see ASSETS.md)
```
- **Server-authoritative**: fish rolls, bites, catch outcomes, monster HP/AI, damage, missions, score, wind.
- **Client-authoritative movement** (casual): the client sends `move` at 15 Hz and the server clamps speed and the world bounds.
- Ports: server **2567**, client dev **5173**. The client connects to `ws://<host>:2567`.
- Colyseus 0.18: use the installed package types in `node_modules` as the API reference, not memory.

## 7. Build steps
1. Environment: ocean, sky, islands, dock, boat sailing locally. *(client)*
2. Rooms + lobby + sync of boats. *(server + client)*
3. Fishing: cast, bite, reel, reveal. *(both)*
4. Wind + storm. *(both)*
5. Monsters + harpoons + boat HP / sinking / banking. *(both)*
6. Missions, XP and levels, tiers UI, squad leaderboard, trophy wall, hall of fame. *(both)*
7. Polish: sounds (WebAudio-synthesised, no files needed), particles, juice.
