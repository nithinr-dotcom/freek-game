/**
 * Abyss Trench client (P3): black water, tall rock spires, the Glow Reef landmark (bioluminescent coral with a light
 * pillar you can see through the dark) and drifting glow motes. Lantern fuel / darkness, horrors and the whirlpool are
 * hazards (client/src/solo/hazards).
 */
import * as THREE from "three";
import { registerRegionClient } from "./registry";
import { addObstacle, DEFAULT_LAYOUT, type LayoutData, type RockDef } from "../../world/layout";
import { waveHeight } from "../../world/ocean";
import { mulberry32 } from "../../util";

function layout(): LayoutData {
  const rng = mulberry32(5055);
  const rocks: RockDef[] = [];
  let tries = 0;
  while (rocks.length < 54 && tries++ < 1500) {
    const a = rng() * Math.PI * 2, rad = 50 + rng() * 390;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (Math.hypot(x + 150, z + 170) < 60) continue; // Glow Reef
    if (Math.hypot(x - 70, z + 215) < 110) continue; // the Maelstrom
    if (Math.hypot(x - 120, z + 300) < 30) continue; // its edge
    rocks.push({ x, z, s: 1.4 + rng() * 3.4, variant: 1 + Math.floor(rng() * 3), rot: rng() * 6.28 });
  }
  const obstacles = [...rocks.filter((r) => r.s > 1.4).map((r) => ({ x: r.x, z: r.z, r: r.s * 1.1 })), { ...DEFAULT_LAYOUT.lighthouse, r: DEFAULT_LAYOUT.lighthouse.r + 1 }];
  for (let x = DEFAULT_LAYOUT.pier.x0; x <= DEFAULT_LAYOUT.pier.x1; x += 3) obstacles.push({ x, z: DEFAULT_LAYOUT.pier.z, r: 2.6 });
  return { islands: [], rocks, buoys: DEFAULT_LAYOUT.buoys.slice(), obstacles, lighthouse: { ...DEFAULT_LAYOUT.lighthouse }, pier: { ...DEFAULT_LAYOUT.pier } };
}

registerRegionClient({
  id: "abyss_trench",
  layout,
  decorate(scene, def) {
    const objs: THREE.Object3D[] = [];
    const lm = def.landmarks.find((l) => l.id === "glow_reef")!;
    const reef = new THREE.Group();
    const rng = mulberry32(66);
    const cols = ["#3dfff0", "#ff5ad8", "#7a8cff", "#5affc8"];
    const glowMats = cols.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, flatShading: true, roughness: 0.4 }));
    for (let i = 0; i < 22; i++) {
      const a = rng() * Math.PI * 2, d = rng() * 9;
      const h = 2 + rng() * 5;
      const m = new THREE.Mesh(i % 3 ? new THREE.ConeGeometry(0.5 + rng() * 0.8, h, 5) : new THREE.SphereGeometry(0.8 + rng(), 7, 5), glowMats[i % glowMats.length]);
      m.position.set(Math.cos(a) * d, i % 3 ? h / 2 - 0.5 : 0.4, Math.sin(a) * d);
      m.rotation.set((rng() - 0.5) * 0.5, rng() * 6, (rng() - 0.5) * 0.5);
      reef.add(m);
    }
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 2.5, 9), new THREE.MeshStandardMaterial({ color: "#1a1830", flatShading: true, roughness: 0.9 }));
    rock.position.y = -0.6;
    reef.add(rock);
    // a light pillar that cuts through the fog so the reef is a beacon in the dark
    const pillarGeo = new THREE.CylinderGeometry(2, 6, 90, 16, 1, true);
    pillarGeo.translate(0, 45, 0);
    const pillarMat = new THREE.MeshBasicMaterial({ color: "#3dfff0", transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    reef.add(new THREE.Mesh(pillarGeo, pillarMat));
    const light = new THREE.PointLight("#5affe8", 30, 70, 1.3);
    light.position.y = 6;
    reef.add(light);
    reef.position.set(lm.x, 0, lm.z);
    scene.add(reef); objs.push(reef);
    addObstacle({ x: lm.x, z: lm.z, r: 10 });
    // glowing motes drifting on the water (follow the reef + random spots)
    const N = 260;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const seeds = Array.from({ length: N }, (_, i) => {
      const nearReef = i < 80;
      const a = rng() * Math.PI * 2, d = nearReef ? 8 + rng() * (lm.radius - 6) : 30 + rng() * 400;
      return { x: (nearReef ? lm.x : 0) + Math.cos(a) * d, z: (nearReef ? lm.z : 0) + Math.sin(a) * d, s: 0.3 + rng(), h: rng() * 2 };
    });
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#7ffff0", size: 0.7, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    motes.frustumCulled = false;
    scene.add(motes); objs.push(motes);
    return {
      update(_dt, time) {
        pillarMat.opacity = 0.13 + 0.05 * Math.sin(time * 1.3);
        light.intensity = 26 + Math.sin(time * 2.1) * 6;
        reef.position.y = waveHeight(lm.x, lm.z) * 0.2;
        seeds.forEach((m, i) => {
          const x = m.x + Math.sin(time * 0.2 * m.s + i) * 2, z = m.z + Math.cos(time * 0.17 * m.s + i) * 2;
          pos[i * 3] = x; pos[i * 3 + 1] = waveHeight(x, z) + 0.3 + m.h * (0.5 + 0.5 * Math.sin(time * m.s + i)); pos[i * 3 + 2] = z;
        });
        geo.attributes.position.needsUpdate = true;
      },
      dispose() { for (const o of objs) scene.remove(o); },
    };
  },
});
