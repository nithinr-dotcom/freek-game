/** Act 2: Coral Maze. Chapters 7–12 (12 = BOSS: Crab Titan). Scripts for 10 and 12 live in client/src/solo/scripts/act2.ts. */
import { registerAct } from "./registry.js";
import { CORAL_SPECIES } from "./species/coralMaze.js";
import type { CampaignChapter } from "./types.js";

const R = "coral_maze" as const;
const pearls = ["pearl_1", "pearl_2", "pearl_3", "pearl_4", "pearl_5", "pearl_6", "pearl_7", "pearl_8"];

const chapters: CampaignChapter[] = [
  {
    id: 7, act: 2, index: 1, region: R, title: "Into the Maze", parSeconds: 180,
    intro: [
      "Welcome to the Coral Maze! Pretty, isn't it? Don't be fooled: those coral walls chew through hulls like biscuits.",
      "Somewhere out in the channels stands the Sunken Arch. Find it for me, and pick up the pearls you pass on the way.",
      "The map shows the walls. Look for the gaps, and don't scrape the coral if you can help it.",
    ],
    hint: "The gaps in the coral rings never line up. Leave the lagoon by its southern gap, then follow the pearls west and north through the channels to the Arch in the north-west.",
    main: { id: "arch", title: "Reach the Sunken Arch with 5 pearls", kind: { type: "all", parts: [{ type: "collect", itemKind: "pearl", n: 5 }, { type: "reach", pointId: "sunken_arch" }] } },
    optional: [
      { id: "nodmg", title: "No hull damage", kind: { type: "no_damage" } },
      { id: "fast", title: "Finish in under 4:00", kind: { type: "under_time", seconds: 240 } },
    ],
    rewards: { xp: 700, coins: 240, materials: { coral: 6 }, text: "The channels are open" },
    setup: { zones: ["shallows", "reef"], monsters: "none", startHour: 10, weather: "clear", pickups: [{ kind: "pearl", points: pearls }] },
  },
  {
    id: 8, act: 2, index: 2, region: R, title: "Colour Hunt", parSeconds: 300,
    intro: [
      "Every fish in this maze wears a different coat. My granddaughter wants to paint them all.",
      "Bring me four different Coral Maze species. A Gold one would make her week.",
      "Some only show themselves in special places, like the Arch. The Codex keeps track of who you've met.",
    ],
    hint: "Fish both the lagoon and the channels: each band holds different species. The Arch Angelfish only bites near the Sunken Arch.",
    main: { id: "four", title: "Catch 4 different Coral species", kind: { type: "catch_species", ids: CORAL_SPECIES.map((s) => s.id), n: 4, distinct: true } },
    optional: [
      { id: "gold", title: "Catch a Gold fish", kind: { type: "catch_tier", tier: "gold", n: 1 } },
      { id: "perfect", title: "Land 2 perfect reels", kind: { type: "perfect_reel", n: 2 } },
    ],
    rewards: { xp: 820, coins: 280, materials: { coral: 7 } },
    setup: { zones: ["shallows", "reef"], monsters: "random", startHour: 12 },
  },
  {
    id: 9, act: 2, index: 3, region: R, title: "Salvage Run", parSeconds: 300,
    intro: [
      "Three ships died in this maze. Their cargo still floats around the wrecks: six crates, by my count.",
      "Fetch them all. But mind: if you sink out there, the sea keeps the lot and we start over. Ironman rules.",
      "Two crates by the Brine Wreck, two by the Coral Wreck, and two out by the Deep Wreck past the outer wall.",
    ],
    hint: "The ⚓ icons on the map are the wrecks. Brine Wreck: the south-east channel. Coral Wreck: the dead end north of the lagoon. Deep Wreck: west, past the outer wall (leave the maze through its southern gap).",
    main: { id: "crates", title: "Collect 6 wreck crates", kind: { type: "collect", itemKind: "crate", n: 6 } },
    optional: [
      { id: "nodmg", title: "Take no damage", kind: { type: "no_damage" } },
      { id: "fast", title: "Finish in under 6:00", kind: { type: "under_time", seconds: 360 } },
    ],
    fail: { ironman: true },
    rewards: { xp: 900, coins: 320, materials: { coral: 8 }, text: "The deep water past the maze is open" },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", startHour: 9, pickups: [{ kind: "crate", points: ["crate_1", "crate_2", "crate_3", "crate_4", "crate_5", "crate_6"] }] },
  },
  {
    id: 10, act: 2, index: 4, region: R, title: "Pearl Diver", parSeconds: 240,
    intro: [
      "Trouble! Nell the pearl diver's engine died in the Diver's Grotto, deep in the northern channels.",
      "Sail out, throw her a line, and tow her back to the lagoon. Her boat's thin-skinned: every coral scrape and every bite hurts.",
      "Serpents love an easy meal. Keep them off her with the harpoon.",
    ],
    hint: "Sail close to Nell to hook the tow rope, then take wide, slow turns so her boat doesn't cut the corners into the coral. Harpoon any serpent before it reaches her.",
    main: { id: "tow", title: "Tow Nell back to the lagoon", kind: { type: "escort", npcId: "nell", toPointId: "lagoon_mouth" } },
    optional: [
      { id: "hp", title: "Nell's boat above 75%", kind: { type: "escort", npcId: "nell", toPointId: "lagoon_mouth", minHpPct: 0.75 } },
      { id: "fast", title: "Finish in under 5:00", kind: { type: "under_time", seconds: 300 } },
    ],
    rewards: { xp: 1000, coins: 360, materials: { coral: 9 } },
    setup: { zones: ["shallows", "reef"], monsters: "none", startHour: 14, npcs: [{ id: "nell", name: "Nell's Pearl Boat", hp: 120, mode: "tow", at: "diver_grotto" }] },
  },
  {
    id: 11, act: 2, index: 5, region: R, title: "Greed", parSeconds: 330,
    intro: [
      "Nell says the deep channels are thick with big fish. Big fish mean big money, and big money means a heavy boat.",
      "Bring home 600 points in a single trip. The more you carry, the slower you sail, so pick your moment to come home.",
      "And don't sink! Whatever's in the hold goes down with you.",
    ],
    hint: "Fish the outer channels and the deep water for Gold and Epic fish, then bank everything in one go. Upgrade the hull to carry more without slowing down.",
    main: { id: "greed", title: "Bank 600 points in one trip", kind: { type: "bank_points_trip", n: 600 } },
    optional: [
      { id: "nosink", title: "Don't sink", kind: { type: "no_sink" } },
      { id: "epic", title: "Land an Epic fish", kind: { type: "catch_tier", tier: "epic", n: 1 } },
    ],
    rewards: { xp: 1100, coins: 420, materials: { coral: 10 } },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", startHour: 11 },
  },
  {
    id: 12, act: 2, index: 6, region: R, title: "BOSS: Crab Titan", boss: "crab_titan", parSeconds: 240,
    intro: [
      "The ground under the lagoon is moving. That's no reef, sailor: that's the Crab Titan.",
      "Its shell turns harpoons. When it raises its claws, red circles show where they'll slam. Get out of them!",
      "After a slam its shell cracks open for three seconds. Harpoon the glowing heart then: every hit's a critical.",
      "When it's hurt it calls its brood. Little crabs latch onto the hull and nibble: harpoon them off fast.",
    ],
    hint: "Keep moving in a wide circle. Dodge the two red circles, then turn and harpoon the open shell. In phase 2, harpoon latched crabs first (aim at your own boat).",
    main: { id: "boss", title: "Defeat the Crab Titan", kind: { type: "kill", target: "boss", n: 1 } },
    optional: [
      { id: "crabs", title: "Remove every latched crab within 3 s", kind: { type: "no_flag", flag: "crab_latched_long" } },
      { id: "fast", title: "Win in under 5:00", kind: { type: "under_time", seconds: 300 } },
    ],
    fail: { ironman: true },
    outro: [
      "The Titan's down! Its carapace will make armour fit for a queen. Or a sturdy hull, at least.",
      "Beyond the maze the wind never sleeps: Stormbreak Strait. Bring a strong line, the fish there pull like oxen.",
    ],
    rewards: { xp: 1400, coins: 600, materials: { coral: 14 }, unlockRegion: "stormbreak", text: "Stormbreak Strait unlocked on the Sea Chart" },
    setup: { zones: ["shallows"], monsters: "none", startHour: 13, weather: "clear" },
  },
];

registerAct({ act: 2, region: R, title: "Coral Maze", chapters });
