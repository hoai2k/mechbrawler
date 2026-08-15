// Undo KHR_mesh_quantization at load, so nothing downstream has to know it
// happened.
//
// THE PROBLEM. The distribution build (tools/dist.mjs) can shrink the models
// ~2x further by quantizing vertex attributes to normalized integers. That is
// a lossless-looking change — the GPU denormalizes on the way in and the mech
// renders pixel-identically — but it is NOT a local change to the geometry.
// Quantization rescales the stored POSITION values and compensates by folding
// a matrix Q into the skin's INVERSE BIND MATRICES:
//
//     stored v'  =  Q⁻¹ · v          (positions shrink into ±1)
//     IBM'       =  IBM · Q          (the skin puts them back)
//
// so `boneWorld_k · IBM'_k` is Q at bind instead of the identity. Rendering
// goes through exactly that product and is unaffected. Everything that does
// NOT is silently wrong by Q:
//
//   · src/combat/hurtbox.js reads geometry to measure the combat capsules
//   · the custom-rig path REBUILDS a skeleton, computing fresh bone inverses
//     from bone world matrices — which discards Q entirely
//   · skinOps, anchor placement and the audit tools all read vertices
//
// Measured, before this existed: a quantized roster built at exactly 2x size,
// colossus' containment fell 80% -> 57% and both thigh capsules vanished. The
// models still looked right, which is what makes it dangerous.
//
// THE FIX. Q is a single matrix for the whole skeleton (verified per model
// below, not assumed), so it can simply be pushed back into the vertices at
// load time:
//
//     v*      =  bindMatrix⁻¹ · Q · bindMatrix · v'      (float32 again)
//     IBM*_k  =  IBM'_k · Q⁻¹
//
// which leaves `boneWorld_k · IBM*_k` at the identity and the rendered result
// bit-for-bit what it was. After this runs, a quantized GLB is indistinguishable
// from an unquantized one to every consumer, so no other file needs to care.
//
// An unquantized model has Q = identity and no normalized attributes; it exits
// at the first check having touched nothing.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Matrix4();
const _v = new THREE.Vector3();

/**
 * A quantized attribute as a plain, de-interleaved, non-normalized one.
 *
 * Read through getComponent() rather than off `.array`, because compressed
 * models arrive INTERLEAVED: several attributes share one buffer, and `.array`
 * is that whole shared buffer, not this attribute's values. (Copying `.array`
 * wholesale produces a mesh whose first vertex is perfect and whose every
 * other vertex is a reinterpretation of the neighbouring attributes — which
 * looks like a plausible-but-wrong model, not an obviously broken one.)
 * getComponent() handles both layouts and applies the normalized decode.
 *
 * skinIndex stays an integer array; everything else becomes float32.
 */
function toPlain(name, attr) {
  const Int = name === 'skinIndex';
  const out = Int ? new Uint16Array(attr.count * attr.itemSize)
    : new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) {
      out[i * attr.itemSize + c] = attr.getComponent(i, c);
    }
  }
  return new THREE.BufferAttribute(out, attr.itemSize, false);
}

/** Does this attribute need flattening — quantized values, or interleaved storage? */
function needsPlain(attr) {
  return !!(attr && (attr.normalized || attr.isInterleavedBufferAttribute));
}

/**
 * Q for a skeleton: boneWorld_k · IBM_k, which is the identity at bind for an
 * unquantized model. Returns null if the bones disagree — that would mean the
 * compensation is not a single uniform transform, and folding one matrix into
 * the vertices would be wrong. Better to leave the model alone and let the
 * (correct) rendering path carry it than to corrupt it confidently.
 */
function skeletonQ(skeleton) {
  if (!skeleton?.bones?.length) return null;
  const q = new THREE.Matrix4().multiplyMatrices(skeleton.bones[0].matrixWorld, skeleton.boneInverses[0]);
  for (let k = 1; k < skeleton.bones.length; k++) {
    _m.multiplyMatrices(skeleton.bones[k].matrixWorld, skeleton.boneInverses[k]);
    for (let i = 0; i < 16; i++) {
      if (Math.abs(_m.elements[i] - q.elements[i]) > 1e-4) return null;
    }
  }
  return q;
}

function isIdentity(m, eps = 1e-6) {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let i = 0; i < 16; i++) if (Math.abs(m.elements[i] - I[i]) > eps) return false;
  return true;
}

/**
 * Normalize a freshly loaded GLTF scene in place. Safe and near-free on models
 * that were never quantized. Returns a small report (handy in tests/tools).
 */
export function dequantizeScene(scene) {
  const report = { meshes: 0, skins: 0, folded: 0, skipped: 0, scale: 1 };
  scene.updateMatrixWorld(true);

  const meshes = [];
  scene.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshes.push(o); });

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    if (!geo?.attributes) continue;

    // Anything stored as a normalized integer becomes float32. This alone is
    // value-preserving — three's getX() already denormalizes, so code reading
    // through the accessor API saw these values anyway; code reading .array
    // directly did not, and now both agree.
    let touched = false;
    for (const name of Object.keys(geo.attributes)) {
      const attr = geo.attributes[name];
      if (!needsPlain(attr)) continue;
      geo.setAttribute(name, toPlain(name, attr));
      touched = true;
    }
    if (touched) report.meshes++;

    if (!mesh.isSkinnedMesh) continue;   // unskinned: the node transform still carries it
    report.skins++;

    const Q = skeletonQ(mesh.skeleton);
    if (!Q) { report.skipped++; continue; }
    if (isIdentity(Q)) continue;         // not quantized (or already folded)

    // v* = bindMatrix⁻¹ · Q · bindMatrix · v — the general form, because Q sits
    // AFTER bindMatrix in the skinning chain and the two need not commute.
    const M = new THREE.Matrix4()
      .copy(mesh.bindMatrix).invert()
      .multiply(Q)
      .multiply(mesh.bindMatrix);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(M);
      pos.setXYZ(i, _v.x, _v.y, _v.z);
    }
    pos.needsUpdate = true;

    // Q is a scale + translation, so directions are unchanged; the decode from
    // normalized bytes can leave them slightly off unit length, so renormalize.
    for (const name of ['normal', 'tangent']) {
      const a = geo.attributes[name];
      if (!a) continue;
      for (let i = 0; i < a.count; i++) {
        _v.set(a.getX(i), a.getY(i), a.getZ(i));
        if (_v.lengthSq() > 1e-12) _v.normalize();
        a.setX(i, _v.x); a.setY(i, _v.y); a.setZ(i, _v.z);
      }
      a.needsUpdate = true;
    }

    // IBM*_k = IBM_k · Q⁻¹, so boneWorld_k · IBM*_k is the identity again.
    _q.copy(Q).invert();
    for (const ibm of mesh.skeleton.boneInverses) ibm.multiply(_q);
    mesh.skeleton.update();

    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    report.folded++;
    report.scale = Q.elements[0];
  }

  return report;
}
