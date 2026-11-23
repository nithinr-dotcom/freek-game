/** Creates a fish model for a species (GLB override via manifest, else procedural). */
import * as THREE from "three";
import { SPECIES_BY_ID } from "@freek/shared";
import { Assets } from "../world/assets";
import { buildFish, shapeFromModel } from "./fishModels";

export function createFish(speciesId: string): THREE.Object3D {
  const sp = SPECIES_BY_ID[speciesId];
  const model = sp?.model ?? "fish_generic";
  const tint = sp?.tint ?? "#8fb7d0";
  const shape = shapeFromModel(model);
  if (Assets.has(model)) return Assets.create(model, () => buildFish(shape, tint));
  if (Assets.has("fish_generic") && shape === "generic") return Assets.create("fish_generic", () => buildFish(shape, tint));
  return buildFish(shape, tint);
}
