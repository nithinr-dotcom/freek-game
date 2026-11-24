/**
 * Endless Tide (single-player roguelite mode) data: stats, rigs, trinkets, captains, danger levels, biomes,
 * tide modifiers, companions and unlocks. Pure data; the rules live in ./rules.ts and the client in client/src/endless.
 * See docs/ENDLESS.md.
 */
import type { RegionId } from "../campaign/types.js";
import type { Tier } from "../fish.js";

// ------------------------------------------------------------------------------------------------ stats
export const STAT_IDS = [
  "maxHp", "regen", "armor", "speed", "reel", "zone", "line", "bite", "luck",
  "harpoon", "fireRate", "range", "engineering", "magnet", "haul", "interest",
] as const;
export type StatId = (typeof STAT_IDS)[number];
export type Stats = Record<StatId, number>;

export const STAT_INFO: Record<StatId, { label: string; icon: string; unit: string; desc: string }> = {
  maxHp: { label: "Max HP", icon: "❤", unit: "", desc: "Hull points. At 0 the run is over. Diminishing returns above 180." },
  regen: { label: "Hull Regen", icon: "🔧", unit: "/s", desc: "HP repaired per second. Diminishing returns above 1.5/s." },
  armor: { label: "Armor", icon: "🛡", unit: "", desc: "Each point blocks a share of monster and hazard damage. Diminishing returns above 12." },
  speed: { label: "Speed", icon: "⛵", unit: "%", desc: "Boat speed." },
  reel: { label: "Reel Power", icon: "⚙", unit: "%", desc: "How fast the catch bar fills when you reel by hand." },
  zone: { label: "Catch Zone", icon: "🟩", unit: "%", desc: "Size of the green zone in the reel minigame." },
  line: { label: "Line Strength", icon: "🧵", unit: "%", desc: "Heavy fish build less tension." },
  bite: { label: "Bite Speed", icon: "🪱", unit: "%", desc: "Fish bite sooner on your hand line." },
  luck: { label: "Luck", icon: "🍀", unit: "", desc: "Better fish tiers, and rarer items in the shop and at level-up. Diminishing returns above 40." },
  harpoon: { label: "Harpoon Dmg", icon: "🔱", unit: "%", desc: "Damage of your harpoon and harpoon rigs (half as much for charges and drones). Diminishing returns above 40%." },
  fireRate: { label: "Fire Rate", icon: "⏩", unit: "%", desc: "Attack speed of your harpoon and harpoon rigs. Diminishing returns above 30%." },
  range: { label: "Range", icon: "🔭", unit: "%", desc: "Reach of rigs (rods, nets, guns). Diminishing returns above 30%." },
  engineering: { label: "Engineering", icon: "🛠", unit: "%", desc: "Rigs work faster (shorter cooldowns, quicker trolling). Diminishing returns above 40%." },
  magnet: { label: "Magnet", icon: "🧲", unit: "m", desc: "Radius that pulls in floating loot." },
  haul: { label: "Haul", icon: "💰", unit: "%", desc: "Coins from the hold at cash-in. Diminishing returns above 25%." },
  interest: { label: "Interest", icon: "🏦", unit: "%", desc: "Coins you keep unspent earn this much when the next tide starts (capped)." },
};

export const BASE_STATS: Stats = {
  maxHp: 100, regen: 0, armor: 0, speed: 0, reel: 0, zone: 0, line: 0, bite: 0, luck: 0,
  harpoon: 0, fireRate: 0, range: 0, engineering: 0, magnet: 7, haul: 0, interest: 0,
};

/** level-up stat step (×1 common, ×2 rare, ×3 gold, ×5 epic) */
export const LEVEL_STEP: Record<StatId, number> = {
  maxHp: 6, regen: 0.15, armor: 1, speed: 3, reel: 5, zone: 3, line: 6, bite: 5, luck: 5,
  harpoon: 5, fireRate: 4, range: 6, engineering: 3, magnet: 1, haul: 4, interest: 2,
};

export type Rarity = "common" | "rare" | "gold" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "rare", "gold", "epic", "legendary"];
export const RARITY_INFO: Record<Rarity, { label: string; color: string; mult: number }> = {
  common: { label: "Common", color: "#b0b8c0", mult: 1 },
  rare: { label: "Rare", color: "#3fa9ff", mult: 2 },
  gold: { label: "Gold", color: "#ffc93c", mult: 3 },
  epic: { label: "Epic", color: "#b05cff", mult: 5 },
  legendary: { label: "Legendary", color: "#ff5a1f", mult: 8 },
};

// ------------------------------------------------------------------------------------------------ rigs
export type RigClass = "rod" | "net" | "harpoon" | "explosive" | "support";
export const RIG_CLASS_INFO: Record<RigClass, { label: string; icon: string; color: string; sets: { n: number; text: string }[] }> = {
  rod: { label: "Rods", icon: "🎣", color: "#3fd0c9", sets: [{ n: 2, text: "Rigs catch 10% faster" }, { n: 4, text: "Rigs catch 25% faster" }, { n: 6, text: "Rigs catch 50% faster" }] },
  net: { label: "Nets", icon: "🕸", color: "#7fdc6a", sets: [{ n: 2, text: "Nets bag +1 fish" }, { n: 3, text: "Nets also scoop up loot" }] },
  harpoon: { label: "Harpoons", icon: "🔱", color: "#ff6b5a", sets: [{ n: 2, text: "+1 pierce" }, { n: 4, text: "+2 pierce, +10% damage" }] },
  explosive: { label: "Explosives", icon: "💣", color: "#ffa13a", sets: [{ n: 2, text: "Blast radius +30%" }] },
  support: { label: "Support", icon: "✨", color: "#c9a2ff", sets: [{ n: 2, text: "+2 Hull Regen" }] },
};

export interface RigDef {
  id: string; name: string; icon: string; cls: RigClass;
  /** base price at tier I */
  price: number;
  /** seconds between activations per tier I..IV (before Engineering / Fire Rate) */
  cooldown: [number, number, number, number];
  /** main value per tier (damage, fish per action, …) */
  power: [number, number, number, number];
  /** reach in metres (before Range) */
  range: number;
  desc: (tier: number, power: number) => string;
  unlock?: string;
}
export const RIG_TIER_LABEL = ["I", "II", "III", "IV"];
export const RIG_TIER_PRICE = [1, 1.9, 3.4, 6];
export const MAX_RIG_TIER = 4;

export const RIGS: RigDef[] = [
  { id: "bobber", name: "Bobber Rod", icon: "🎣", cls: "rod", price: 32, cooldown: [3.2, 2.8, 2.4, 2], power: [1, 2, 2, 3], range: 32,
    desc: (_t, p) => `Hooks ${p} fish from the nearest school in range on its own.` },
  { id: "trolling", name: "Trolling Line", icon: "〰", cls: "rod", price: 36, cooldown: [1, 1, 1, 1], power: [26, 22, 18, 14], range: 0,
    desc: (_t, p) => `Trails behind the boat: one fish every ${p} m sailed.` },
  { id: "deep", name: "Deep Line", icon: "⚓", cls: "rod", price: 56, cooldown: [24, 20, 16, 12], power: [1, 1, 1, 2], range: 0,
    desc: (_t, p) => `Hold still (slow speed) and it lands ${p} Gold-or-better fish.` },
  { id: "castnet", name: "Cast Net", icon: "🕸", cls: "net", price: 40, cooldown: [7, 6.2, 5.4, 4.6], power: [3, 4, 5, 7], range: 15,
    desc: (_t, p) => `Throws a net over the nearest school in range and bags up to ${p} fish.`, },
  { id: "trawl", name: "Trawl Net", icon: "🧺", cls: "net", price: 52, cooldown: [9, 8, 7, 6], power: [2, 3, 4, 6], range: 30,
    desc: (_t, p) => `Drags every school in range: ${p} fish shared out between them.`, unlock: "tide_8" },
  { id: "harpoongun", name: "Harpoon Gun", icon: "🔱", cls: "harpoon", price: 36, cooldown: [1.6, 1.4, 1.2, 1], power: [16, 26, 42, 66], range: 42,
    desc: (_t, p) => `Fires at the nearest monster on its own: ${p} damage.` },
  { id: "chain", name: "Chain Harpoon", icon: "⛓", cls: "harpoon", price: 52, cooldown: [2.4, 2.1, 1.8, 1.5], power: [12, 20, 32, 50], range: 38,
    desc: (t, p) => `${p} damage that jumps to ${t >= 3 ? 3 : 2} more monsters.` },
  { id: "charge", name: "Depth Charge", icon: "💣", cls: "explosive", price: 48, cooldown: [6, 5.2, 4.5, 3.8], power: [42, 70, 110, 170], range: 34,
    desc: (_t, p) => `Blast for ${p} damage (r 10 m). Dropped on a school it stuns fish into your hold.` },
  { id: "chum", name: "Chum Bucket", icon: "🪣", cls: "support", price: 28, cooldown: [1, 1, 1, 1], power: [2, 3, 4, 5.5], range: 48,
    desc: (_t, p) => `Schools within 48 m drift to you at ${p} m/s. Your hand line bites ${Math.round(p * 6)}% sooner.` },
  { id: "drone", name: "Lantern Drone", icon: "🏮", cls: "support", price: 44, cooldown: [1, 0.9, 0.8, 0.7], power: [8, 14, 22, 34], range: 15,
    desc: (_t, p) => `Orbits the boat and zaps monsters within 15 m for ${p}. Lights up the Abyss.` },
  { id: "inkjet", name: "Ink Jet", icon: "🦑", cls: "support", price: 60, cooldown: [10, 9, 8, 7], power: [3, 3.5, 4, 5], range: 26,
    desc: (_t, p) => `Ink cloud: monsters in 26 m are slowed by 60% for ${p} s.`, unlock: "kills_150" },
];
export const RIGS_BY_ID: Record<string, RigDef> = Object.fromEntries(RIGS.map((r) => [r.id, r]));

// ------------------------------------------------------------------------------------------------ trinkets
export type TrinketSpecial =
  | "goldBonus" | "noRegen" | "netPlus" | "monsterSlow" | "extraSchools" | "crit" | "killHeal" | "secondWind"
  | "vortex" | "monsterMore" | "upgradeChance" | "spillGuard" | "dash" | "lootMagnet" | "bossDmg" | "interestCap";

export interface TrinketDef {
  id: string; name: string; icon: string; rarity: Rarity;
  stats: Partial<Stats>;
  special?: Partial<Record<TrinketSpecial, number>>;
  /** extra text for specials */
  text?: string;
  /** most copies you can own (default unlimited) */
  max?: number;
  unlock?: string;
  /** only offered to Lucky Pip */
  cursed?: boolean;
}

export const TRINKETS: TrinketDef[] = [
  // common
  { id: "rusty_anchor", name: "Rusty Anchor", icon: "⚓", rarity: "common", stats: { armor: 3, speed: -5 } },
  { id: "tin_bucket", name: "Tin Bucket", icon: "🪣", rarity: "common", stats: { maxHp: 10 } },
  { id: "lucky_bobber", name: "Lucky Bobber", icon: "🎈", rarity: "common", stats: { luck: 6 } },
  { id: "greased_reel", name: "Greased Reel", icon: "⚙", rarity: "common", stats: { reel: 10 } },
  { id: "patched_sail", name: "Patched Sail", icon: "⛵", rarity: "common", stats: { speed: 7 } },
  { id: "whetstone", name: "Whetstone", icon: "🗡", rarity: "common", stats: { harpoon: 9 } },
  { id: "bait_box", name: "Bait Box", icon: "🪱", rarity: "common", stats: { bite: 12 } },
  { id: "sea_salt", name: "Sea Salt", icon: "🧂", rarity: "common", stats: { regen: 0.3 } },
  { id: "spyglass", name: "Spyglass", icon: "🔭", rarity: "common", stats: { range: 10 } },
  { id: "copper_coil", name: "Copper Coil", icon: "🧲", rarity: "common", stats: { magnet: 2 } },
  { id: "tackle_box", name: "Tackle Box", icon: "🧰", rarity: "common", stats: { engineering: 5 } },
  { id: "wide_hook", name: "Wide Hook", icon: "🪝", rarity: "common", stats: { zone: 6 } },
  { id: "piggy_bank", name: "Piggy Bank", icon: "🐷", rarity: "common", stats: { interest: 4, haul: -3 } },
  // rare
  { id: "golden_hook", name: "Golden Hook", icon: "🪝", rarity: "rare", stats: {}, special: { goldBonus: 0.3 }, text: "Gold-or-better fish are worth +30% coins", max: 2 },
  { id: "barnacle_hull", name: "Barnacle Hull", icon: "🛡", rarity: "rare", stats: { maxHp: 30, armor: 2 }, special: { noRegen: 1 }, text: "You can't regenerate", max: 1 },
  { id: "storm_sail", name: "Storm Sail", icon: "🌬", rarity: "rare", stats: { speed: 14, armor: -2 } },
  { id: "braided_line", name: "Braided Line", icon: "🧵", rarity: "rare", stats: { line: 22, reel: -4 } },
  { id: "pirate_ledger", name: "Pirate Ledger", icon: "📒", rarity: "rare", stats: { interest: 8 } },
  { id: "fishmonger_apron", name: "Fishmonger's Apron", icon: "🥩", rarity: "rare", stats: { haul: 14 } },
  { id: "eel_skin_gloves", name: "Eel-skin Gloves", icon: "🧤", rarity: "rare", stats: { reel: 12, zone: 5 } },
  { id: "trigger_finger", name: "Trigger Finger", icon: "☝", rarity: "gold", stats: { fireRate: 20, harpoon: -5 } },
  { id: "compass_rose", name: "Compass Rose", icon: "🧭", rarity: "rare", stats: { luck: 4, speed: 5, range: 6 } },
  { id: "carpenter_kit", name: "Carpenter's Kit", icon: "🔨", rarity: "rare", stats: { regen: 0.7 } },
  { id: "net_floats", name: "Net Floats", icon: "🫧", rarity: "rare", stats: {}, special: { netPlus: 1 }, text: "Nets bag +1 fish" },
  { id: "star_chart", name: "Star Chart", icon: "✨", rarity: "rare", stats: { luck: 12, maxHp: -8 } },
  { id: "bilge_pump", name: "Bilge Pump", icon: "🚿", rarity: "rare", stats: { maxHp: 8 }, special: { spillGuard: 0.5 }, text: "Monster hits spill half as many fish" },
  // gold
  { id: "merchants_ledger", name: "Merchant's Ledger", icon: "💰", rarity: "gold", stats: { interest: 15, haul: -8 }, special: { interestCap: 20 }, text: "Interest cap +20" },
  { id: "kraken_ink", name: "Kraken Ink", icon: "🦑", rarity: "gold", stats: { armor: 1 }, special: { monsterSlow: 0.12 }, text: "Monsters are 12% slower" },
  { id: "harpoon_cannon", name: "Harpoon Cannon", icon: "💥", rarity: "gold", stats: { harpoon: 28, fireRate: -10 } },
  { id: "iron_bow", name: "Iron Bow", icon: "🛡", rarity: "gold", stats: { armor: 6, maxHp: 15, speed: -8 } },
  { id: "tidecaller_shell", name: "Tidecaller Shell", icon: "🐚", rarity: "gold", stats: { luck: 3 }, special: { extraSchools: 1 }, text: "+1 fish school every tide" },
  { id: "overclock_gear", name: "Overclock Gear", icon: "⚡", rarity: "gold", stats: { engineering: 16, armor: -5 } },
  { id: "sharks_tooth", name: "Shark's Tooth", icon: "🦷", rarity: "gold", stats: { harpoon: 6 }, special: { crit: 0.15 }, text: "15% chance of a ×2 critical hit" },
  { id: "twin_spool", name: "Twin Spool", icon: "🎣", rarity: "gold", stats: { reel: 20, line: 12, bite: 10 } },
  { id: "sea_legs", name: "Sea Legs", icon: "🦵", rarity: "gold", stats: { speed: 10 }, special: { dash: 1 }, text: "Press SHIFT (or ⚡ on touch) to dash, every 4 s", max: 1 },
  { id: "loot_hook", name: "Loot Hook", icon: "🧷", rarity: "gold", stats: { magnet: 5 }, special: { lootMagnet: 1 }, text: "Floating loot drifts to you twice as fast" },
  // epic
  { id: "serpent_fang", name: "Serpent Fang", icon: "🐍", rarity: "epic", stats: { harpoon: 30 }, special: { killHeal: 3 }, text: "Monster kills repair 3 HP", unlock: "boss_reef_serpent" },
  { id: "glass_cannon_reel", name: "Glass Cannon Reel", icon: "🔮", rarity: "epic", stats: { reel: 100, line: -40 } },
  { id: "coral_crown", name: "Coral Crown", icon: "👑", rarity: "epic", stats: { luck: 18, haul: 10 }, unlock: "boss_crab_titan" },
  { id: "second_wind", name: "Second Wind", icon: "💨", rarity: "epic", stats: { zone: 6 }, special: { secondWind: 1 }, text: "Once per fish, a snap is prevented", max: 1 },
  { id: "abyss_lantern", name: "Abyss Lantern", icon: "🏮", rarity: "epic", stats: { range: 25, engineering: 8 } },
  { id: "titan_plating", name: "Titan Plating", icon: "🦀", rarity: "epic", stats: { armor: 10, maxHp: 25, speed: -12 }, unlock: "boss_crab_titan" },
  { id: "kraken_beak", name: "Kraken Beak", icon: "🐙", rarity: "epic", stats: { harpoon: 15 }, special: { bossDmg: 0.5 }, text: "+50% damage to bosses", unlock: "boss_storm_kraken" },
  // legendary
  { id: "maelstrom_core", name: "Maelstrom Core", icon: "🌀", rarity: "legendary", stats: { luck: 5 }, special: { vortex: 10 }, text: "Every 10 s a whirlpool pulls schools and loot to you", max: 1, unlock: "boss_maelstrom_eye" },
  { id: "cursed_doubloon", name: "Cursed Doubloon", icon: "🪙", rarity: "legendary", stats: { haul: 100 }, special: { monsterMore: 0.5 }, text: "+50% monsters", max: 1 },
  { id: "leviathan_heart", name: "Leviathan Heart", icon: "💙", rarity: "legendary", stats: { maxHp: 60, regen: 1.5, speed: -10 }, unlock: "boss_ice_leviathan" },
  { id: "midas_net", name: "Midas Net", icon: "🌟", rarity: "legendary", stats: { haul: 10 }, special: { upgradeChance: 0.2 }, text: "20% of fish come up one tier better", max: 1, unlock: "win_any" },
  // cursed (Lucky Pip only)
  { id: "cursed_compass", name: "Cursed Compass", icon: "☠", rarity: "rare", stats: { luck: 20, speed: -12 }, cursed: true, max: 2 },
  { id: "cursed_idol", name: "Cursed Idol", icon: "🗿", rarity: "gold", stats: { haul: 30, maxHp: -20 }, cursed: true, max: 2 },
  { id: "cursed_mirror", name: "Cursed Mirror", icon: "🪞", rarity: "rare", stats: { engineering: 25, regen: -0.5 }, cursed: true, max: 2 },
];
export const TRINKETS_BY_ID: Record<string, TrinketDef> = Object.fromEntries(TRINKETS.map((t) => [t.id, t]));
export const TRINKET_PRICE: Record<Rarity, number> = { common: 24, rare: 48, gold: 84, epic: 150, legendary: 240 };

// ------------------------------------------------------------------------------------------------ captains
export interface CaptainRules {
  /** rig slots (default 6) */
  slots?: number;
  /** rigs are this many times stronger (One-Line Willy) */
  rigPower?: number;
  /** manual fishing disabled; rod/net rigs not offered */
  noFishing?: boolean;
  /** only these rig classes are offered */
  onlyClasses?: RigClass[];
  /** shop offers (default 4) */
  shopSize?: number;
  /** monster kills drop this many times the coins */
  monsterCoins?: number;
  /** one cursed trinket in every shop */
  cursedShop?: boolean;
  /** buying a rig you own merges at once */
  instantMerge?: boolean;
  /** never dark in the Abyss */
  darkVision?: boolean;
}
export interface CaptainDef {
  id: string; name: string; icon: string; color: string;
  blurb: string;
  stats: Partial<Stats>;
  rules: CaptainRules;
  startRig: string;
  unlock?: string;
}
export const CAPTAINS: CaptainDef[] = [
  { id: "marlow", name: "Marlow", icon: "🧓", color: "#ffd24a", blurb: "The old lighthouse keeper. Balanced, steady, wise.", stats: {}, rules: {}, startRig: "bobber" },
  { id: "merchant", name: "The Merchant", icon: "🎩", color: "#f2b04a", blurb: "+15% interest and 5 shop offers, but −50 Max HP.", stats: { interest: 15, maxHp: -50 }, rules: { shopSize: 5 }, startRig: "bobber", unlock: "tide_10" },
  { id: "harpooner", name: "The Harpooner", icon: "🔱", color: "#ff6b5a", blurb: "Can't fish at all and has 4 rig slots. Monsters drop +25% coins.", stats: {}, rules: { slots: 4, noFishing: true, monsterCoins: 1.25, onlyClasses: ["harpoon", "explosive", "support"] }, startRig: "harpoongun", unlock: "kills_300" },
  { id: "willy", name: "One-Line Willy", icon: "🪝", color: "#3fd0c9", blurb: "One rig slot (buying another swaps it). That one rig is eight times as strong.", stats: { reel: 15 }, rules: { slots: 1, rigPower: 8 }, startRig: "bobber", unlock: "win_one_rig" },
  { id: "netwitch", name: "The Net Witch", icon: "🧙", color: "#7fdc6a", blurb: "Nets, support and charges only, but her rigs are twice as strong. Buying a rig you own upgrades it at once.", stats: { luck: 8 }, rules: { onlyClasses: ["net", "support", "explosive"], instantMerge: true, rigPower: 2 }, startRig: "castnet", unlock: "net_500" },
  { id: "ingrid", name: "Frostbitten Ingrid", icon: "❄", color: "#9fe8ff", blurb: "+30 Engineering, −10% Speed. Starts with a Chain Harpoon.", stats: { engineering: 30, speed: -10 }, rules: {}, startRig: "chain", unlock: "tide_16" },
  { id: "abyssal", name: "The Abyss-Touched", icon: "👁", color: "#b05cff", blurb: "+15 Luck and sees in the dark, but the hull slowly rots (−0.4 HP/s).", stats: { luck: 15, regen: -0.4 }, rules: { darkVision: true }, startRig: "drone", unlock: "danger_3" },
  { id: "pip", name: "Lucky Pip", icon: "🍀", color: "#5fe08a", blurb: "+40 Luck, but every shop slips in a cursed trinket.", stats: { luck: 40 }, rules: { cursedShop: true }, startRig: "bobber", unlock: "legend_10" },
];
export const CAPTAINS_BY_ID: Record<string, CaptainDef> = Object.fromEntries(CAPTAINS.map((c) => [c.id, c]));

// ------------------------------------------------------------------------------------------------ danger
export const DANGER_LEVELS = [
  { n: 0, name: "Calm", text: "The standard run." },
  { n: 1, name: "Choppy", text: "Elite monsters appear. Each Danger level adds +7% monster and boss HP and +5% monsters." },
  { n: 2, name: "Rough", text: "One fewer shop offer." },
  { n: 3, name: "Gale", text: "Monsters hit 25% harder." },
  { n: 4, name: "Tempest", text: "The hold pays 20% fewer coins." },
  { n: 5, name: "Maelstrom", text: "Monsters have 10% more HP, bosses 25% more." },
];
export const MAX_DANGER = 5;

// ------------------------------------------------------------------------------------------------ biomes and modifiers
export interface BiomeDef { region: RegionId; name: string; hazard: "none" | "firecoral" | "lightning" | "frost" | "dark"; hazardText: string }
/** every 4 tides the sea changes; the cycle loops after tide 20 */
export const BIOMES: BiomeDef[] = [
  { region: "shallows_bay", name: "Shallows Bay", hazard: "none", hazardText: "Calm water. Learn the ropes." },
  { region: "coral_maze", name: "Coral Maze", hazard: "firecoral", hazardText: "Fire coral patches burn the hull." },
  { region: "stormbreak", name: "Stormbreak Strait", hazard: "lightning", hazardText: "Lightning strikes: leave the yellow circles." },
  { region: "frozen_fjord", name: "Frozen Fjord", hazard: "frost", hazardText: "Freezing fog slows the boat to a crawl." },
  { region: "abyss_trench", name: "Abyss Trench", hazard: "dark", hazardText: "Endless night. Rigs with light help." },
];
export const TIDES_PER_BIOME = 4;
export const WIN_TIDE = 20;
export const BOSS_TIDES = [10, 20];

export type ModifierId = "golden_school" | "frenzy" | "fog" | "bounty" | "rogue_wave" | "calm" | "school_rush";
export const MODIFIERS: Record<ModifierId, { name: string; icon: string; text: string }> = {
  golden_school: { name: "Golden School", icon: "✨", text: "A shimmering school of nothing but Gold-or-better fish." },
  frenzy: { name: "Feeding Frenzy", icon: "🦈", text: "Twice the fish. Twice the monsters." },
  fog: { name: "Sea Fog", icon: "🌫", text: "Rig range is halved." },
  bounty: { name: "Bounty Fish", icon: "🎯", text: "One marked Epic swims here. Land it for a free item." },
  rogue_wave: { name: "Rogue Waves", icon: "🌊", text: "Giant waves shove the boat around." },
  calm: { name: "Dead Calm", icon: "🪷", text: "No monsters for the first 20 seconds." },
  school_rush: { name: "School Rush", icon: "🐟", text: "Schools respawn twice as fast." },
};
export const MODIFIER_IDS = Object.keys(MODIFIERS) as ModifierId[];

// ------------------------------------------------------------------------------------------------ fish value
/** coins per fish at cash-in, by tier (×0.8–1.2 by weight) */
export const FISH_COINS: Record<Tier, number> = { common: 2, rare: 5, gold: 12, epic: 25, legendary: 60 };
/** run xp per fish by tier */
export const FISH_XP: Record<Tier, number> = { common: 10, rare: 24, gold: 55, epic: 130, legendary: 320 };

// ------------------------------------------------------------------------------------------------ companions (shared with the campaign)
export interface CompanionDef { id: string; name: string; icon: string; perk: string; stats: Partial<Stats>; unlock?: string }
export const COMPANIONS: CompanionDef[] = [
  { id: "none", name: "No companion", icon: "—", perk: "Sail alone.", stats: {} },
  { id: "gull", name: "Gully the Gull", icon: "🐦", perk: "Endless: +2 Magnet. Circles over your boat.", stats: { magnet: 2 } },
  { id: "otter", name: "Pebble the Otter", icon: "🦦", perk: "Endless: +6% Haul. Swims beside you.", stats: { haul: 6 }, unlock: "tide_8" },
  { id: "turtle", name: "Old Shell", icon: "🐢", perk: "Endless: +12 Max HP. Slow but loyal.", stats: { maxHp: 12 }, unlock: "win_any" },
  { id: "kraken", name: "Inky", icon: "🐙", perk: "Endless: +6% Harpoon damage. A baby kraken.", stats: { harpoon: 6 }, unlock: "danger_2" },
];
export const COMPANIONS_BY_ID: Record<string, CompanionDef> = Object.fromEntries(COMPANIONS.map((c) => [c.id, c]));

// ------------------------------------------------------------------------------------------------ unlocks
export const UNLOCK_TEXT: Record<string, string> = {
  tide_8: "Reach tide 8",
  tide_10: "Reach tide 10",
  tide_16: "Reach tide 16",
  kills_150: "Defeat 150 monsters in Endless",
  kills_300: "Defeat 300 monsters in Endless",
  net_500: "Bag 500 fish with nets",
  win_any: "Win a run (clear tide 20)",
  win_one_rig: "Win a run with only one rig",
  danger_2: "Win a run on Danger 2",
  danger_3: "Win a run on Danger 3",
  legend_10: "Catch 10 Legendary fish in Endless",
  boss_reef_serpent: "Campaign: beat the Reef Serpent, or beat it in Endless",
  boss_crab_titan: "Campaign: beat the Crab Titan, or beat it in Endless",
  boss_storm_kraken: "Campaign: beat the Storm Kraken",
  boss_ice_leviathan: "Campaign: beat the Ice Leviathan",
  boss_maelstrom_eye: "Campaign: beat the Maelstrom Eye",
};
