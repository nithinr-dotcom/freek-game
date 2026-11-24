/** Shallows Bay client: the original layout plus the Old Wreck landmark (glows at night). */
import * as THREE from "three";
import { registerRegionClient } from "./registry";
import { buildWreck } from "../../world/landmarks";
import { addObstacle } from "../../world/layout";
import { waveHeight } from "../../world/ocean";

registerRegionClient({
  id: "shallows_bay",
  decorate(scene, def) {
    const lm = def.landmarks.find((l) => l.id === "old_wreck")!;
    const wreck = buildWreck();
    wreck.position.set(lm.x, 0, lm.z);
    wreck.rotation.y = 0.7;
    scene.add(wreck);
    addObstacle({ x: lm.x, z: lm.z, r: 6.5 });
    // moonlit glow: a light plus drifting motes that only show at night
    const light = new THREE.PointLight("#7f9cff", 0, 60, 1.4);
    light.position.set(lm.x, 4, lm.z);
    scene.add(light);
    const N = 40;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const seeds = Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, r: 3 + Math.random() * (lm.radius - 6), s: 0.2 + Math.random() * 0.5, h: Math.random() * 3 }));
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#a8c0ff", size: 0.6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    motes.frustumCulled = false;
    scene.add(motes);
    return {
      update(_dt, time, night) {
        light.intensity = night * (18 + Math.sin(time * 1.7) * 4);
        (motes.material as THREE.PointsMaterial).opacity = night * 0.9;
        motes.visible = night > 0.02;
        if (!motes.visible) return;
        seeds.forEach((m, i) => {
          const a = m.a + time * m.s * 0.2;
          const x = lm.x + Math.cos(a) * m.r, z = lm.z + Math.sin(a) * m.r;
          pos[i * 3] = x; pos[i * 3 + 1] = waveHeight(x, z) + 0.4 + m.h * (0.5 + 0.5 * Math.sin(time + i)); pos[i * 3 + 2] = z;
        });
        geo.attributes.position.needsUpdate = true;
      },
      dispose() { scene.remove(wreck, light, motes); },
    };
  },
});
