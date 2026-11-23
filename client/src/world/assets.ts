/**
 * Optional glTF overrides. Reads /models/manifest.json:
 *   { "<key>": { "file": "boat.glb", "scale": 1, "yOffset": 0, "rotY": 0, "anims": ["Swim"] } }
 * If a key is present its GLB is used instead of the procedural model, otherwise the procedural
 * builder runs. Keys: boat, dock, lighthouse, island_palm, palm_tree, rock_1..3, barrel, crate, buoy,
 * fish_<shape>, fish_generic, monster_serpent, monster_kraken.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface ManifestEntry { file: string; scale?: number; yOffset?: number; rotY?: number; anims?: string[] }
export type Manifest = Record<string, ManifestEntry>;

const loaded = new Map<string, { gltf: GLTF; entry: ManifestEntry }>();
let manifest: Manifest = {};

export const Assets = {
  /** Load manifest + all listed GLBs. Never throws: missing manifest/files fall back to procedural. */
  async init(baseUrl = "/models/"): Promise<void> {
    try {
      const res = await fetch(`${baseUrl}manifest.json`, { cache: "no-cache" });
      if (!res.ok) return;
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("json")) return; // dev server may serve index.html for missing files
      manifest = (await res.json()) as Manifest;
    } catch {
      return;
    }
    const loader = new GLTFLoader();
    await Promise.allSettled(
      Object.entries(manifest).map(async ([key, entry]) => {
        if (!entry || !entry.file) return;
        try {
          const url = entry.file.startsWith("/") || entry.file.startsWith("http") ? entry.file : baseUrl + entry.file;
          const gltf = await loader.loadAsync(url);
          gltf.scene.traverse((o) => {
            const me = o as THREE.Mesh;
            if (me.isMesh) { me.castShadow = true; me.receiveShadow = true; }
          });
          loaded.set(key, { gltf, entry });
        } catch (e) {
          console.warn(`[assets] failed to load ${key} (${entry.file}), using procedural`, e);
        }
      }),
    );
  },

  has(key: string): boolean { return loaded.has(key); },

  /**
   * Returns a new instance for `key`: the GLB (wrapped in a Group with manifest transform applied)
   * or `fallback()` when the key is not in the manifest. A GLB instance carries an AnimationMixer
   * in `userData.mixer` (call mixer.update(dt)).
   */
  create(key: string, fallback: () => THREE.Object3D): THREE.Object3D {
    const item = loaded.get(key);
    if (!item) return fallback();
    const { gltf, entry } = item;
    const inner = skeletonClone(gltf.scene);
    const s = entry.scale ?? 1;
    inner.scale.setScalar(s);
    inner.position.y = entry.yOffset ?? 0;
    inner.rotation.y = entry.rotY ?? 0;
    const wrap = new THREE.Group();
    wrap.name = `glb:${key}`;
    wrap.add(inner);
    wrap.userData.fromGLB = true;
    if (gltf.animations.length) {
      const mixer = new THREE.AnimationMixer(inner);
      const names = entry.anims ?? [];
      const clips = names.length ? gltf.animations.filter((c) => names.includes(c.name)) : gltf.animations.slice(0, 1);
      for (const c of clips.length ? clips : gltf.animations.slice(0, 1)) mixer.clipAction(c).play();
      wrap.userData.mixer = mixer;
    }
    return wrap;
  },
};

export function updateMixer(o: THREE.Object3D, dt: number) {
  const mx = o.userData.mixer as THREE.AnimationMixer | undefined;
  if (mx) mx.update(dt);
}
