// Shared helper for design files.
import * as THREE from 'three';

export function addJoint(joints, name, parentName, x, y, z) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  joints[parentName].add(g);
  joints[name] = g;
  return g;
}
