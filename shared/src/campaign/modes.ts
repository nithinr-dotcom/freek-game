/**
 * P4: difficulty modes (§8). Normal is the campaign; Hard unlocks after chapter 30, Legendary after every chapter is
 * finished on Hard (or Legendary). Rules only apply inside chapters (free roam and bounties use normal rules).
 */
export type CampaignMode = "normal" | "hard" | "legendary";
export const CAMPAIGN_MODES: CampaignMode[] = ["normal", "hard", "legendary"];

export interface ModeRules {
  /** monster (and boss / boss part) HP multiplier */
  monsterHp: number;
  /** damage from monsters and bosses */
  monsterDamage: number;
  /** added to the reel difficulty of every fish */
  fishDifficulty: number;
  /** chapter time limits are multiplied by this */
  timeLimit: number;
  /** sinking fails every chapter */
  ironman: boolean;
  /** first clear in this mode pays this share of the chapter's xp/coins (normal = 1) */
  firstClearPay: number;
}

export const MODE_RULES: Record<CampaignMode, ModeRules> = {
  normal: { monsterHp: 1, monsterDamage: 1, fishDifficulty: 0, timeLimit: 1, ironman: false, firstClearPay: 1 },
  hard: { monsterHp: 1.5, monsterDamage: 1.5, fishDifficulty: 0.1, timeLimit: 0.8, ironman: false, firstClearPay: 1 },
  legendary: { monsterHp: 1.5, monsterDamage: 1.5, fishDifficulty: 0.1, timeLimit: 0.8, ironman: true, firstClearPay: 1.5 },
};

export const MODE_INFO: Record<CampaignMode, { name: string; icon: string; color: string; blurb: string }> = {
  normal: { name: "Normal", icon: "⚓", color: "#7dd3ff", blurb: "The campaign as charted." },
  hard: { name: "Hard", icon: "💀", color: "#ff7a3d", blurb: "Monsters +50% HP and damage · fish +0.1 difficulty · time limits −20%." },
  legendary: { name: "Legendary", icon: "👑", color: "#ff4fd8", blurb: "Hard rules, and sinking fails every chapter (ironman)." },
};
