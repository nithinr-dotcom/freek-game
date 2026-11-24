# Tidebreakers: Endless Tide (single-player roguelite mode): design draft

Status: **built** (E1–E4 in one pass; see §12 for what differs from this draft). Inspired by the wave-shop-upgrade loop of arena roguelites (Brotato, Vampire Survivors), rebuilt around fishing. Everything here reuses campaign systems (ReelSim, regions, hazards, bosses, species, monsters) so it can live in `shared/src/endless/` and `client/src/solo/endless/` without touching the campaign or multiplayer.

## 1. The pitch
You're a captain anchored in a ring of open sea. Each **tide** (wave) lasts 60–90 s: fish schools boil up around you and sea monsters attack. Catch as much as you can, survive, and when the tide ends you cash in your hold at the **Tackle Shop**: buy rigs and trinkets, reroll, level up. Then the next tide comes in, harder. A run is **20 tides (about 25 min)**, with bosses at tides 10 and 20; after that it goes on forever and only gets worse.

What makes it addictive: runs are short; every run plays differently because the shop is random; builds snowball into silly power; dying is fast and the next run is one click away; and every run unlocks something.

## 2. The tide loop
| Phase | Length | What happens |
|---|---|---|
| Tide | 60 s (tide 1), +3 s per tide, max 90 s | Schools spawn, monsters spawn in growing packs, hazards from the current biome. A big countdown ring on the HUD. |
| Cash-in | 2 s | The tide ends: monsters sink, the **hold** turns into coins (a coin shower), and XP bars fill. |
| Level-up | (if levelled) | Pick 1 of 4 random stat upgrades per level gained (rarity rolls with Luck). |
| Tackle Shop | untimed | 4 random offers; buy, **lock** (keeps an offer to the next shop), **reroll** (cost goes up within the shop, resets each tide), sell (refund 40%). Then "Next Tide". |

**Hold, not bank**: catches go into the hold during the tide. A monster hit **spills 5% of the hold** as floating loot that you can sail over to grab back before it sinks (4 s). That puts greed against safety, like the load mechanic in the campaign.

**Fishing has to be quick at wave pace:**
- **Commons and Rares** use a *quick reel*: a short ReelSim burst of about 2–4 s.
- **Gold and above** use the full reel minigame. Monsters keep coming while you reel, so a big fish is a real gamble.
- Auto-rigs (below) can land commons on their own. You only reel what matters.

## 3. Rigs (the "weapons"): 6 slots
Rigs act on their own, like weapons that fire themselves. Each rig has a tier (I–IV). **Two copies of the same rig at the same tier merge** into the next tier. That merge is the moment players chase.

| Rig | Class | Behaviour |
|---|---|---|
| Bobber Rod | Rod | A passive line. Every N s it hooks the nearest small fish inside its cast range. |
| Trolling Line | Rod | Trails behind the boat. Catches more the faster you sail. |
| Deep Line | Rod | Slow, but only hooks Gold or better. You reel the catch manually. |
| Cast Net | Net | Every 6 s it throws a net arc that bags the whole school inside it (commons only). |
| Harpoon Gun | Harpoon | Fires at the nearest monster by itself (the campaign harpoon, automated). |
| Chain Harpoon | Harpoon | Pierces and chains to 2 more targets. |
| Depth Charge | Explosive | AoE damage that also stuns fish (stunned fish are auto-caught). |
| Chum Bucket | Support | Pulls schools toward the boat and makes monsters angrier. |
| Lantern Drone | Support | Orbits the boat, lights things up, and zaps horrors (Abyss biome). |
| Kraken Ink Jet | Exotic | A cone of ink that slows monsters and doubles catches for 3 s. |

**Classes give set bonuses** (2/4/6 rigs of a class). For example **Rods 2/4/6**: +10/25/50% bite speed. **Harpoons 2/4**: +1/2 pierce. **Nets 3**: nets also pull in loot.

## 4. Trinkets (the "items"): unlimited, stackable
Trinkets are passives with tradeoffs, which is where builds get their character. About 80 at launch, each with a rarity of Common, Rare, Gold, Epic or Legendary (the fish tier colours).
- **Rusty Anchor** (Common): +3 Armor, −5% Speed.
- **Golden Hook** (Rare): Gold-or-better fish are worth +20%.
- **Barnacle Hull** (Rare): +15 Max HP, but you can't regenerate.
- **Merchant's Ledger** (Gold): +12% interest on unspent coins at shop close.
- **Serpent Fang** (Epic): your harpoon crits make the boat lunge forward (a dash).
- **Glass Cannon Reel** (Epic): reel speed ×2, line strength −40%.
- **Maelstrom Core** (Legendary): every 10 s a whirlpool pulls every fish and monster to you.
- **Cursed Doubloon** (Legendary): +100% coins, and the next tide spawns twice as many monsters.

## 5. Stats
Max HP · Hull Regen · Armor · Speed · Reel Power (fill rate) · Line Strength (snap threshold) · Catch Zone · Luck (fish tier and offer rarity) · Harpoon Damage · Fire Rate · Range (cast and harpoon) · Magnet (loot pickup radius) · Hold Size · Interest (coins at shop close) · Engineering (rig damage and speed).

A stat can go **negative**, and the game shows it (this is what makes trade-off items readable). The HUD stat panel can be opened in the shop.

## 6. Captains (characters)
Each captain bends the rules, so a run feels different before the first fish bites. Most are locked at first and unlock through play.
| Captain | Rule | Unlock |
|---|---|---|
| Marlow | Balanced and starts with a Bobber Rod. | Default |
| The Merchant | +30% interest, −25% Max HP, shop has 5 offers. | Reach tide 10 |
| The Harpooner | Can't fish at all; monsters drop coins ×3. | Kill 500 monsters |
| One-Line Willy | 1 rig slot only; that rig gets ×4 stats. | Win a run with only 1 rig |
| The Net Witch | Nets only; merges need 1 fewer copy. | Bag 1,000 fish with nets |
| Frostbitten Ingrid | Cold meter always on; colder = stronger rigs. | Beat the Ice Leviathan in Endless |
| The Abyss-Touched | No lantern; sees through darkness; HP drains. | Reach tide 20 at Danger 3 |
| Lucky Pip | Luck +50, but every shop has 1 cursed item. | Catch 25 Legendaries |

## 7. The sea changes (reusing campaign regions)
Every 4 tides the biome rotates, bringing its own hazards and species:
- Tides 1–4: Shallows Bay
- Tides 5–8: Coral Maze (contact damage)
- Tides 9–12: Stormbreak (lightning), with the **Tide 10 boss**: a random campaign boss with HP scaled to the tide
- Tides 13–16: Frozen Fjord (cold, ice floes)
- Tides 17–20: Abyss Trench (darkness, horrors), with the **Tide 20 boss**: two bosses at once

**Tide modifiers** (one random modifier every 3rd tide, shown before the tide starts):
- **Golden School**: one shimmering school of nothing but Golds.
- **Feeding Frenzy**: double fish, double monsters.
- **Fog**: range is halved.
- **Bounty Fish**: one marked Epic. Catch it for a free shop item.
- **Rogue Wave**: big wave telegraphs that push the boat.

**Endless (tide 21+)**: the biomes keep looping. Monster HP and damage go up ×1.12 per tide and elites appear, so you're playing for your deepest-tide record.

## 8. Danger levels (difficulty ladder)
**Danger 0–5**, unlocked per captain by winning a run at the level below. Each level adds a rule: elites, then fewer shop offers, then bosses gaining a phase, then −20% hold, then no regen at the shop. Each captain shows the highest Danger they've won. That gives you 8 captains × 6 levels = 48 "beat it" goals.

## 9. Meta and retention (kept fair)
- **Unlock pool**: rigs, trinkets and captains unlock through in-run feats ("Merge a tier-IV rig", "Win with 0 harpoons"), so new runs keep finding new things.
- **Almanac**: a Codex for rigs and trinkets, with silhouettes until you find them. It ties into the existing Codex.
- **Run history and records**: best tide, best coins, best single fish, and fastest win, for each captain.
- **Daily Tide**: a seeded daily run (same captain, modifiers and shop seed for everyone). The Colyseus server could later host a global daily leaderboard next to the multiplayer one.
- **Campaign tie-in**: Endless wins pay a few campaign materials and cosmetics, and campaign trophies unlock Legendary trinkets in Endless. This gives the campaign more replay value too.
- **No** energy timers, loot boxes or paid rerolls. The pull comes from the "one more run" loop, not from pressure.

## 10. "Juice" checklist
Coin shower and counter roll-up at cash-in, a screen-shake flash on merges, offer cards that glow by rarity, the reroll slot-machine flicker, a slow-mo "LEGENDARY HOOKED" banner, damage numbers, a combo counter for fast catches, and a stat delta preview (green/red) when hovering over any shop item.

## 11. Implementation map
- `shared/src/endless/`: `stats.ts` (the stat block + modifiers), `rigs.ts`, `trinkets.ts`, `captains.ts`, `waves.ts` (spawn curves, modifiers, boss tides), `shop.ts` (seeded offer roll, reroll pricing, rarity by Luck/tide), `unlocks.ts`.
- `client/src/solo/endless/`: `runner.ts` (the tide state machine, like `chapterRunner.ts`), `rigs/` (per-rig behaviours as actors), `spawner.ts`, `hold.ts`; UI in `client/src/ui/tackleShop.ts`, `levelUp.ts`, `runSummary.ts`.
- **Reuse**: `ReelSim` (quick reel + auto-rig sim), `bosses/registry` (HP scaled by tide), `hazards/registry`, `regions/registry`, `species.ts`, `save.ts` (a new `endless` save branch), `client/scripts/balance.ts` (headless whole-run sim to tune the economy curve).
- **Build phases**: E1, the core loop (1 biome, 6 rigs, 25 trinkets, Marlow, shop, level-up, 20 tides). E2, biome rotation and bosses. E3, captains, danger levels and unlocks. E4, daily tide, almanac and balance.

## 12. Implementation notes (as built)
**Play it**: lobby → *Endless Tide* card, or `?endless=1&captain=<id>&danger=<0-5>` (`&daily=1` for today's Daily Tide, `&resume=1` to continue a saved run, `&dev=1` keeps `window.__game.endlessRef`).

**Files**
- `shared/src/endless/data.ts`: 16 stats, 11 rigs, 52 trinkets (3 cursed, Pip only), 8 captains, Danger 0–5, 5 biomes, 7 tide modifiers, fish coin/xp values, 5 companions, unlock texts.
- `shared/src/endless/rules.ts`: run state, `computeStats`, `tideSpec` (difficulty curve), seeded shop (`rollShop`, `buy`, `merge`, `sell`, reroll pricing), level-up rolls, interest, score, Daily Tide seed + AI rivals.
- `client/src/endless/EndlessMode.ts`: the tide state machine (intro → tide → cash-in → level-ups → shop), spawns, rig behaviours, hazards, bosses, hold spill, loot. Implements `game/modeLike.ts` (`SoloModeLike`), which the campaign's `SoloMode` now implements too.
- `client/src/endless/world.ts` (arena ring, schools with real fish models, loot, flying fish), `ui.ts` (HUD strip, cards, cash-in, level-up, Tackle Shop, victory, summary), `menu.ts` (captain/danger/companion select, Daily Tide board, Almanac), `meta.ts` (save key `tidebreakers.endless.v1`: unlocks, records, Almanac, daily scores, run in progress, trophies, companion), `endless.css` (also photo mode + aquarium styles).
- SoloNet hooks (neutral by default): `persistEnabled`, `xpMult`, `hooks.biteDelayMult/reelTimeMult/monsterSpeedMult`, `strike()` for rig damage. `Fishing.blocked` (Harpooner can't cast).

**Differences from the draft**
- The arena is a 64 m ring at (0, −110) on the original map. Biomes change the water/sky colours, species, hazard and light, not the map (regions are separate maps that need a reload).
- Hazards: fire coral patches (Coral), lightning circles + storm (Stormbreak), freezing fog that halves speed (Fjord), night + lantern (Abyss).
- Bosses: Reef Serpent (tide 10), Crab Titan + Reef Serpent (tide 20), alternating after that. The Kraken, Leviathan and Eye need campaign hazard systems and are not used.
- Deep Line works only while you sit still (speed < 3.5). A run is saved between tides and can be resumed from the lobby.
- The Daily Tide uses a loaned captain of the day (locked or not) at Danger 1; the tournament board is 11 seeded AI rivals plus you.

**Single-player extras added alongside**
- Companions (`entities/Companion.ts`): gull, otter, turtle, baby kraken follow the boat in the campaign and in Endless; small stat perks in Endless only. Picked in the Endless menu, unlocked through Endless.
- Photo mode (`game/photoMode.ts`, key **P** or the pause menu): pauses, hides the HUD, 6 filters, vignette, PNG download with the filter baked in.
- Aquarium (`ui/aquarium.ts`, lobby + pause menu): a 3D tank with the 18 rarest record fish from the campaign Codex and Endless.

**Known gaps**: balance is a first pass (no headless sim of Endless yet; tune `tideSpec` and `FISH_COINS`); touch has no dash button for Sea Legs; the Endless tracker reuses the campaign mission chips (CAMPAIGN/BONUS labels).

## 13. Retention pass (built by five parallel sub-agents, integrated 2026-11-24)
- **Evolutions and combos** (`shared/src/endless/evolutions.ts`, `client/src/endless/combos.ts`): 6 evolutions (Tier IV rig + a trinket → a ★ rig about 2× a Tier IV, via the "★ Evolve" button on the shop slot, for 1.5× that rig's Tier IV price; each evolution once per run): Midas Rod, Gatling Harpoon, Kraken Net, Tsunami Charge, Storm Chain, Twin Drones. 10 hidden two-item combos (stat combos go through `computeStats`; chain slow and Blast Fishing are read in `updateRigs`). Shop cards hint at combos and evolutions; first discoveries show a card; the Almanac has a ⚡ Combos tab (`meta.discoveries`). `RigSlot.evolved` is optional.
- **Harbour** (`shared/src/endless/harbour.ts`, `client/src/endless/harbour.ts`): pearls = (tides reached + 3×bosses + 10 for a win) × (1 + 0.15×Danger), +5 on a Daily, min 1. 9 upgrades, 534 pearls to max everything. Levels are copied into `run.harbour` at run start; the Daily Tide ignores the Harbour. "Refund all" gives every pearl back.
- **Chests and mid-tide events** (`shared/src/endless/events.ts`, `client/src/endless/events.ts`): elites and bosses drop wood/silver/gold chests, and brutes drop one 35% of the time so Danger 0 sees chests too. Each opens with a slot-machine reveal giving coins, a trinket or a rig tier-up. At most one event per tide from tide 2 (not on boss tides): merchant ship (60% prices), cursed altar (risky deals), shiny legendary school (10 s), treasure rain. Test with `?enEvent=merchant|altar|shiny|treasure_rain`. Mid-tide rewards don't save the run (no quit-and-replay exploit).
- **Monsters** (`shared/src/endless/monsters.ts`, `client/src/endless/monsters/`): Piranha Pack (tide 2), Spitter Eel (3), Puffer Mine (5), Armored Crab (7, front shield takes 20% damage), Jelly Bloom (9, splits into Jellylets). All are serpent-kind with client controllers, so the server is untouched. A newly unlocked type is "featured" (×2 weight) on its unlock tide.
- **Death screen** (`client/src/endless/deathScreen.ts`, `progress.ts`): a true near-miss line, up to 3 next-unlock bars animated from the run-start snapshot, a new-best-tide line, a "runs today" counter, and R/Space/Enter to run it back. Keep `unlockProgress` in step with `checkUnlocks`.
- **Known gaps**: kill-heal triggers per piranha (packs heal a lot); evolved rigs sell at the Tier IV price; Twin Drones draws one drone; restart reloads the page; none of the new systems are in a balance simulation yet.
- **Balance pass (2026-11-24)**: tuned with the headless simulator; every number changed is listed in `docs/ENDLESS_BALANCE.md` → *Tuning changelog* (prices ×1.13 a tide, stat soft caps in `computeStats`, Engineering is speed only, evolutions cost coins, a monster HP wall from tide 16, bosses on the monster curve, Danger adds +7% HP and +5% monsters a level, Willy swaps his one rig and has ×8 power, the Harpooner has 4 slots, the Net Witch's rigs are ×2, Pip's cursed trinkets max 2 each). The captain table in §6 is the original draft; the live rules are the blurbs in `data.ts`.
