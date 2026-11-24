/** Builds and updates the static/ambient world: ocean, sky, islands, dock, lighthouse, rocks, buoys, rings. */
import * as THREE from "three";
import { DOCK_POS, DOCK_RADIUS } from "@freek/shared";
import { Ocean, waveHeight } from "./ocean";
import { SkySystem } from "./sky";
import { ISLANDS, ROCKS, BUOYS, LIGHTHOUSE_POS, PIER } from "./layout";
import { buildIsland, buildPalm, buildDock, buildLighthouse, buildRock, buildBuoy, buildBarrel, buildCrate } from "./models";
import { Assets, updateMixer } from "./assets";
import { bake, InstancedProp } from "./bake";
import { surfaceRing } from "./decals";
import { mulberry32 } from "../util";
import type { GfxTier } from "../game/device";

/** monsters never come within this distance of the dock (server rule) */
export const SAFE_HARBOUR_R = 30;

export class World {
  readonly ocean: Ocean;
  readonly sky: SkySystem;
  private beam: THREE.Object3D | null = null;
  private buoyProps: InstancedProp[] = [];
  private buoyIdx: number[][] = [];
  private floaters: { obj: THREE.Object3D; x: number; z: number; phase: number }[] = [];
  private dockRing: THREE.Mesh;
  private animated: THREE.Object3D[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpS = new THREE.Vector3(1, 1, 1);
  private tmpP = new THREE.Vector3();

  constructor(private scene: THREE.Scene, tier: GfxTier) {
    this.sky = new SkySystem(scene, tier.shadowSize);
    this.sky.fogScale = tier.fogScale;
    this.ocean = new Ocean(ISLANDS, tier.oceanSegs);
    scene.add(this.ocean.mesh);

    // islands
    for (const isl of ISLANDS) {
      const o = Assets.create("island_palm", () => bake(buildIsland(isl.r, 0, isl.seed)));
      if (o.userData.fromGLB) o.scale.multiplyScalar(isl.r / 16);
      o.position.set(isl.x, 0, isl.z);
      o.rotation.y = (isl.seed % 628) / 100;
      scene.add(o);
      this.track(o);
      // palms separately so GLB palm_tree override works; baked per island
      const rng = mulberry32(isl.seed);
      const palms = new THREE.Group();
      for (let i = 0; i < isl.palms; i++) {
        const a = rng() * Math.PI * 2;
        const d = isl.r * (0.3 + rng() * 0.45);
        const p = Assets.create("palm_tree", () => buildPalm(isl.seed + i * 13, 5 + rng() * 3));
        p.position.set(isl.x + Math.cos(a) * d, d > isl.r * 0.6 ? 1.2 : 2.7, isl.z + Math.sin(a) * d);
        p.rotation.y = rng() * Math.PI * 2;
        palms.add(p);
      }
      scene.add(Assets.has("palm_tree") ? palms : bake(palms));
    }

    // dock + lighthouse
    const dock = Assets.create("dock", () => bake(buildDock()));
    dock.position.set(PIER.x0, 0, PIER.z);
    scene.add(dock);
    this.track(dock);
    if (Assets.has("lighthouse")) {
      const lh = Assets.create("lighthouse", () => new THREE.Group());
      lh.position.set(LIGHTHOUSE_POS.x, 0, LIGHTHOUSE_POS.z);
      scene.add(lh);
      this.track(lh);
    } else {
      const lh = buildLighthouse();
      lh.root.position.set(LIGHTHOUSE_POS.x, 0, LIGHTHOUSE_POS.z);
      scene.add(lh.root);
      this.beam = lh.beam;
    }

    // rocks (instanced per variant when procedural)
    for (const v of [1, 2, 3]) {
      const list = ROCKS.filter((r) => r.variant === v);
      const key = `rock_${v}`;
      if (Assets.has(key)) {
        for (const r of list) {
          const o = Assets.create(key, () => new THREE.Group());
          o.position.set(r.x, 0, r.z); o.rotation.y = r.rot; o.scale.multiplyScalar(r.s);
          scene.add(o);
        }
        continue;
      }
      const prop = new InstancedProp(buildRock(v, v * 31), list.length);
      list.forEach((r, i) => {
        this.tmpQ.setFromEuler(this.tmpE.set(0, r.rot, 0));
        this.tmpM.compose(this.tmpP.set(r.x, -0.3, r.z), this.tmpQ, this.tmpS.set(r.s, r.s, r.s));
        prop.setMatrix(i, this.tmpM);
      });
      prop.commit();
      prop.addTo(scene);
    }

    // buoys marking zone borders (instanced, bobbing)
    for (const [zone, color] of [["reef", "#36d6c3"], ["abyss", "#ff6b3d"]] as const) {
      const idx = BUOYS.map((b, i) => (b.zone === zone ? i : -1)).filter((i) => i >= 0);
      if (Assets.has("buoy")) {
        for (const i of idx) {
          const o = Assets.create("buoy", () => new THREE.Group());
          scene.add(o);
          this.floaters.push({ obj: o, x: BUOYS[i].x, z: BUOYS[i].z, phase: i });
        }
        continue;
      }
      const prop = new InstancedProp(buildBuoy(color), idx.length, false);
      prop.addTo(scene);
      this.buoyProps.push(prop);
      this.buoyIdx.push(idx);
    }

    // floating barrels/crates near the dock and scattered
    const rng = mulberry32(99);
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, d = 40 + rng() * 360;
      const isBarrel = rng() < 0.6;
      const o = Assets.create(isBarrel ? "barrel" : "crate", () => bake(isBarrel ? buildBarrel() : buildCrate()));
      if (isBarrel) o.rotation.z = Math.PI / 2;
      scene.add(o);
      this.floaters.push({ obj: o, x: Math.cos(a) * d, z: Math.sin(a) * d, phase: rng() * 10 });
    }

    // glowing bank ring + subtle safe-harbour ring
    this.dockRing = surfaceRing(DOCK_RADIUS, "#ffd76a", 0.85);
    this.dockRing.position.set(DOCK_POS.x, 0, DOCK_POS.z);
    scene.add(this.dockRing);
    const safe = surfaceRing(SAFE_HARBOUR_R, "#7fe8ff", 0.12, 96, 0);
    safe.position.set(DOCK_POS.x, 0, DOCK_POS.z);
    scene.add(safe);
    // floating lanterns around the bank ring
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const lan = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: "#ffe08a", emissive: "#ffb84d", emissiveIntensity: 2, flatShading: true }));
      scene.add(lan);
      this.floaters.push({ obj: lan, x: DOCK_POS.x + Math.cos(a) * DOCK_RADIUS, z: DOCK_POS.z + Math.sin(a) * DOCK_RADIUS, phase: i * 0.7 });
    }
  }

  private track(o: THREE.Object3D) { if (o.userData.mixer) this.animated.push(o); }

  update(dt: number, time: number, focus: THREE.Vector3, camPos: THREE.Vector3, wind: number, storm: boolean) {
    this.sky.update(dt, time, focus, camPos, storm);
    this.ocean.update(dt, time, camPos, wind, this.sky.storm);
    const u = this.ocean.material.uniforms;
    (u.uSunDir.value as THREE.Vector3).copy(this.sky.sunDir);
    (u.uSunColor.value as THREE.Color).copy(this.sky.sunColor);
    (u.uSkyColor.value as THREE.Color).copy(this.sky.horizon);
    u.uFlash.value = this.sky.flicker;
    if (this.beam) this.beam.rotation.y = time * 0.6;
    for (const o of this.animated) updateMixer(o, dt);
    (this.dockRing.material as THREE.ShaderMaterial).uniforms.uTime.value = time;

    // bobbing props
    for (let k = 0; k < this.buoyProps.length; k++) {
      const prop = this.buoyProps[k];
      this.buoyIdx[k].forEach((bi, i) => {
        const b = BUOYS[bi];
        const y = waveHeight(b.x, b.z);
        this.tmpQ.setFromEuler(this.tmpE.set(Math.sin(time * 1.3 + bi) * 0.12, bi, Math.cos(time * 1.1 + bi) * 0.12));
        this.tmpM.compose(this.tmpP.set(b.x, y - 0.2, b.z), this.tmpQ, this.tmpS.set(1.3, 1.3, 1.3));
        prop.setMatrix(i, this.tmpM);
      });
      prop.commit();
    }
    for (const f of this.floaters) {
      f.obj.position.set(f.x, waveHeight(f.x, f.z) - 0.25, f.z);
      f.obj.rotation.x = Math.sin(time * 1.2 + f.phase) * 0.15;
      f.obj.rotation.y = f.phase + time * 0.05;
    }
  }
}

