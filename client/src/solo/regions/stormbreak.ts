/**
 * Stormbreak Strait client: open grey water broken by sea stacks (tall rocks) and bare islets, four wrecks with storm
 * glass, the supply ship's mooring and marker-buoy pickups. Lightning is the "lightning" hazard (solo/hazards).
 */
import * as THREE from "three";
import { registerRegionClient } from "./registry";
import { DEFAULT_LAYOUT, addObstacle, type IslandDef, type LayoutData, type Obstacle, type RockDef } from "../../world/layout";
import { buildWreck } from "../../world/landmarks";
import { buildBuoy, buildCrate, buildBarrel } from "../../world/models";
import { waveHeight } from "../../world/ocean";
import { mulberry32 } from "../../util";
import { registerPickupLook } from "../actors";

const polar = (deg: number, r: number) => ({ x: Math.cos((deg * Math.PI) / 180) * r, z: Math.sin((deg * Math.PI) / 180) * r });

registerPickupLook("buoy", { color: "#ff5a3d", icon: "🛟", geo: () => { const g = new THREE.ConeGeometry(0.9, 2.4, 8); g.translate(0, 0.6, 0); return g; } });

const ISLETS: IslandDef[] = [
  { ...polar(150, 120), r: 11, lagoon: 15, palms: 0, seed: 3301 },
  { ...polar(30, 255), r: 14, lagoon: 18, palms: 0, seed: 3302 },
  { ...polar(215, 230), r: 10, lagoon: 14, palms: 0, seed: 3303 },
  { ...polar(290, 330), r: 16, lagoon: 20, palms: 0, seed: 3304 },
];

function layout(): LayoutData {
  const rng = mulberry32(13013);
  const rocks: RockDef[] = [];
  const keepClear = [polar(80, 228), polar(250, 255), polar(335, 182), polar(165, 330), polar(300, 205), polar(25, 176), polar(118, 205), polar(205, 168), polar(120, 360)];
  let tries = 0;
  while (rocks.length < 46 && tries++ < 3000) {
    const a = rng() * Math.PI * 2, r = 55 + rng() * 385;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (ISLETS.some((i) => Math.hypot(i.x - x, i.z - z) < i.r + 12)) continue;
    if (keepClear.some((p) => Math.hypot(p.x - x, p.z - z) < 26)) continue;
    if (rocks.some((o) => Math.hypot(o.x - x, o.z - z) < 18)) continue;
    // sea stacks: tall, some in clusters
    rocks.push({ x, z, s: 2.2 + rng() * (r > 300 ? 4.5 : 3), variant: 1 + Math.floor(rng() * 3), rot: rng() * 6 });
  }
  const pier = DEFAULT_LAYOUT.pier, lh = DEFAULT_LAYOUT.lighthouse;
  const obstacles: Obstacle[] = [
    ...ISLETS.map((i) => ({ x: i.x, z: i.z, r: i.r + 1.5 })),
    ...rocks.filter((r) => r.s > 1.4).map((r) => ({ x: r.x, z: r.z, r: r.s * 1.1 })),
    { x: lh.x, z: lh.z, r: lh.r + 1 },
  ];
  for (let x = pier.x0; x <= pier.x1; x += 3) obstacles.push({ x, z: pier.z, r: 2.6 });
  return {
    islands: ISLETS, rocks, buoys: DEFAULT_LAYOUT.buoys.slice(), obstacles, lighthouse: { ...lh }, pier: { ...pier },
    mapDots: rocks.map((r) => ({ x: r.x, z: r.z, r: r.s * 1.1, color: "#8a949c" })),
  };
}

registerRegionClient({
  id: "stormbreak",
  layout,
  decorate(scene, def) {
    const objs: THREE.Object3D[] = [];
    for (const w of def.landmarks.filter((l) => l.kind === "wreck")) {
      const wr = buildWreck();
      wr.position.set(w.x, 0, w.z);
      wr.rotation.y = Math.atan2(w.x, w.z) + 0.6;
      wr.scale.setScalar(w.id === "far_wreck" ? 1.4 : 1.1);
      scene.add(wr); objs.push(wr);
      addObstacle({ x: w.x, z: w.z, r: w.id === "far_wreck" ? 9 : 7 });
    }
    // the supply ship's mooring: a buoy and floating cargo
    const moor = def.points.supply_moor;
    const floaters: { o: THREE.Object3D; x: number; z: number; p: number }[] = [];
    const add = (o: THREE.Object3D, x: number, z: number) => { scene.add(o); objs.push(o); floaters.push({ o, x, z, p: Math.random() * 6 }); };
    add(buildBuoy("#ffd24a"), moor.x + 8, moor.z + 5);
    add(buildCrate(), moor.x - 6, moor.z + 7);
    add(buildBarrel(), moor.x - 8, moor.z - 4);
    // a storm-lit beacon on the far islet
    const beacon = new THREE.PointLight("#ffe7a0", 0, 90, 1.2);
    const isl = ISLETS[3];
    beacon.position.set(isl.x, 12, isl.z);
    scene.add(beacon); objs.push(beacon);
    return {
      update(_dt, time, night) {
        for (const f of floaters) { f.o.position.set(f.x, waveHeight(f.x, f.z) - 0.2, f.z); f.o.rotation.x = Math.sin(time * 1.4 + f.p) * 0.2; f.o.rotation.z = Math.cos(time * 1.1 + f.p) * 0.15; }
        beacon.intensity = (0.3 + night) * (Math.sin(time * 3) > 0.6 ? 30 : 0);
      },
      dispose() { scene.remove(...objs); },
    };
  },
});
