/** Static geometry helpers: merge a hierarchy per material, or instance it. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function collect(obj: THREE.Object3D): Map<THREE.Material, THREE.BufferGeometry[]> | null {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  let ok = true;
  obj.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    if ((me as unknown as THREE.SkinnedMesh).isSkinnedMesh) { ok = false; return; }
    const mats = Array.isArray(me.material) ? me.material : [me.material];
    const src = me.geometry;
    const m = new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld);
    const groups = Array.isArray(me.material) && src.groups.length ? src.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    const base = src.index ? src.toNonIndexed() : src.clone();
    for (const gr of groups) {
      const mat = mats[gr.materialIndex ?? 0];
      const g = new THREE.BufferGeometry();
      const pos = base.attributes.position as THREE.BufferAttribute;
      const start = gr.start, count = Math.min(gr.count, pos.count - start);
      g.setAttribute("position", new THREE.Float32BufferAttribute((pos.array as Float32Array).slice(start * 3, (start + count) * 3), 3));
      g.applyMatrix4(m);
      g.computeVertexNormals();
      const list = byMat.get(mat) ?? [];
      list.push(g);
      byMat.set(mat, list);
    }
  });
  return ok ? byMat : null;
}

/** Merge all meshes below `obj` into one mesh per material (local space of obj). Returns obj itself if it can't. */
export function bake(obj: THREE.Object3D, castShadow = true): THREE.Object3D {
  const byMat = collect(obj);
  if (!byMat) return obj;
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const me = new THREE.Mesh(merged, mat);
    me.castShadow = castShadow;
    me.receiveShadow = true;
    out.add(me);
  }
  return out;
}

export class InstancedProp {
  readonly meshes: THREE.InstancedMesh[] = [];
  constructor(proto: THREE.Object3D, public readonly count: number, castShadow = true) {
    const byMat = collect(proto);
    if (!byMat) throw new Error("cannot instance skinned mesh");
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const im = new THREE.InstancedMesh(merged, mat, count);
      im.castShadow = castShadow;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.meshes.push(im);
    }
  }
  setMatrix(i: number, m: THREE.Matrix4) { for (const im of this.meshes) im.setMatrixAt(i, m); }
  commit() { for (const im of this.meshes) im.instanceMatrix.needsUpdate = true; }
  addTo(parent: THREE.Object3D) { for (const im of this.meshes) parent.add(im); }
}
