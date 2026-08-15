// The stage in 3D: extruded platforms, the background painting on a distant
// plane, the stage tint, and the domain-expansion backdrop. Everything is a
// linear image of sim space — platform positions are read from state.platforms
// every frame, so moving platforms (Bridge Duel's drift, Academy Hall's
// reshuffle) and ghost/crumble states carry over for free.
//
// Platform faces are painted by the SAME drawPlatformShape render.js uses,
// into a canvas texture — so the face of every box is pixel-for-pixel the
// platform the flat renderer draws, and the extrusion only adds the sides.

import {
  Group, Mesh, BoxGeometry, PlaneGeometry, MeshBasicMaterial,
  CanvasTexture, Texture, SRGBColorSpace, DoubleSide,
} from "../../vendor/three/three.module.js";
import { ORDER } from "./quads.js";
import { CAMERA as C } from "../config_camera.js";
import { getImage } from "../assets.js";
import { getStage } from "../stages.js";
import { drawPlatformShape } from "../render.js";
import { WORLD } from "../constants.js";
import { clamp } from "../utils.js";

const S = C.simScale;

// How deep the boxes are, world units. The main platform reads as the stage's
// bulk; side/top platforms are thinner slabs.
const DEPTH = { main: 1.4, side: 0.9, top: 0.9 };

// Where the stage's visible surface sits, relative to the gameplay plane at
// z = 0. BEHIND it, deliberately, by about six sim pixels.
//
// Characters live on z = 0 — that is what the plane means — and the sprites
// are drawn to stand on a platform with their feet overlapping its front edge.
// The platform surface used to sit a hair IN FRONT of them (+0.002), which is
// geometrically backwards: it put the stage between the camera and the feet,
// so anything with real depth standing on a platform had its feet eaten by it.
// Sprites do not notice (their quads paint over the stage by draw order — see
// billboards.js), but `?render=3d` puts an actual rig in this scene, and a rig
// has volume: with the surface in front, its feet vanished into the slab.
//
// Six pixels of z is invisible — it shifts the platform's apparent size by
// 0.45% — and it makes the arrangement honest: the floor is behind the things
// standing on it.
const SURFACE_Z = -0.06;

// Where the flat layers sit. The bg plane must over-fill the frustum at max
// dolly-out (intro is 1.25×D ≈ 16.8 units from a plane 14 behind the origin).
const BG_Z = -14;
const TINT_Z = -6;
const DOMAIN_Z = -5;

/** The group every sim-space thing hangs from. Its transform IS the §3
 *  mapping: children position themselves in sim pixels and come out in world
 *  units, +y up, stage centre at the origin. Z stays in world units (scale
 *  z = 1) so depth offsets are written in metres, not pixels. */
export function makeSimGroup() {
  const g = new Group();
  g.scale.set(S, -S, 1);
  g.position.set(-C.originX * S, C.originY * S, 0);
  return g;
}

// ----------------------------------------------------------------- platforms

const faceCanvasCache = new Map(); // key -> CanvasTexture

/** Texture of this platform's face, drawn by the flat renderer's own
 *  drawPlatformShape. Keyed by everything that changes the drawing, so state
 *  flips (ghost, accent) repaint and steady frames reuse. */
function faceTexture(p) {
  const key = `${p.kind}|${Math.round(p.w)}x${Math.round(p.h)}|${p.ghost ? "g" : ""}|${p.accent || ""}`;
  let tex = faceCanvasCache.get(key);
  if (tex) return tex;
  const pad = 16; // drawPlatformShape's drop shadow reaches +8/+12
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(p.w) + pad * 2;
  canvas.height = Math.ceil(p.h) + pad * 2;
  const ctx = canvas.getContext("2d");
  ctx.translate(pad, pad);
  // Shake is applied to the box's position, not baked into the texture.
  drawPlatformShape(ctx, { ...p, x: 0, y: 0, shakeMag: 0 });
  tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  faceCanvasCache.set(key, tex);
  return tex;
}

// The walkable surface, seen from the camera's slight down-angle. Lighter
// than the sides — it is the face the (implied) sky lights — and tinted per
// kind so the main stage reads warmer than the floating slabs, echoing the
// face gradients drawPlatformShape paints.
const topMat = { main: new MeshBasicMaterial({ color: 0x36405a }), other: new MeshBasicMaterial({ color: 0x2a3348 }) };
const endMat = new MeshBasicMaterial({ color: 0x141b2c });
const bottomMat = new MeshBasicMaterial({ color: 0x070a12 });
// A phased-out platform is only its dashed outline — no solid sides.
const ghostSideMat = new MeshBasicMaterial({ visible: false });

function makePlatformMesh(p) {
  const pad = 16;
  const depth = DEPTH[p.kind] ?? DEPTH.side;
  // Two parts: the extruded box at the platform's TRUE size — so its top face
  // is exactly the line fighters stand on — and the face texture on a plane
  // just in front, padded so drawPlatformShape's drop shadow survives. All
  // geometry is in WORLD units (sim px × S): these meshes live directly in the
  // scene, not the negative-y sim group, so textures stay upright.
  const group = new Group();
  const top = p.ghost ? ghostSideMat : (p.kind === "main" ? topMat.main : topMat.other);
  const end = p.ghost ? ghostSideMat : endMat;
  const bottom = p.ghost ? ghostSideMat : bottomMat;
  // BoxGeometry material order: +x, -x, +y (top), -y, +z (front), -z. The
  // front face is covered by the texture plane; painting it the top colour
  // keeps any sub-pixel seam invisible.
  const box = new Mesh(
    new BoxGeometry(p.w * S, p.h * S, depth),
    [end, end, top, bottom, top, bottom],
  );
  box.position.z = SURFACE_Z - depth / 2;
  group.add(box);
  // The face is a decal on the front of the box, and must NOT write depth.
  // Its texture is padded by `pad` on every side to make room for the drop
  // shadow drawPlatformShape paints, and a transparent fragment still writes
  // depth — so with depthWrite on, that invisible halo (and the shadow inside
  // it) occluded whatever was behind the platform, which is a hole in the
  // scene the shape of a rectangle nobody can see. The opaque box underneath
  // owns the depth, and it is the platform's true rect.
  const face = new Mesh(
    new PlaneGeometry((p.w + pad * 2) * S, (p.h + pad * 2) * S),
    new MeshBasicMaterial({
      map: faceTexture(p), transparent: true, side: DoubleSide, depthWrite: false,
    }),
  );
  face.position.z = SURFACE_Z + 0.001; // just proud of the box, to not z-fight it
  group.add(face);
  box.renderOrder = face.renderOrder = ORDER.platform;
  group.userData.key = null;
  return group;
}

/** Keep one box per live platform, positioned from state.platforms each
 *  frame. Rebuild a mesh only when its visual key changes. */
export function updatePlatforms(scene, platforms) {
  let list = scene.userData.platMeshes;
  if (!list) list = scene.userData.platMeshes = [];
  while (list.length > platforms.length) scene.remove(list.pop());
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    const key = `${p.kind}|${Math.round(p.w)}x${Math.round(p.h)}|${p.ghost ? "g" : ""}|${p.accent || ""}`;
    let mesh = list[i];
    if (!mesh || mesh.userData.key !== key) {
      if (mesh) scene.remove(mesh);
      mesh = makePlatformMesh(p);
      mesh.userData.key = key;
      list[i] = mesh;
      scene.add(mesh);
    }
    const sx = p.shakeMag ? (Math.random() - 0.5) * p.shakeMag : 0;
    const sy = p.shakeMag ? (Math.random() - 0.5) * p.shakeMag * 0.5 : 0;
    // Ghost platforms drop to a see-through shell so their absence is legible
    // in depth; the face texture already draws the dashed outline.
    mesh.visible = true;
    mesh.position.set(
      simX(p.x + p.w / 2 + sx),
      simY(p.y + p.h / 2 + sy),
      0,
    );
  }
}

function simX(x) { return (x - C.originX) * S; }
function simY(y) { return (C.originY - y) * S; }

// ---------------------------------------------------------------- background

const imgTexCache = new Map(); // HTMLImageElement -> Texture

function imageTexture(img) {
  let tex = imgTexCache.get(img);
  if (tex) return tex;
  tex = new Texture(img);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  imgTexCache.set(img, tex);
  return tex;
}

/** Parse "rgba(r, g, b, a)" / hex into { color, alpha } for a tint plane. */
function cssColor(str) {
  const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/.exec(str);
  if (m) {
    return {
      color: (Math.round(+m[1]) << 16) | (Math.round(+m[2]) << 8) | Math.round(+m[3]),
      alpha: m[4] !== undefined ? +m[4] : 1,
    };
  }
  const hex = /^#([0-9a-f]{6})/i.exec(str);
  return { color: hex ? parseInt(hex[1], 16) : 0x000000, alpha: 1 };
}

/** One-time planes: backdrop painting, the darkening wash, the stage tint and
 *  the domain layers. Sized on every frame instead of on stage change — the
 *  checks are cheap and it makes stage switching stateless. */
export function makeBackdrop() {
  const g = new Group();
  // Every backdrop layer draws before the stage and the fighters. They are
  // ordered among themselves by their z, which is why each `mk` below is
  // listed far-to-near.
  let seq = 0;
  const mk = (z, mat) => {
    const m = new Mesh(new PlaneGeometry(1, 1), mat);
    m.position.z = z;
    m.renderOrder = ORDER.backdrop + seq++;
    g.add(m);
    return m;
  };
  const backdrop = mk(BG_Z, new MeshBasicMaterial({ color: 0x0a0f1f }));
  // The same two washes drawBackdrop paints over the art: a constant darken,
  // then the stage's own tint.
  const dark = mk(TINT_Z - 0.02, new MeshBasicMaterial({ color: 0x03050c, transparent: true, opacity: 0.30 }));
  const tint = mk(TINT_Z, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  // Domain expansion: the dimming wash and the domain's own painting, both in
  // front of the backdrop, behind the platforms — exactly the flat renderer's
  // layering (dim covers the stage art, never the fighters).
  const domainDim = mk(DOMAIN_Z - 0.02, new MeshBasicMaterial({ color: 0x020208, transparent: true, opacity: 0 }));
  const domainArt = mk(DOMAIN_Z, new MeshBasicMaterial({ transparent: true, opacity: 0 }));
  const domainTint = mk(DOMAIN_Z + 0.02, new MeshBasicMaterial({ transparent: true, opacity: 0 }));
  g.userData = { backdrop, dark, tint, domainDim, domainArt, domainTint };
  return g;
}

/** Fit a plane at distance `z` so it fills the frustum with margin at the
 *  camera's farthest dolly-out. `dist` = camera z − plane z. */
function fitPlane(mesh, dist, fovDeg, aspect, img) {
  const h = 2 * dist * Math.tan((fovDeg * Math.PI / 180) / 2) * 1.5; // 1.5: never show an edge
  const w = h * aspect * 1.35;
  if (img) {
    const scale = Math.max(w / img.width, h / img.height);
    mesh.scale.set(img.width * scale, img.height * scale, 1);
  } else {
    mesh.scale.set(w, h, 1);
  }
}

export function updateBackdrop(g, st, cameraZ, fovDeg) {
  const { backdrop, dark, tint, domainDim, domainArt, domainTint } = g.userData;
  const stage = getStage(st.stageKey);
  const aspect = WORLD.w / WORLD.h;

  const img = getImage(`bg:${stage.key}`);
  if (img) {
    backdrop.material.map = imageTexture(img);
    backdrop.material.color.set(0xffffff);
    backdrop.material.needsUpdate = true;
  }
  fitPlane(backdrop, cameraZ - BG_Z, fovDeg, aspect, img);
  fitPlane(dark, cameraZ - dark.position.z, fovDeg, aspect);
  fitPlane(tint, cameraZ - TINT_Z, fovDeg, aspect);

  const t = cssColor(stage.tint);
  tint.material.color.set(t.color);
  tint.material.opacity = t.alpha;

  // Domain layers track state.domainOverlay's own fade.
  const d = st.domainOverlay;
  const a = d ? clamp(d.life / d.maxLife, 0, 1) : 0;
  domainDim.material.opacity = d ? Math.min(0.72, a * 0.8) : 0;
  const art = d?.sprite ? getImage(d.sprite) : null;
  if (art) {
    domainArt.material.map = imageTexture(art);
    domainArt.material.needsUpdate = true;
    fitPlane(domainArt, cameraZ - DOMAIN_Z, fovDeg, aspect, art);
  }
  domainArt.material.opacity = d && art ? Math.min(0.82, a * 1.35) : 0;
  if (d) {
    const dc = cssColor(d.color || "#000000");
    domainTint.material.color.set(dc.color);
    fitPlane(domainTint, cameraZ - domainTint.position.z, fovDeg, aspect);
  }
  domainTint.material.opacity = d ? Math.min(0.18, a * 0.22) : 0;
}
