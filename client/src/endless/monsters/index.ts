/** Endless monster roster (see base.ts and shared/src/endless/monsters.ts). Importing this registers every type. */
import "./swarmer";
import "./spitter";
import "./shielded";
import "./splitter";
import "./bomber";
export { spawnEndless, takeEndlessReward, type EndlessMonsterCtx } from "./base";
