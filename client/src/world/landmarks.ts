/** Procedural landmark models for campaign regions. */
import * as THREE from "three";

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

/** a half-sunk, broken-masted ship hull with ribs showing */
export function buildWreck(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat("#5a4030"), dark = mat("#3a2a20"), moss = mat("#4f6b3a"), sail = mat("#cfc4a8", { side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const hull = new THREE.Group();
  // keel + planked sides (open on top), tilted into the water
  const shape = new THREE.Shape();
  shape.moveTo(-7, 0); shape.quadraticCurveTo(-6, -2.6, 0, -3); shape.quadraticCurveTo(6, -2.6, 8, 0.6); shape.lineTo(-7, 0);
  const sideGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
  const left = new THREE.Mesh(sideGeo, wood); left.position.z = -2.2; left.rotation.x = 0.25;
  const right = new THREE.Mesh(sideGeo, wood); right.position.z = 1.85; right.rotation.x = -0.25;
  hull.add(left, right);
  for (let i = -5; i <= 6; i += 1.6) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.18, 4, 8, Math.PI), dark);
    rib.position.set(i, -0.3, 0); rib.rotation.set(Math.PI, Math.PI / 2, 0);
    hull.add(rib);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 3.4), wood); deck.position.set(4.5, 0.2, 0); deck.rotation.z = 0.08;
  hull.add(deck);
  hull.rotation.set(0.12, 0, -0.22);
  hull.position.y = 0.6;
  g.add(hull);
  // broken mast with a torn sail
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 9, 6), dark);
  mast.position.set(1, 4, 0); mast.rotation.z = -0.5;
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 3, 6), dark);
  stub.position.set(-4, 1.8, 0.2); stub.rotation.z = 0.2;
  const sailGeo = new THREE.PlaneGeometry(3.2, 3.6, 4, 4);
  const pos = sailGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, Math.sin(x * 1.3 + y) * 0.35); if (y < -1 && x > 0.5) pos.setY(i, y + 1.2); }
  sailGeo.computeVertexNormals();
  const torn = new THREE.Mesh(sailGeo, sail); torn.position.set(2.6, 5.4, 0.3); torn.rotation.set(0, 0.4, -0.5);
  g.add(mast, stub, torn);
  // barnacled rocks around it
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + (i % 3) * 0.4, 0), i % 2 ? moss : mat("#6d6a62"));
    const a = i * 1.37; r.position.set(Math.cos(a) * 6.5, -0.2, Math.sin(a) * 4.2);
    g.add(r);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; } });
  return g;
}
