/** Act 4: Frozen Fjord. Chapters 19–24 (24 = BOSS: Ice Leviathan). Cold meter + ice floes run in every chapter here. */
import { registerAct } from "./registry.js";
import type { CampaignChapter } from "./types.js";

const R = "frozen_fjord" as const;

const chapters: CampaignChapter[] = [
  {
    id: 19, act: 4, index: 1, region: R, title: "Cold Open", parSeconds: 240,
    intro: [
      "Brr! Welcome to the Frozen Fjord. Out here the cold is the real monster.",
      "Watch the ❄ WARMTH meter. It drains whenever you're away from heat. If it hits zero, you freeze.",
      "I've moored heater buoys out on the water. Light three of them, and warm yourself as you pass.",
      "And mind the ice floes: they drift, and they don't move for anyone. A better Heater in the Workshop slows the cold.",
    ],
    hint: "Hop from buoy to buoy: each one warms you back up. Steer around the floes instead of ramming them, and a Coal Stove (Heater T2) buys you time.",
    main: { id: "heaters", title: "Light 3 heater buoys", kind: { type: "collect", itemKind: "heater_buoy", n: 3 } },
    optional: [
      { id: "warm30", title: "Warmth never below 30%", kind: { type: "warmth_above", pct: 0.3 } },
      { id: "fast", title: "Finish in under 5:00", kind: { type: "under_time", seconds: 300 } },
    ],
    rewards: { xp: 1100, coins: 420, materials: { icepearl: 6 }, text: "The fjord's heater buoys are lit" },
    setup: { zones: ["shallows", "reef"], monsters: "none", startHour: 11, weather: "clear" },
    tips: { start: "❄ Warmth drains away from heat: light the heater buoys (🔥 on the map)" },
  },
  {
    id: 20, act: 4, index: 2, region: R, title: "Under the Ice", parSeconds: 300,
    intro: [
      "The Glacier Char. Red as a forge, and it only feeds where the ice is cracked.",
      "It bites at dusk, near the Ice Cracks east of here. My scale wants one between eight and nine kilos.",
      "Fish too long out there and you'll freeze, so keep an eye on your warmth.",
    ],
    hint: "Wait for dusk (Rest at the dock if it's still day), then fish right beside the glowing Ice Cracks. Heater Buoy IV is close by to warm up.",
    main: { id: "char", title: "Land a Glacier Char of 8–9 kg", kind: { type: "catch_weight_range", speciesId: "glacier_char", minKg: 8, maxKg: 9, n: 1 } },
    optional: [
      { id: "nosnap", title: "No line snaps", kind: { type: "no_snap" } },
      { id: "warm40", title: "Warmth never below 40%", kind: { type: "warmth_above", pct: 0.4 } },
    ],
    rewards: { xp: 1200, coins: 450, materials: { icepearl: 7 } },
    setup: { zones: ["shallows", "reef"], monsters: "random", startHour: 16.2, targetWeight: { speciesId: "glacier_char", minKg: 8, maxKg: 9, chance: 0.4 } },
    tips: { rest: "Rest at the dock to skip to dusk", night: "" },
  },
  {
    id: 21, act: 4, index: 3, region: R, title: "Aurora Hunt", parSeconds: 300,
    intro: [
      "Have you seen the northern lights, sailor? Green fire across the whole sky.",
      "When they dance, the Aurora Koi rises to watch. Dark alone won't do: it wants the lights.",
      "They come out a little after nightfall, from about nine until three in the morning.",
    ],
    hint: "Rest until night, then wait for the aurora (from 21:00). Fish anywhere while the sky glows green, and warm up at the buoys in between.",
    main: { id: "koi", title: "Catch the Aurora Koi", kind: { type: "catch_species", ids: ["aurora_koi"], n: 1 } },
    optional: [
      { id: "perfect2", title: "Land 2 perfect reels", kind: { type: "perfect_reel", n: 2 } },
      { id: "nodmg", title: "Take no damage", kind: { type: "no_damage" } },
    ],
    rewards: { xp: 1300, coins: 480, materials: { icepearl: 7 } },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", startHour: 19.2 },
    tips: { night: "🌌 Night has fallen. Wait for the aurora to light the sky" },
  },
  {
    id: 22, act: 4, index: 4, region: R, title: "Frozen Supply", parSeconds: 360,
    intro: [
      "The Northern Camp is out of coal, and the only sled-barge that can carry it is tied to my dock.",
      "Tow it north through the drifting ice. Floes that hit the barge crack its runners, and serpents love a slow target.",
      "Don't sink. Not today: if you go down, the coal goes down with you.",
    ],
    hint: "Go slowly and take wide turns: the barge swings behind you. Floes are the real danger; harpoon any serpent that comes for the barge.",
    main: { id: "tow", title: "Tow the sled-barge to the Northern Camp", kind: { type: "escort", npcId: "barge", toPointId: "north_camp" } },
    optional: [
      { id: "hp60", title: "Barge above 60%", kind: { type: "escort", npcId: "barge", toPointId: "north_camp", minHpPct: 0.6 } },
      { id: "fast", title: "Finish in under 7:00", kind: { type: "under_time", seconds: 420 } },
    ],
    fail: { ironman: true },
    rewards: { xp: 1400, coins: 520, materials: { icepearl: 8 } },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", startHour: 10, weather: "clear", npcs: [{ id: "barge", name: "Sled-Barge", hp: 140, mode: "tow", at: "dock" }] },
  },
  {
    id: 23, act: 4, index: 5, region: R, title: "Deep Freeze", parSeconds: 420,
    intro: [
      "A blizzard's coming, and blizzards bring the big fish up. Also frostbite.",
      "Eight fish in a row, no snapped lines. In this weather your warmth will drain twice as fast.",
      "Fish close to a heater buoy if you're smart. And if you see something huge on the line, it might be Epic.",
    ],
    hint: "Fish within reach of a heater buoy (or the dock) so you can warm up between bites. A snap resets the streak, so ease off when tension climbs.",
    main: { id: "streak8", title: "A streak of 8 in the blizzard", kind: { type: "streak", n: 8 } },
    optional: [
      { id: "warm30", title: "Warmth never below 30%", kind: { type: "warmth_above", pct: 0.3 } },
      { id: "epic", title: "Land an Epic fish", kind: { type: "catch_tier", tier: "epic", n: 1 } },
    ],
    rewards: { xp: 1500, coins: 560, materials: { icepearl: 9 }, text: "Something huge stirs under the ice sheet…" },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", weather: "storm", startHour: 12, speciesBoost: { berg_halibut: 2.2 } },
  },
  {
    id: 24, act: 4, index: 6, region: R, title: "BOSS: Ice Leviathan", boss: "ice_leviathan", parSeconds: 300,
    intro: [
      "There it is: the ice sheet north of the dock. Something under it has been eating my heater buoys.",
      "It hides beneath the plates. Harpoon a plate to crack it; break the one it's under and it's exposed.",
      "When it rears up, a blue cone shows where its frost breath will land. Get out of the cone or you'll freeze solid!",
      "If it gets angry it'll start throwing floes at you. Watch for the line and dodge.",
    ],
    hint: "Keep moving around the sheet. Follow its glowing shadow, crack that plate (two hits), then unload on it. Dodge the blue cone sideways and warm up at the dock if you're cold.",
    main: { id: "boss", title: "Defeat the Ice Leviathan", kind: { type: "kill", target: "boss", n: 1 } },
    optional: [
      { id: "nofreeze", title: "Never frozen by its breath", kind: { type: "no_frozen" } },
      { id: "fast", title: "Win in under 6:00", kind: { type: "under_time", seconds: 360 } },
    ],
    fail: { ironman: true },
    outro: [
      "The ice is singing! That's the Leviathan's heart you're holding, still warm. Keep it close.",
      "Past the fjord the sea drops away into the Abyss Trench. No sun ever rises there.",
      "Fill your lantern before you go. In the Trench, light is life.",
    ],
    rewards: { xp: 2000, coins: 900, materials: { icepearl: 14 }, unlockRegion: "abyss_trench", text: "Abyss Trench unlocked on the Sea Chart" },
    setup: { zones: ["shallows", "reef"], monsters: "none", startHour: 13, weather: "clear" },
  },
];

registerAct({ act: 4, region: R, title: "Frozen Fjord", chapters });
