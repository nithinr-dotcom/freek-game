# Tidebreakers campaign v2 (single player): full spec

This document is the source of truth for the single-player campaign. Multiplayer (server/, the multiplayer ocean, shared/src/fish.ts SPECIES) must keep working unchanged. Campaign-only data goes in `shared/src/campaign/` (one file per concern and per act) and campaign logic in `client/src/solo/`.

Default rules chosen for the user: **a failed chapter restarts from its start, or from the boss checkpoint, at no cost.** There is no item loss.

## 1. Structure
Five **regions**, each a separate solo map with its own biome, layout, home dock, species, material and boss. That's **30 chapters** (6 per act; chapter 6 of each act is the boss). After the finale come Free Play, the Bounty Board and the Hard and Legendary modes.

| # | Region | Biome / hazard | Material | Boss (trophy) |
|---|---|---|---|---|
| 1 | Shallows Bay | Sunny and calm; the old wreck and the lighthouse | Shell Fragments | Reef Serpent (Serpent Fang) |
| 2 | Coral Maze | Turquoise water; coral channels that **damage the hull on contact**; wrecks | Coral Shards | Crab Titan (Titan Carapace) |
| 3 | Stormbreak Strait | Permanent strong wind, frequent storms, **lightning strikes** (telegraphed circles) and big waves | Storm Glass | Storm Kraken (Kraken Beak) |
| 4 | Frozen Fjord | Snow and aurora nights; **drifting ice floes** (moving obstacles); a **cold meter** that drains away from heat sources | Ice Pearls | Ice Leviathan (Leviathan Heart) |
| 5 | Abyss Trench | Endless night; **lantern fuel** sets the visibility radius; deep horrors | Abyssal Ink | Maelstrom Eye (Maelstrom Core) |

Travel: you can sail between unlocked regions from any home dock with a **Sea Chart** (map) screen. A region unlocks when you beat the previous act's boss.

## 2. Objective engine (data-driven)
Each chapter has **1 main objective (required) and 2 optional objectives**. Each completed objective is worth 1 star. The **grade** comes from stars, time against par and damage taken: S (3★, under par, ≤10% damage), A (3★), B (2★), C (1★).

Objective types (each has a progress display and a tracker string):
`catch_count`, `catch_tier{tier,n}`, `catch_species{ids[],n, distinct?}`, `catch_weight_range{speciesId?,minKg,maxKg,n}`, `bank_points_trip{n}`, `bank_any`, `perfect_reel{n}`, `streak{n}` (consecutive landings with no snap), `harpoon_hits{n}`, `kill{monster|boss,n}`, `reach{pointId}` (sail to a marker), `collect{itemKind,n}` (floating pickups: pearls, crates, storm glass, fuel), `escort{npcId,toPointId,minHpPct?}` (tow an NPC boat: it follows you on a rope, monsters target it, and it has HP), `defend{npcId,seconds}` (keep a moored NPC alive), `survive{seconds, condition?}`, `no_damage`, `under_time{seconds}`, `warmth_above{pct}`, `no_lightning_hits`, `no_sink`.

Chapter **fail conditions**: `timeLimit` (seconds; HUD countdown), `ironman` (sinking fails the chapter), escort or defended NPC destroyed, frozen (cold meter at 0), out of fuel in darkness for 10 s.
On failure: a "CHAPTER FAILED" card showing the reason, then Retry or Back to the chart. After **3 fails** on a chapter, Marlow gives the chapter's `hint` line and offers an optional **Assist** for that attempt (+15% catch zone and −20% monster damage); a chapter finished with Assist is capped at grade B.
**Checkpoints**: boss chapters restart at the start of the current phase.

## 3. Fishing depth
**Species behaviours** for the reel minigame (each species has one; Legendary fish cycle through several):
- `steady`: smooth.
- `darter`: fast short dashes.
- `feinter`: slows down as if tired, then surges.
- `diver`: constant downward pull with fast tension build.
- `thrasher`: random violent jerks.
- `legend`: switches patterns every 3–5 s.

**Gear stats feed the minigame:**
- **line rating (kg)**: fish heavier than the rating build tension ×(1 + excess%).
- **reel speed**: progress fill rate and how fast the catch zone rises.
- **rod**: cast distance, bite speed and rare-tier weights.

**Species conditions** (catchable only when all hold): `time: day|dusk|night`, `weather: clear|rain|storm|gust|aurora`, `near: landmarkId` (radius), `bait: speciesId`. A solo day/night cycle runs (one full day = 10 min). **Rest at dock** skips to the next dusk or night. Marlow's clue text and the Codex show the conditions as riddles until the fish is caught once, then as plain text.

**Bait (food chain)**: some fish can be kept as bait instead of being banked. A bait slot sits on the HUD (cycle with B or a touch button). Species that need bait only bite with that bait equipped, and the bait is used up when they bite.

**Load**: unbanked weight slows the boat: `speed *= max(0.55, 1 − 0.45 * unbankedKg / hullCapacityKg)`, and the HUD shows a load bar. Greed is a real choice.

**Species count**: the existing ones are used in Shallows Bay, and each region adds about 7 new species across all tiers, including 1 Legendary per region. Every region has 1–2 condition or bait species for its hunt chapters.

## 4. Gear, materials, workshop
**Slots**: Rod, Reel, Line, Hull, Harpoon, Lantern, Heater. Each has tiers T1–T5. Crafting or upgrading takes coins + region materials, and **T4 and T5 need boss trophies**.
- **Materials drop** from catches (chance rises with tier; the material belongs to the region), from optional objectives, collect pickups and bosses.
- **Coins** come from banking (1 coin per 2 points) and from rewards.
- The **Workshop** opens at any home dock. Gating is soft but real: Act 3's Line Breaker needs line ≥ T3 (the fish is 120+ kg), and Act 4 needs Heater ≥ T2.

## 5. Skill tree
1 skill point per level, plus 1 per boss. Three branches with 5 nodes each, every node 1–3 ranks:
- **Angler**: wider catch zone; slower tension build; longer bite window; a perfect-reel bonus (+materials); **Second Wind** (once per fish, a snap is prevented and tension resets to 60%).
- **Sailor**: speed; hull HP; load capacity; wind resistance; slow repair at sea.
- **Hunter**: harpoon damage; cooldown; weak-point crit ×2; **Twin Harpoon** (fires 2); monster loot bonus.

There's a respec option at the dock for coins.

## 6. Bosses (multi-phase; every attack telegraphed ≥0.8 s)
1. **Reef Serpent**: P1 circles you, then lunges along a red line telegraph (dodge by steering). P2 (<50% HP) does double lunges and moves faster.
2. **Crab Titan**: immune while its shell is closed (harpoons spark off). After a claw slam (two circle telegraphs) its shell opens for 3 s and the glowing weak point takes crits. P2 summons small crabs that latch onto the boat and deal damage over time; harpoon them off.
3. **Storm Kraken**: 4 tentacles with their own HP must be destroyed, under lightning, before the head surfaces. P2 adds an ink cloud (the screen darkens) and 2 tentacles regrow.
4. **Ice Leviathan**: hides under an ice sheet; harpoons crack ice plates to expose it. Its frost breath is a cone telegraph that spikes the cold meter and slows the boat. P2 rams ice floes toward you.
5. **Maelstrom Eye**: a whirlpool pulls the boat toward the centre (sail against it). The eye opens periodically and can be harpooned; abyss horrors spawn. P3 finale: **the Eye Duel**, a special giant reel minigame with legend behaviour and a long progress bar.

Each boss has an intro cinematic (camera pan, title card, roar), a boss HP bar with phase pips, and a kill cinematic (slow motion, flash, loot shower). Bosses give a skill point, a trophy, a title and a cosmetic.

## 7. Chapters
Format: **Title**: main objective / optional 1 / optional 2 · special rules. Every chapter also has 2–4 lines of Marlow intro, a `hint`, `parSeconds` and rewards (xp, coins, materials), all in the data files.

**Act 1: Shallows Bay**
1. **First Cast** (tutorial): catch 3 fish and bank them / 1 perfect reel / under 5 min.
2. **Line and Sinker**: catch 5 fish / no snaps / 2 Rare-or-better · timeLimit 4:00.
3. **Steady Hands**: land a Bay Perch between 1.0 and 1.2 kg / no line snaps / under 6 min.
4. **Night Bite**: catch the Moonlit Eel (night, near the old wreck) / bank it without taking damage / under 1 in-game night.
5. **Bait and Switch**: catch a Sardine, use it as bait and land a Bluefin Tuna / streak 4 / no damage.
6. **BOSS: Reef Serpent** / no damage / under 3 min. Unlocks Coral Maze.

**Act 2: Coral Maze**
7. **Into the Maze**: reach the Sunken Arch while collecting 5 pearls / no hull damage / under 4 min.
8. **Colour Hunt**: catch 4 distinct Coral species / 1 Gold / 2 perfect reels.
9. **Salvage Run**: collect 6 wreck crates · ironman / no damage / under 6 min.
10. **Pearl Diver**: escort the diver's boat out of the maze / escort above 75% HP / under 5 min.
11. **Greed**: bank 600 points in one trip / no sinking / land an Epic.
12. **BOSS: Crab Titan** / remove every latched crab within 3 s / under 5 min. Unlocks Stormbreak Strait.

**Act 3: Stormbreak Strait**
13. **Weathering**: survive 2 min of storm while catching 3 fish / no lightning hits / 1 perfect reel.
14. **Gust Rider**: catch a Stormscale Tuna (only bites during gusts) / reach 3 marker buoys first / under 6 min.
15. **Lighthouse Down**: collect 4 Storm Glass from the wrecks · ironman · timeLimit 6:00 / no damage / bank 200 points.
16. **Line Breaker**: land a Thunder Marlin (thrasher, over 120 kg; needs line T3) / no snaps / streak 3.
17. **Hold the Line**: defend the moored supply ship for 3 min against serpents / ship above 50% / 10 harpoon hits.
18. **BOSS: Storm Kraken** / no lightning hits / under 6 min. Unlocks Frozen Fjord.

**Act 4: Frozen Fjord**
19. **Cold Open**: reach 3 heater buoys through the ice / warmth never below 30% / under 5 min.
20. **Under the Ice**: catch a Glacier Char (dusk, near the ice cracks) in the 8–9 kg range / no snaps / warmth above 40%.
21. **Aurora Hunt**: catch the Aurora Koi (night + aurora) / 2 perfect reels / no damage.
22. **Frozen Supply**: escort the sled-barge through drifting ice · ironman / barge above 60% / under 7 min.
23. **Deep Freeze**: a streak of 8 during a blizzard / warmth above 30% / 1 Epic.
24. **BOSS: Ice Leviathan** / never frozen / under 6 min. Unlocks Abyss Trench.

**Act 5: Abyss Trench**
25. **Lights Out**: reach the Glow Reef while collecting 5 lantern fuel / never run out of fuel / under 5 min.
26. **Horrors Below**: survive 3 min of horrors while catching 4 Abyss fish / no damage / 2 Gold-or-better.
27. **The Chain**: Lanternfish as bait for a Void Eel, the Void Eel as bait for an Abyssal Shark / streak 3 / no sinking.
28. **Into the Dark**: 3 Epic-or-better · ironman · timeLimit 10:00 / 1 Legendary / perfect reel ×2.
29. **The Last Light**: escort Marlow's boat to the Maelstrom's edge / escort above 75% / under 8 min.
30. **FINAL BOSS: Maelstrom Eye + the Eye Duel** / no sinking / under 8 min. Then the credits.

## 8. After the campaign
- **Free Play** in any region.
- **Bounty Board** at each dock: 3 procedurally generated challenges (random objective type and region parameters) that refresh on completion and pay materials and coins.
- **Hard mode** (unlocked by beating chapter 30): monsters +50% HP and damage, fish difficulty +0.1, time limits −20%.
- **Legendary mode** (unlocked by finishing Hard): Hard rules plus ironman on every chapter. Best grade is tracked per chapter per mode.

## 9. Collection and rewards
- **Fish Codex**: every species, shown as a silhouette until caught, with a clue or conditions, its record weight and its region. There's a completion % and per-region completion rewards (title + paint).
- **About 30 achievements**, for example all S grades in an act, catching all Legendaries, 1000 fish, beating a boss with no damage, a streak of 20.
- **Titles** shown in the HUD and lobby.
- **Boat cosmetics**: paint, sail, flag. Cosmetics apply to the solo boat; in multiplayer they're optional, client-only visuals.

## 10. Save
`localStorage` with a versioned key; **migrate the v1 save**, so existing players keep their level, xp, coins and trophies and continue at Act 1 (with an "Old campaign completed" achievement if they finished v1). Autosave on every catch, bank, craft, skill pick and chapter event.

## 11. Build phases
- **P1, systems + Act 1**: region framework (biome config + layout per region; Shallows Bay = the current map), the objective engine + fail conditions + stars and grades + checkpoints + hints and Assist, fish behaviours, species conditions + day/night + rest, bait, load, gear, materials and the workshop, the skill tree, the Codex, the achievements, titles and cosmetics framework, save v2 + migration, the Sea Chart, and Act 1 complete with the reworked Serpent boss. Extension points (register a region, boss, species set, act chapter file) must let later acts be added in separate files.
- **P2, Acts 2–3** (Coral Maze + Crab Titan; Stormbreak Strait + Storm Kraken).
- **P3, Acts 4–5** (Frozen Fjord + Ice Leviathan; Abyss Trench + Maelstrom Eye + the Eye Duel + credits).
- **P4**: Bounty Board, Hard and Legendary modes, the full achievements list, balance passes, mobile checks.

## 12. Implementation notes (each phase appends here for the next one)

### P1 implementation notes (systems + Act 1)
**File map**
- `shared/src/campaign/` (exported from `@freek/shared`; the server never reads it): `types.ts` (all data types), `registry.ts` (register/get region, act, boss, species), `regions/shallowsBay.ts` + `regions/stubs.ts` (regions 2–5 as `stub: true` placeholders for the chart), `species/shallowsBay.ts` (the 16 original species with behaviours/clues + Moonlit Eel, Dusk Flyingfish, Storm Herring, Wreck Grouper; Tuna needs sardine bait), `bosses.ts` (boss data), `act1.ts` (chapters 1–6), `gear.ts`, `skills.ts`, `materials.ts`, `cosmetics.ts` (cosmetics + titles), `achievements.ts`, `grade.ts`, `index.ts` (side-effect imports register the data).
- `client/src/solo/`: `SoloNet.ts` (fake server, now with loadout, campaign roll hook, boss controllers, NPC targets, coins on banking), `chapterRunner.ts` (chapter flow, fail conditions, checkpoints, stars/grade, rewards, hints/Assist, wrap-up), `objectives.ts` (engine for every §2 type, plus `bank_fish`, `bank_species`, `no_snap`), `actors.ts` (reach markers, pickups, tow/moored NPC boats), `species.ts` (conditions + bait + rod roll; `speciesInfo()` for UI lookups), `loadout.ts` (gear + skills + assist → stats; load factor), `clock.ts` (10-min day, Rest), `save.ts` (v2 + `migrateV1`), `codex.ts`, `achievements.ts`, `bosses/` (registry + `reefSerpent.ts`), `regions/` (client layout/decor registry + `shallowsBay.ts` wreck), `dev.ts` + `devChapters.ts`.
- `client/src/game/soloMode.ts` glues all of it into `Game` (Game only calls `soloMode.update/onKey/hint/mapExtras/bossBar`). UI: `ui/seaChart.ts`, `ui/workshop.ts` (gear/skills/boat+titles), `ui/codex.ts` (fish + achievements), `ui/campaignScreens.ts` (banner, complete, failed + Assist, boss cards), `ui/soloHud.ts` (clock/timer strip, load bar + bait slot, dock bar, bait offer, achievement toasts), `fx/telegraphs.ts` (line + circle telegraphs), `world/landmarks.ts`.
- Multiplayer-safe hooks with neutral defaults: `ReelGame.start(..., mods?)`, `Fishing.modsProvider`, `LocalBoat.speedMult/windMult`, `Hud.maxHp/cooldownMs/setBoss(pips)`, `SkySystem.forcedHour/setBiome/visMult` (+ `uNight`), `Ocean.setWater`, `useLayout()`, `Boat.applyCosmetics/setTitle`.

**Adding content (P2/P3)**
- Region: write `shared/src/campaign/regions/coralMaze.ts` calling `registerRegion({... id: "coral_maze" ...})` without `stub`, import it in `campaign/index.ts` after `stubs.js`. Client side: `client/src/solo/regions/coralMaze.ts` calling `registerRegionClient({ id, layout: () => LayoutData, decorate })`, import in `solo/regions/index.ts`. Regions are separate maps: travel reloads with `?solo=1&region=<id>` and `main.ts` calls `useLayout()` before the World is built. `homeDock` is data but the dock/bank ring is still hard-wired at `DOCK_POS` (0,0): give new layouts their dock at the origin or make SoloNet/World read `region.homeDock`. Zones (shallows/reef/abyss rings) are reused as depth bands per region.
- Species: `species/<region>.ts` → `registerSpecies([...])` (`specialChance` + `conditions` = hunt species; `baitable`). Only species with no conditions enter the normal tier roll.
- Boss: data via `registerBoss` (phases with `atPct`, trophy, title, cosmetic); behaviour = subclass of `BossBehaviour` in `solo/bosses/<boss>.ts` + `registerBossBehaviour(id, env => new X(env))`, import in `bosses/index.ts`. Use `env.fx.lineTelegraph/circleTelegraph` (≥0.8 s), `env.net.damage()`, `moveToward`, `keepOutOfHarbour`; `onHit` handles phase changes → checkpoint.
- Act: `act2.ts` → `registerAct({ act: 2, region, title, chapters })`, chapter ids continue (7–12). Boss chapters set `fail.ironman` so the checkpoint matters; `rewards.unlockRegion` opens the next region.
- Meters: `RunnerEnv.meters()` returns warmth/fuel/dark (stubbed to full in `soloMode.ts`); the frozen / out-of-fuel fail checks and `warmth_above` already read it, so P3 only implements the meters + HUD. `no_lightning_hits` needs a `{ t: "lightning_hit" }` event fed to `runner.feed()`.

**Rules chosen in P1**: an action-type bonus objective still open when the main is done starts a wrap-up ("return to the dock to finish"). Replays pay 25% XP/coins and no chapter materials. Each completed optional gives +1 region material (+2 on first clear). Boss chapters are ironman. Line overload tension multiplier is capped at ×3.5. Coins: 1 per 2 banked points.

**Debug API** (`?dev=1`, solo): `__dev.step(sec, dt)` (fixed-step frames for throttled tabs), `state()`, `jumpChapter(n)`, `start(n)`, `retry(assist)`, `complete()`, `fail(reason)`, `skipDialogue()`, `setTime("day"|"dusk"|"night"|hour)`, `giveItems()`, `give(mat,n)`, `bait(id,n)`, `setGear(slot,tier)`, `skill(id,rank)`, `catchFish(id,kg,perfect)`, `snap()`, `rollMany(n)`, `autoReel(on)`, `teleport(x,z)`, `bank()`, `damage(n)`, `hitBoss(dmg)`, `killBoss()`, `testChapter("escort"|"defend"|"collect")`. `?touch=1` forces touch mode. Keys: B bait, 1 workshop (dock), 2 chart, R rest (dock), C codex.

**Known gaps for P2+**: the credits screen was removed with the v1 chapter screens (P3 re-adds it after chapter 30); the sail cosmetic is a thin triangle (barely visible from straight behind); the main bundle is >1 MB (consider code-splitting the solo UI).
