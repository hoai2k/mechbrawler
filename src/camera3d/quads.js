// Textured quads in sim space — the shared machinery under both the fighter
// billboards and the per-board garnish cards.
//
// Everything the 2.5D scene draws that is "a picture standing in the world" is
// one of these: a sprite frame, a projectile, a falling leaf, a traffic streak.
// They differ only in what texture they carry and how far off the gameplay
// plane they sit, so the placement, pooling and draw-order rules live here once
// rather than being reimplemented per effect.
//
// Placement is expressed as a 2D AFFINE IN SIM PIXELS, composed with the same
// post-multiply semantics as a canvas context. That is deliberate: it lets
// billboards.js replay `drawCharFrame`'s exact transform chain call for call,
// which is what makes 3d-mode placement match the flat renderer by
// construction instead of by tuning.

import {
  Group, Mesh, BufferGeometry, BufferAttribute, MeshBasicMaterial,
  Texture, SRGBColorSpace, DoubleSide, NormalBlending, Matrix4,
} from "../../vendor/three/three.module.js";

// ------------------------------------------------------------------- layers
//
// Draw order, stated rather than emergent. Every mesh in the scene sets one of
// these, because the scene mixes transparent quads (which three sorts back to
// front by depth) with opaque platform boxes (sorted front to back), and any
// layering left to that sort is a layering nobody chose. Larger draws later.
export const ORDER = {
  backdrop: -300,     // stage painting, tint washes, domain planes
  garnishBack: -200,  // cards BEHIND the action (skyline, distant billboards)
  platform: -100,     // the extruded stage
  billboard: 0,       // fighters and projectiles, +1 per draw in paint order
  garnishFront: 5000, // cards between the camera and the fight
};

// --------------------------------------------------------------- 2D affines
//
// Canvas semantics: each op post-multiplies, so `translate` then `scale` scales
// about the translated origin, exactly as ctx does.

export function matIdentity() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }

export function matTranslate(m, x, y) {
  m.e += m.a * x + m.c * y;
  m.f += m.b * x + m.d * y;
}

export function matScale(m, x, y) {
  m.a *= x; m.b *= x; m.c *= y; m.d *= y;
}

export function matRotate(m, t) {
  const cos = Math.cos(t), sin = Math.sin(t);
  const { a, b, c, d } = m;
  m.a = a * cos + c * sin; m.b = b * cos + d * sin;
  m.c = c * cos - a * sin; m.d = d * cos - b * sin;
}

/** The common case: an image rect centred at (cx, cy), `w` × `h` sim pixels,
 *  optionally turned about its own centre and/or mirrored. */
export function rectMatrix(cx, cy, w, h, { rotation = 0, flipX = false } = {}) {
  const m = matIdentity();
  matTranslate(m, cx, cy);
  if (rotation) matRotate(m, rotation);
  if (flipX) matScale(m, -1, 1);
  matTranslate(m, -w / 2, -h / 2);
  matScale(m, w, h);
  return m;
}

// ----------------------------------------------------------------- geometry
//
// One shared unit quad for every card in the scene. (0,0) is the image's
// top-left and (1,1) its bottom-right, in the y-down space the affines above
// work in; the UVs account for three.js's default flipY texture upload.

function unitQuad() {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array([
    0, 0, 0,  1, 0, 0,  0, 1, 0,  1, 1, 0,
  ]), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array([
    0, 1,  1, 1,  0, 0,  1, 0,
  ]), 2));
  geo.setIndex([0, 2, 1, 2, 3, 1]);
  return geo;
}

const QUAD = unitQuad();

// ----------------------------------------------------------------- textures

const texCache = new Map(); // HTMLImageElement -> Texture

/** A texture for an already-loaded game image, uploaded once and cached. The
 *  billboards reuse the sprite images the flat renderer has in memory, so this
 *  costs GPU memory only for frames actually drawn. */
export function imageTexture(img) {
  let tex = texCache.get(img);
  if (tex) return tex;
  tex = new Texture(img);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  texCache.set(img, tex);
  return tex;
}

// --------------------------------------------------------------- quad pool
//
// A frame rebuilds its quads from scratch: `begin`, then one `draw` per card,
// then `end` hides whatever the previous frame used and this one did not.
// Meshes and materials are recycled, so a steady scene allocates nothing.

const _m4 = new Matrix4();

/** `depthTest: false` makes a pool paint purely in `renderOrder`, ignoring what
 *  the depth buffer says is in front. That is not a hack around z-fighting —
 *  it is how the flat renderer works, and the fighters need it (see the note
 *  in billboards.js). */
export function makeQuadPool({ depthTest = true } = {}) {
  const group = new Group();
  const pool = [];
  let used = 0;

  return {
    group,

    begin() { used = 0; },

    /** One quad: `tex` placed by the sim-space affine `m`, at depth `z` world
     *  units off the gameplay plane (positive is toward the camera). */
    draw(tex, m, { z = 0, alpha = 1, blending = NormalBlending, color = 0xffffff, order = 0 } = {}) {
      let mesh = pool[used];
      if (!mesh) {
        mesh = new Mesh(QUAD, new MeshBasicMaterial({
          transparent: true, side: DoubleSide, depthWrite: false, depthTest,
        }));
        mesh.matrixAutoUpdate = false;
        pool.push(mesh);
        group.add(mesh);
      }
      used++;
      mesh.visible = true;
      const mat = mesh.material;
      mat.map = tex;
      mat.opacity = alpha;
      mat.blending = blending;
      mat.color.set(color);
      mat.needsUpdate = true;
      // Column-major fill of a 4×4 from the 2D affine: quad-local (u, v, 0)
      // lands at sim (a·u + c·v + e, b·u + d·v + f), pushed to depth z.
      _m4.set(
        m.a, m.c, 0, m.e,
        m.b, m.d, 0, m.f,
        0, 0, 1, z,
        0, 0, 0, 1,
      );
      mesh.matrix.copy(_m4);
      mesh.renderOrder = order;
      return mesh;
    },

    end() {
      for (let i = used; i < pool.length; i++) pool[i].visible = false;
    },

    /** How many quads the last frame drew. Only the smoke test reads this —
     *  it is the difference between "the scene threw no errors" and "the scene
     *  actually put something on screen", and those look identical from
     *  outside. */
    count() { return used; },
  };
}
