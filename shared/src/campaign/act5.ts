/** Act 5: Abyss Trench. Chapters 25–30 (30 = FINAL BOSS: Maelstrom Eye + the Eye Duel, then the credits). */
import { registerAct } from "./registry.js";
import { ABYSS_SPECIES_IDS } from "./species/abyssTrench.js";
import type { CampaignChapter } from "./types.js";

const R = "abyss_trench" as const;

const chapters: CampaignChapter[] = [
  {
    id: 25, act: 5, index: 1, region: R, title: "Lights Out", parSeconds: 240,
    intro: [
      "This is the Abyss Trench. The sun never rises here. Never.",
      "Your lantern is all that stands between you and the dark. As its fuel burns down, the dark closes in.",
      "Pick up the fuel cans floating on the way to the Glow Reef, south-west of the dock. Run dry for ten seconds and you're lost.",
    ],
    hint: "Follow the fuel cans (⛽ on the map): they lead to the Glow Reef. The dock refills your lantern, and so does every Lanternfish you land.",
    main: {
      id: "reef", title: "Reach the Glow Reef, collecting 5 lantern fuel",
      kind: { type: "all", parts: [{ type: "collect", itemKind: "fuel", n: 5 }, { type: "reach", pointId: "glow_reef" }] },
    },
    optional: [
      { id: "fuel", title: "Never run out of fuel", kind: { type: "fuel_above", pct: 0 } },
      { id: "fast", title: "Finish in under 5:00", kind: { type: "under_time", seconds: 300 } },
    ],
    rewards: { xp: 1700, coins: 600, materials: { abyssink: 6 } },
    setup: { zones: ["shallows", "reef"], monsters: "none", pickups: [{ kind: "fuel", points: ["random:9"] }] },
    tips: { start: "🏮 Lantern fuel sets how far you can see. Grab the ⛽ cans!" },
  },
  {
    id: 26, act: 5, index: 2, region: R, title: "Horrors Below", parSeconds: 300,
    intro: [
      "Something with a light on its head has been circling my dock. Deep horrors: anglers the size of a boat.",
      "They lure you close, then they lunge. When you see the red line, steer out of it.",
      "Hold out for three minutes while they hunt you, and bring in four fish from the Trench while you're at it.",
    ],
    hint: "Keep the boat moving between casts. A horror rears up before it lunges: dodge the red line, then harpoon it while it recovers.",
    main: {
      id: "horrors", title: "Survive 3:00 of horrors while catching 4 Abyss fish",
      kind: { type: "all", parts: [{ type: "survive", seconds: 180, condition: "monsters" }, { type: "catch_species", ids: ABYSS_SPECIES_IDS, n: 4 }] },
    },
    optional: [
      { id: "nodmg", title: "Take no damage", kind: { type: "no_damage" } },
      { id: "gold2", title: "Catch 2 Gold-or-better fish", kind: { type: "catch_tier", tier: "gold", n: 2 } },
    ],
    rewards: { xp: 1800, coins: 640, materials: { abyssink: 7 } },
    setup: { zones: ["shallows", "reef"], monsters: "random" },
  },
  {
    id: 27, act: 5, index: 3, region: R, title: "The Chain", parSeconds: 420,
    intro: [
      "Down here everything eats something that glows. Let's use that.",
      "Catch a Lanternfish and keep it as bait. A Void Eel can't resist the light.",
      "Then keep the Void Eel as bait. The Abyssal Shark eats the eels. Three links, one chain.",
    ],
    hint: "Lanternfish bite everywhere. Keep one, equip it (B), land a Void Eel, keep that too, equip it, and fish past the buoys for the Abyssal Shark.",
    main: { id: "shark", title: "Land an Abyssal Shark (Lanternfish → Void Eel → Shark)", kind: { type: "catch_species", ids: ["abyssal_shark"], n: 1 } },
    optional: [
      { id: "streak3", title: "A streak of 3 landings", kind: { type: "streak", n: 3 } },
      { id: "nosink", title: "Never sink", kind: { type: "no_sink" } },
    ],
    rewards: { xp: 1900, coins: 680, materials: { abyssink: 8 } },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", speciesBoost: { lanternfish: 2.5 } },
    tips: { bait: "Keep it as bait: press B / tap the bait slot" },
  },
  {
    id: 28, act: 5, index: 4, region: R, title: "Into the Dark", parSeconds: 480,
    intro: [
      "The deepest water, far past the buoys. Nothing out there is small.",
      "Three Epic fish or better, and you've got ten minutes before the cold and the dark get you.",
      "No second chances: sink and we start over. If the Drowned Star shows itself… well. Legends are legends.",
    ],
    hint: "Fish in the outer Abyss ring, where Epics are most common. Bank often: a sinking boat loses everything. Bring a strong line (T4) for the heavy ones.",
    main: { id: "epic3", title: "Land 3 Epic-or-better fish", kind: { type: "catch_tier", tier: "epic", n: 3 } },
    optional: [
      { id: "legend", title: "Land a Legendary fish", kind: { type: "catch_tier", tier: "legendary", n: 1 } },
      { id: "perfect2", title: "Land 2 perfect reels", kind: { type: "perfect_reel", n: 2 } },
    ],
    fail: { ironman: true, timeLimit: 600 },
    rewards: { xp: 2100, coins: 760, materials: { abyssink: 9 } },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", speciesBoost: { drowned_star: 1.5, pale_gulper: 1.8 } },
  },
  {
    id: 29, act: 5, index: 5, region: R, title: "The Last Light", parSeconds: 420,
    intro: [
      "It's time, sailor. The Maelstrom has swallowed every ship that ever sailed the Trench, my brother's among them.",
      "I'm coming with you. Tow my old boat to the Maelstrom's edge; I'll keep the lamp lit while you fight.",
      "The horrors will come for me. Don't let them.",
    ],
    hint: "Tow Marlow slowly and keep him behind you. Harpoon horrors before they reach him; the dock and the Glow Reef are safe spots to refuel.",
    main: { id: "tow", title: "Tow Marlow's boat to the Maelstrom's edge", kind: { type: "escort", npcId: "marlow", toPointId: "maelstrom_edge" } },
    optional: [
      { id: "hp75", title: "Marlow's boat above 75%", kind: { type: "escort", npcId: "marlow", toPointId: "maelstrom_edge", minHpPct: 0.75 } },
      { id: "fast", title: "Finish in under 8:00", kind: { type: "under_time", seconds: 480 } },
    ],
    rewards: { xp: 2300, coins: 820, materials: { abyssink: 10 }, text: "The Maelstrom awaits" },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", npcs: [{ id: "marlow", name: "Marlow's Boat", hp: 160, mode: "tow", at: "dock" }] },
  },
  {
    id: 30, act: 5, index: 6, region: R, title: "FINAL BOSS: Maelstrom Eye", boss: "maelstrom_eye", parSeconds: 420,
    intro: [
      "There. The whirlpool at the heart of the Trench, and the Eye at the bottom of it.",
      "The current will pull you in. Sail against it, and never let it drag you to the centre.",
      "The Eye opens to look at you. That's when you harpoon it. Horrors will come out of the deep to protect it.",
      "When it's weak it'll try to drag you under. Then it's you and your reel against the Maelstrom. Hold on, sailor!",
    ],
    hint: "Circle the whirlpool's rim at full sail; only cut in when the Eye opens (it glows first). In the Eye Duel, hold the zone on the Eye: it changes pattern every few seconds.",
    main: { id: "boss", title: "Defeat the Maelstrom Eye", kind: { type: "kill", target: "boss", n: 1 } },
    optional: [
      { id: "nosink", title: "Never sink", kind: { type: "no_sink" } },
      { id: "fast", title: "Win in under 8:00", kind: { type: "under_time", seconds: 480 } },
    ],
    fail: { ironman: true },
    outro: [
      "It's… it's over. The water's going still. Look, sailor: the dark is lifting.",
      "Forty years I kept that lamp lit, waiting for someone to break the tide. It was you.",
    ],
    rewards: { xp: 3000, coins: 1500, materials: { abyssink: 16 }, text: "Free Play in every sea · Hard mode unlocked" },
    setup: { zones: ["shallows", "reef"], monsters: "none" },
  },
];

registerAct({ act: 5, region: R, title: "Abyss Trench", chapters });
