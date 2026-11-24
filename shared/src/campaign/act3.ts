/** Act 3: Stormbreak Strait. Chapters 13–18 (18 = BOSS: Storm Kraken). Scripts: client/src/solo/scripts/act3.ts. */
import { registerAct } from "./registry.js";
import type { CampaignChapter } from "./types.js";

const R = "stormbreak" as const;

const chapters: CampaignChapter[] = [
  {
    id: 13, act: 3, index: 1, region: R, title: "Weathering", parSeconds: 200,
    intro: [
      "Stormbreak Strait. The wind here hasn't stopped since my grandmother was a girl.",
      "A storm's coming in right now, and it's a mean one. Ride it out for two minutes and catch three fish while you're at it.",
      "When lightning's about to strike, a yellow circle marks the spot. Don't be inside it!",
    ],
    hint: "Keep the boat moving between casts: the lightning aims a little ahead of you, so change course when a yellow circle appears. Reel in if a circle lands on you.",
    main: { id: "weather", title: "Survive 2:00 of storm while catching 3 fish", kind: { type: "all", parts: [{ type: "survive", seconds: 120, condition: "storm" }, { type: "catch_count", n: 3 }] } },
    optional: [
      { id: "nolight", title: "No lightning hits", kind: { type: "no_lightning_hits" } },
      { id: "perfect", title: "Land a perfect reel", kind: { type: "perfect_reel", n: 1 } },
    ],
    rewards: { xp: 1300, coins: 450, materials: { stormglass: 6 }, text: "The Strait is charted" },
    setup: { zones: ["shallows", "reef"], monsters: "none", startHour: 15, weather: "storm" },
    tips: { start: "Yellow circle = lightning in a moment. Steer out of it!" },
  },
  {
    id: 14, act: 3, index: 2, region: R, title: "Gust Rider", parSeconds: 300,
    intro: [
      "The Stormscale Tuna rides the wind. It only bites when a gust howls through the Strait.",
      "Watch the wind meter: when it flashes GUST, that's when your bobber should be in the water.",
      "And before you go chasing tuna, check my three marker buoys are still afloat. Touch each one.",
    ],
    hint: "Cast in the Reef and wait for the GUST on the wind meter: strike during the gust. Touch the three buoys (📍 dots on the map) before you land the tuna.",
    main: { id: "tuna", title: "Catch a Stormscale Tuna", kind: { type: "catch_species", ids: ["stormscale_tuna"], n: 1 } },
    optional: [
      { id: "buoys", title: "Reach 3 marker buoys before the tuna", kind: { type: "collect", itemKind: "buoy", n: 3 } },
      { id: "fast", title: "Finish in under 6:00", kind: { type: "under_time", seconds: 360 } },
    ],
    rewards: { xp: 1400, coins: 480, materials: { stormglass: 7 } },
    setup: { zones: ["shallows", "reef"], monsters: "random", startHour: 10, weather: "clear", pickups: [{ kind: "buoy", points: ["buoy_1", "buoy_2", "buoy_3"] }] },
  },
  {
    id: 15, act: 3, index: 3, region: R, title: "Lighthouse Down", parSeconds: 300,
    intro: [
      "Lightning smashed the lens of the Strait's lighthouse. Without it, ships pile onto the stacks.",
      "Storm glass can fix it: it washes up around the wrecks. Bring me four pieces within six minutes.",
      "Ironman, mind. If you sink, the glass sinks with you.",
    ],
    hint: "There's glass at every wreck (⚓ on the map). Grab the nearest four, dodging the yellow circles, and bank a few fish on the way back for the bonus.",
    main: { id: "glass", title: "Collect 4 Storm Glass from the wrecks", kind: { type: "collect", itemKind: "stormglass", n: 4 } },
    optional: [
      { id: "nodmg", title: "Take no damage", kind: { type: "no_damage" } },
      { id: "bank", title: "Bank 200 points in one trip", kind: { type: "bank_points_trip", n: 200 } },
    ],
    fail: { ironman: true, timeLimit: 360 },
    rewards: { xp: 1500, coins: 520, materials: { stormglass: 8 }, text: "The deep water of the Strait is open" },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", startHour: 18, pickups: [{ kind: "stormglass", points: ["glass_1", "glass_2", "glass_3", "glass_4", "glass_5"] }] },
  },
  {
    id: 16, act: 3, index: 4, region: R, title: "Line Breaker", parSeconds: 360,
    intro: [
      "Out in the deep water swims the Thunder Marlin: over a hundred and twenty kilos of bad temper.",
      "It thrashes like a sail in a gale. A weak line won't last a second: you need a Sharkline (line T3) or better.",
      "Visit the Workshop first. Then land me that marlin without snapping a single line.",
    ],
    hint: "Craft line T3 (150 kg) at the Workshop. Then fish the Abyss (past the orange buoys): about every second bite there is the marlin. Ease off when it jerks.",
    main: { id: "marlin", title: "Land a Thunder Marlin", kind: { type: "catch_species", ids: ["thunder_marlin"], n: 1 } },
    optional: [
      { id: "nosnap", title: "No line snaps", kind: { type: "no_snap" } },
      { id: "streak", title: "A streak of 3 landings", kind: { type: "streak", n: 3 } },
    ],
    rewards: { xp: 1600, coins: 560, materials: { stormglass: 9 } },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", startHour: 11, speciesBoost: { thunder_marlin: 6 } },
  },
  {
    id: 17, act: 3, index: 5, region: R, title: "Hold the Line", parSeconds: 200,
    intro: [
      "The supply ship's moored in the Reef with food for the whole lighthouse. Serpents have smelled it.",
      "Keep her afloat for three minutes. They'll come in waves, and they'll go for the ship, not for you.",
      "Harpoon early and harpoon often!",
    ],
    hint: "Stay right next to the ship and harpoon each serpent as it surfaces. Two harpoon hits stun a serpent's charge; four or five sink it.",
    main: { id: "hold", title: "Defend the supply ship for 3:00", kind: { type: "defend", npcId: "supply", seconds: 180 } },
    optional: [
      { id: "hp", title: "Ship above 50%", kind: { type: "defend", npcId: "supply", seconds: 180, minHpPct: 0.5 } },
      { id: "hits", title: "10 harpoon hits", kind: { type: "harpoon_hits", n: 10 } },
    ],
    rewards: { xp: 1700, coins: 600, materials: { stormglass: 10 } },
    setup: { zones: ["shallows", "reef"], monsters: "none", startHour: 12, npcs: [{ id: "supply", name: "Supply Ship", hp: 480, mode: "moored", at: "supply_moor" }] },
  },
  {
    id: 18, act: 3, index: 6, region: R, title: "BOSS: Storm Kraken", boss: "storm_kraken", parSeconds: 300,
    intro: [
      "Every storm in the Strait is born in one place: the Kraken's Deep. The beast down there calls the lightning.",
      "Four tentacles guard it. Each one can be cut down; when all four are gone, the head comes up. That's your target.",
      "When it's hurt it spits ink: the sky goes black and two tentacles grow back. Keep your eyes on the yellow circles!",
      "Ironman again. If it sinks you, we restart from the phase you reached.",
    ],
    hint: "Circle the Kraken at harpoon range. Cut the tentacles one by one (their red circles show the slams), dodge the yellow lightning circles, then harpoon the head when it surfaces.",
    main: { id: "boss", title: "Defeat the Storm Kraken", kind: { type: "kill", target: "boss", n: 1 } },
    optional: [
      { id: "nolight", title: "No lightning hits", kind: { type: "no_lightning_hits" } },
      { id: "fast", title: "Win in under 6:00", kind: { type: "under_time", seconds: 360 } },
    ],
    fail: { ironman: true },
    outro: [
      "The sky's clearing for the first time in a hundred years! You've tamed the Strait, sailor.",
      "North of here the sea freezes solid: the Frozen Fjord. Pack a heater. Something enormous sleeps under that ice.",
    ],
    rewards: { xp: 2000, coins: 800, materials: { stormglass: 16 }, unlockRegion: "frozen_fjord", text: "Frozen Fjord unlocked on the Sea Chart" },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "none", startHour: 16, weather: "storm" },
  },
];

registerAct({ act: 3, region: R, title: "Stormbreak Strait", chapters });
