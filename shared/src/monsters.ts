export type MonsterKind = "serpent" | "kraken";
export const MONSTERS: Record<MonsterKind, {
  name: string; hp: number; damage: number; attackEveryMs: number; attackRadius: number; speed: number;
  model: string; boss: boolean; xp: number; squadPoints: number; lootMinTier: "epic" | "gold";
}> = {
  serpent: { name: "Reef Serpent", hp: 300, damage: 20, attackEveryMs: 4000, attackRadius: 9, speed: 9, model: "monster_serpent", boss: false, xp: 250, squadPoints: 150, lootMinTier: "gold" },
  kraken: { name: "Abyss Kraken", hp: 900, damage: 35, attackEveryMs: 6000, attackRadius: 16, speed: 6, model: "monster_kraken", boss: true, xp: 800, squadPoints: 500, lootMinTier: "epic" },
};
export const HARPOON_DAMAGE = (level: number) => (level >= 5 ? 40 : 25);
export const MONSTER_SPAWN_EVERY_MS = 75_000; // one check per interval; max 2 alive
export const MAX_MONSTERS = 2;
