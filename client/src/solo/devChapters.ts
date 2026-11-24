/** Dev-only test chapters exercising the objective types Act 1 doesn't use (escort, defend, collect, reach, survive). */
import type { CampaignChapter } from "@freek/shared";

const base = { act: 0, index: 0, region: "shallows_bay" as const, intro: ["Dev test chapter."], hint: "Dev hint.", parSeconds: 120, rewards: { xp: 1, coins: 1 } };

export const DEV_CHAPTERS: Record<string, CampaignChapter> = {
  escort: { ...base, id: 901, title: "DEV Escort", main: { id: "e", title: "Tow the dinghy to the North Buoy", kind: { type: "escort", npcId: "dinghy", toPointId: "north_buoy" } },
    optional: [{ id: "hp", title: "Dinghy above 75%", kind: { type: "escort", npcId: "dinghy", toPointId: "north_buoy", minHpPct: 0.75 } }, { id: "t", title: "Under 2:00", kind: { type: "under_time", seconds: 120 } }],
    setup: { npcs: [{ id: "dinghy", name: "Diver's Dinghy", hp: 60, mode: "tow", at: "dock" }], monsters: "none" } },
  defend: { ...base, id: 902, title: "DEV Defend", main: { id: "d", title: "Defend the moored skiff for 0:20", kind: { type: "defend", npcId: "skiff", seconds: 20 } },
    optional: [{ id: "hp", title: "Skiff above 50%", kind: { type: "defend", npcId: "skiff", seconds: 20, minHpPct: 0.5 } }, { id: "h", title: "3 harpoon hits", kind: { type: "harpoon_hits", n: 3 } }],
    setup: { npcs: [{ id: "skiff", name: "Supply Skiff", hp: 80, mode: "moored", at: "east_shoal" }], monsters: "random" } },
  collect: { ...base, id: 903, title: "DEV Collect + Reach", main: { id: "r", title: "Reach the West Cove", kind: { type: "reach", pointId: "west_cove" } },
    optional: [{ id: "c", title: "Collect 3 pearls", kind: { type: "collect", itemKind: "pearl", n: 3 } }, { id: "s", title: "Survive 10 s", kind: { type: "survive", seconds: 10 } }],
    setup: { pickups: [{ kind: "pearl", points: ["random:6"] }], monsters: "none" }, fail: { timeLimit: 300 } },
};
