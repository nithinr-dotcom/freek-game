/** Act 1: Shallows Bay. Chapters 1–6 (6 = BOSS: Reef Serpent). */
import { registerAct } from "./registry.js";
import type { CampaignChapter } from "./types.js";

const R = "shallows_bay" as const;

const chapters: CampaignChapter[] = [
  {
    id: 1, act: 1, index: 1, region: R, title: "First Cast", parSeconds: 300,
    intro: [
      "Ahoy there, young sailor! Name's Marlow. I've kept this lighthouse lit for forty years.",
      "Hold SPACE (or the CAST button) to charge a cast, then let go. When the bobber dips, strike!",
      "Keep the fish inside the green zone until the bar fills. Bring three fish home to the golden ring at my dock.",
    ],
    hint: "Strike the moment the bobber dips. In the reel, tap gently: the green zone drifts down when you let go.",
    main: { id: "bank3", title: "Catch 3 fish and bank them", kind: { type: "bank_fish", n: 3 } },
    optional: [
      { id: "perfect", title: "Land a perfect reel", kind: { type: "perfect_reel", n: 1 } },
      { id: "fast", title: "Finish in under 5:00", kind: { type: "under_time", seconds: 300 } },
    ],
    rewards: { xp: 150, coins: 60, materials: { shell: 3 }, text: "The bay is yours to explore" },
    setup: { zones: ["shallows"], monsters: "none", tutorial: true, startHour: 10, weather: "clear" },
  },
  {
    id: 2, act: 1, index: 2, region: R, title: "Line and Sinker", parSeconds: 210,
    intro: [
      "Not bad for a landlubber! Now let's see if you can keep a line in one piece.",
      "Five fish before the tide turns: four minutes on the clock. A snapped line costs time.",
      "The Reef past the buoys holds Rare fish. Bring me two if you can.",
    ],
    hint: "Don't chase every fish. If tension climbs, ease off and let the zone fall back onto the fish.",
    main: { id: "c5", title: "Catch 5 fish", kind: { type: "catch_count", n: 5 } },
    optional: [
      { id: "nosnap", title: "No line snaps", kind: { type: "no_snap" } },
      { id: "rare2", title: "Catch 2 Rare-or-better fish", kind: { type: "catch_tier", tier: "rare", n: 2 } },
    ],
    fail: { timeLimit: 240 },
    rewards: { xp: 260, coins: 90, materials: { shell: 4 }, text: "The Reef is open" },
    setup: { zones: ["shallows", "reef"], monsters: "none", startHour: 11 },
  },
  {
    id: 3, act: 1, index: 3, region: R, title: "Steady Hands", parSeconds: 240,
    intro: [
      "My old scale's been asking for a proper Bay Perch. Not a tiddler, not a whale.",
      "Between 1.0 and 1.2 kilos, mind. Perch live in the shallows near the dock.",
      "And visit the Workshop at the dock: shells and coins buy better gear.",
    ],
    hint: "Perch only live in the Shallows. Keep casting there: about one perch in three hits the right weight.",
    main: { id: "perch", title: "Land a Bay Perch of 1.0–1.2 kg", kind: { type: "catch_weight_range", speciesId: "perch", minKg: 1.0, maxKg: 1.2, n: 1 } },
    optional: [
      { id: "nosnap", title: "No line snaps", kind: { type: "no_snap" } },
      { id: "fast", title: "Finish in under 6:00", kind: { type: "under_time", seconds: 360 } },
    ],
    rewards: { xp: 340, coins: 120, materials: { shell: 5 } },
    setup: { zones: ["shallows", "reef"], monsters: "random", speciesBoost: { perch: 3 }, targetWeight: { speciesId: "perch", minKg: 1.0, maxKg: 1.2, chance: 0.32 } },
  },
  {
    id: 4, act: 1, index: 4, region: R, title: "Night Bite", parSeconds: 240,
    intro: [
      "There's an old wreck north-east of the dock. My brother's boat, once.",
      "When the moon's up, the Moonlit Eel glows around her timbers. Only then, and only there.",
      "Night's a way off yet. Rest at the dock (the moon button) and I'll wake you at dusk.",
    ],
    hint: "Rest at the dock until it's night, then sail to the wreck (the ⚓ marker on the map) and fish within its glow.",
    main: { id: "eel", title: "Catch the Moonlit Eel", kind: { type: "catch_species", ids: ["moonlit_eel"], n: 1 } },
    optional: [
      { id: "bankeel", title: "Bank the eel without taking damage", kind: { type: "bank_species", ids: ["moonlit_eel"], noDamage: true } },
      { id: "fast", title: "Finish within one night (4:00)", kind: { type: "under_time", seconds: 240 } },
    ],
    rewards: { xp: 420, coins: 150, materials: { shell: 6 } },
    setup: { zones: ["shallows", "reef"], monsters: "random", startHour: 15 },
    tips: { rest: "Rest at the dock to skip to nightfall", night: "Night has fallen. Sail to the Old Wreck!" },
  },
  {
    id: 5, act: 1, index: 5, region: R, title: "Bait and Switch", parSeconds: 300,
    intro: [
      "Bluefin Tuna won't look at a bare hook. They want a Silver Sardine.",
      "Catch a sardine and KEEP it as bait (press B or tap the bait slot when I ask). Then fish the Reef.",
      "Tuna are heavy. If your line can't take the weight, the Workshop can braid you a stronger one.",
    ],
    hint: "Sardines bite in the Shallows. Keep one as bait, equip it in the bait slot, then cast past the buoys into the Reef.",
    main: { id: "tuna", title: "Land a Bluefin Tuna on sardine bait", kind: { type: "catch_species", ids: ["tuna"], n: 1 } },
    optional: [
      { id: "streak", title: "A streak of 4 landings", kind: { type: "streak", n: 4 } },
      { id: "nodmg", title: "Take no damage", kind: { type: "no_damage" } },
    ],
    rewards: { xp: 520, coins: 190, materials: { shell: 8 }, text: "The Abyss opens" },
    setup: { zones: ["shallows", "reef", "abyss"], monsters: "random", speciesBoost: { sardine: 2.5 } },
    tips: { bait: "Keep the sardine as bait: press B / tap the bait slot" },
  },
  {
    id: 6, act: 1, index: 6, region: R, title: "BOSS: Reef Serpent", boss: "reef_serpent", parSeconds: 180,
    intro: [
      "That serpent's grown fat on my nets for years. Today it ends.",
      "When it rears up, a red line shows where it'll lunge. Steer out of the line!",
      "Right after a lunge it's slow. That's your moment: harpoon it (F / right-click / 🔱).",
      "Don't you sink out there. If you do, we start again from where the fight turned.",
    ],
    hint: "Keep sailing sideways to the serpent. Dodge the red line, then harpoon it while it recovers after the lunge.",
    main: { id: "boss", title: "Defeat the Reef Serpent", kind: { type: "kill", target: "boss", n: 1 } },
    optional: [
      { id: "nodmg", title: "Take no damage", kind: { type: "no_damage" } },
      { id: "fast", title: "Win in under 3:00", kind: { type: "under_time", seconds: 180 } },
    ],
    fail: { ironman: true },
    outro: [
      "You did it! The Reef Serpent is beaten. Keep that fang: it'll make fine gear one day.",
      "South of the bay lies the Coral Maze. When you're ready, the Sea Chart will take you there.",
    ],
    rewards: { xp: 900, coins: 400, materials: { shell: 12 }, unlockRegion: "coral_maze", text: "Coral Maze unlocked on the Sea Chart" },
    setup: { zones: ["shallows", "reef"], monsters: "none", startHour: 13, weather: "clear" },
  },
];

registerAct({ act: 1, region: R, title: "Shallows Bay", chapters });
