// Real rigged models inside the camera's own scene — the `?render=3d` half of
// `?camera=3d`.
//
// The other fighters in this mode are CARDS: a sprite frame, or (under
// `?render=billboard`) a posed-model texture, on a quad. That is right for
// those backends — a sprite is a drawing and a billboard is a billboard. It
// would be wrong here. `?render=3d` already has the fighter as live rigged
// geometry in a three.js scene; rendering it to an offscreen texture and
// pasting that flat card into a 3D scene would throw away the exact thing the
// backend exists to provide. So the rig goes in the scene, and the game's own
// perspective camera renders it:
//
//   * real perspective and foreshortening, from the actual viewing angle,
//     instead of the fixed ¾ offscreen camera;
//   * real depth against the extruded platforms — a fighter behind a slab is
//     occluded by the depth buffer, not by a painter's-algorithm sort;
//   * the micro-parallax dial retires, because a moving camera does for real
//     what that dial approximates when blitting flat.
//
// WHAT THIS MODULE OWNS
//
//   * a group in WORLD space, deliberately NOT a child of the sim group: that
//     group's transform is (S, -S, 1), and a negative Y scale mirrors a real
//     model and inverts its winding. Cards do not care; geometry does. So sim
//     coordinates are mapped here, by hand, exactly as makeSimGroup maps them.
//   * a light rig, because the camera's scene has none — every other thing in
//     it is unlit textured quads. The toon materials need lights to have a
//     terminator at all, and the colours come from the same stage-tint
//     derivation the flat path lights with, so a fighter is not lit two
//     different ways depending on a URL flag.
//   * one instance per FIGHTER, not per character: the registry holds a single
//     rig object per character, and two Gojos cannot both be posed from it.

import { Group, HemisphereLight, DirectionalLight } from "../../vendor/three/three.module.js";
import { CAMERA as C } from "../config_camera.js";
import { sceneAdapter } from "../render_backend.js";
import { headHeightTarget } from "../heights.js";
import { fighterTransform } from "../motion.js";
import { comFrac } from "../body_points.js";
import { LIGHT_RIG } from "../../render3d/src/light_rig.js";

const S = C.simScale;

export function makeModels() {
  const group = new Group();
  const lights = new Group();
  // The same rig the offscreen toon pass builds, from the same numbers
  // (render3d/src/light_rig.js) — hand-duplicating them here is how a fighter
  // gets lit two ways depending on a URL flag.
  const hemi = new HemisphereLight(LIGHT_RIG.hemi.sky, LIGHT_RIG.hemi.ground, LIGHT_RIG.hemi.intensity);
  const key = new DirectionalLight(LIGHT_RIG.key.color, LIGHT_RIG.key.intensity);
  // Roughly the flat path's key direction, in world axes: up, and toward the
  // camera-ish side, so the terminator falls where the offscreen render puts it.
  key.position.set(...LIGHT_RIG.key.position);
  lights.add(hemi, key);
  group.add(lights);

  let litFor = null;   // stage key the lights were derived for
  let drawn = 0;

  /** The pivot a roll turns about, as a fraction of the drawn height.
   *
   *  The MODEL's own centre when the backend can measure it — the body being
   *  turned here is the rig, and `comFrac` is a fraction of the DRAWN height,
   *  placed by eye. They are not the same body: an ordinary biped's spine sits
   *  around 0.58 while a hand-placed value sits nearer 0.5. The authored value
   *  stays the fallback, which is what a mech with no rig (or a rig built to
   *  some other convention) gets. */
  const modelComFrac = (charKey) => {
    const adapter = sceneAdapter();
    return adapter?.comFrac?.(charKey) ?? comFrac(charKey);
  };

  /** Sim pixels -> world units, the same mapping makeSimGroup applies, done
   *  by hand because this group must not inherit that group's -Y flip. */
  const worldX = (x) => (x - C.originX) * S;
  const worldY = (y) => (C.originY - y) * S;

  function syncLights(adapter, stageKey) {
    if (stageKey === litFor) return;
    litFor = stageKey;
    const tint = adapter.lightTint?.();
    if (tint) key.color.setRGB(...tint.key);
  }

  /** Place and pose one fighter's rig. Returns false when this fighter has no
   *  model, so the caller draws them as a card instead — the same
   *  per-character fallthrough the flat path has. */
  function place(f, adapter, aim) {
    const charKey = f.spriteChar || f.charKey;
    const inst = adapter.instance(charKey, f.id);
    if (!inst) return false;

    // The fighter's on-screen height in sim px — the same number the flat
    // blit solves against, so a model is the size its sprites would be.
    // (Summons pass their own scale in the flat path; they are drawn as cards
    // here, so there is no per-actor ratio to carry.)
    const onScreenPx = headHeightTarget(charKey);

    // The move's own hitbox delay, mirroring render.js actionBeat: the clip's
    // contact frame snaps to it (backend.js beatOverride).
    const delay = f.action?.move?.delay;
    const beat = typeof delay === "number" && f.action.anim === f.animKey ? delay : undefined;
    const posed = adapter.poseInstance(inst, charKey, f.animKey, f.animTime, {
      facing: f.facingVis, aim, x: f.x, chestY: f.y - onScreenPx * comFrac(charKey), beat,
      prevAnim: f.prevAnim,
    });
    if (!posed) return false;

    // Engine motion stays motion.js's, exactly as it is for sprites and for
    // the flat blits — read here and applied to the object instead of to a
    // canvas transform, so game feel does not change with the camera flag.
    const m = fighterTransform(f);
    const root = inst.root;

    // metres -> sim px -> world units. The rig's origin is on the floor
    // between the feet (delivery spec), so this positions the feet.
    const s = (onScreenPx / inst.height) * S * (inst.renderScale ?? 1);
    root.scale.set(s * (m.scaleX ?? 1), s * (m.scaleY ?? 1), s);
    // Tumble/swing is a roll in the screen plane, about the centre of mass —
    // the flat path rotates about that same point. The rig's origin is at the
    // FEET, so rotating in place would swing the body like a felled tree;
    // displace the origin so the COM stays fixed under the roll instead.
    // (Scale stays foot-anchored on purpose: squash keeps the feet planted.)
    //
    // THE ROLL IS OUTSIDE THE YAW, and the order is the whole of it.
    //
    // `rotation.y` on this same object carries the facing and the presentation
    // angle (pose.facingYaw), and three.js composes an Euler as XYZ by default —
    // which applies Z FIRST and then yaws the result, so the roll axis came out
    // as the BODY's local Z carried round by the yaw instead of the screen's.
    // Measured, a 45° roll puts a point one metre up at:
    //
    //   yaw   0°   (-0.707, 0.707,  0.000)   the screen-plane roll it should be
    //   yaw  60°   (-0.354, 0.707,  0.612)   half of it has become depth
    //   yaw  80°   (-0.123, 0.707,  0.696)   almost all of it has
    //
    // So a tumbling mech barely tipped on screen and instead swung toward the
    // lens — rolling about an axis pointing into the picture. ZYX applies the
    // roll last, which makes it a screen-plane roll at every yaw (exact, not
    // approximate: the numbers above are (-0.707, 0.707, 0) throughout). This
    // game turns travel states out toward profile, so its yaws are at the bad
    // end of that table.
    root.rotation.order = "ZYX";
    const rot = -(m.rotation || 0);
    root.rotation.z = rot;

    // THE CENTRE OF MASS IS THE ANCHOR, not the feet.
    //
    // The rig's origin is on the floor between them (delivery spec), so planting
    // the origin at `f.y` anchors the drawing by the soles. That is right on the
    // ground and wrong in the air: a body has no feet on anything mid-somersault,
    // and anchoring there makes the pose's own movement of the hips read as the
    // whole mech bobbing. What should hold still is the mass, and everything
    // else should hang off it.
    //
    // So: put the COM where the sim says the COM is, then — only when the mech is
    // standing on something — leave the feet where standOnGround (pose.js) put
    // them. Grounded, the two agree and the ground wins; airborne, the mass holds
    // and the limbs move around it.
    const com = onScreenPx * modelComFrac(charKey) * S * (m.scaleY ?? 1);
    const baseX = worldX(f.x + (m.offsetX || 0));
    const baseY = worldY(f.y + (m.offsetY || 0));
    // Rotating about the COM rather than the origin: displace the origin by where
    // the roll carries it, which is what keeps the mass fixed under the turn
    // instead of swinging the body like a felled tree.
    root.position.set(baseX + Math.sin(rot) * com, baseY + (1 - Math.cos(rot)) * com, 0);
    // Where the POSED mass actually is, which the clip moves and the fraction
    // above does not know about — a tuck carries it up, a crouch carries it down.
    // Airborne, correct for the difference so the mass stays put.
    if (!f.grounded) {
      const posed = adapter.posedComWorldY?.(inst) ?? null;
      if (posed !== null) root.position.y += (baseY + com) - posed;
    }
    // Outline width is authored in blitted pixels, and the ink shader spends
    // it in view space — so it takes world units per blitted pixel. One sim
    // pixel is S world units; the size dial rides along because a rig drawn
    // 1.2x bigger carries a 1.2x heavier line on the flat path too.
    adapter.setOutlineScale?.(root, S * (inst.renderScale ?? 1));

    if (root.parent !== group) group.add(root);
    root.visible = true;
    return true;
  }

  return {
    group,
    count: () => drawn,

    /** Which fighters this layer drew this frame, so billboards.js can skip
     *  them. Returns a Set of fighter ids — empty when the active backend has
     *  no object adapter (sprite and billboard modes), which is what makes
     *  this whole layer inert unless `?render=3d` is on. */
    update(st) {
      drawn = 0;
      const adapter = sceneAdapter();
      const live = new Set();
      const handled = new Set();
      if (!adapter || adapter.kind !== "object" || !adapter.ready?.()) {
        // Nothing of ours on screen: hide anything left from a previous frame
        // (a backend cannot change mid-session, but a match can end).
        adapter?.releaseExcept?.(live);
        for (const child of group.children) if (child !== lights) child.visible = false;
        return handled;
      }
      syncLights(adapter, st.stageKey);

      for (const child of group.children) if (child !== lights) child.visible = false;
      for (const f of st.fighters) {
        if (f.dead || f.respawnTimer > 0) continue;
        // A transformed fighter (Megumi as Mahoraga) draws from the install's
        // own still art in every mode; leave it to the card path.
        if (f.installs?.sprite) continue;
        const aim = nearestOpponentPoint(f, st);
        if (!place(f, adapter, aim)) continue;
        live.add(`${f.spriteChar || f.charKey}#${f.id}`);
        handled.add(f.id);
        drawn++;
      }
      adapter.releaseExcept?.(live);
      return handled;
    },
  };
}

/** The auto-aim target, mirroring render.js: the nearest live opponent's
 *  chest, or null. Duplicated rather than imported because render.js's copy is
 *  module-private and this is four lines. */
function nearestOpponentPoint(f, st) {
  let best = null;
  let bestD = Infinity;
  for (const o of st.fighters) {
    if (o === f || o.dead || o.respawnTimer > 0) continue;
    if (o.team != null && f.team != null && o.team === f.team) continue;
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best ? { x: best.x, y: best.y - 80 } : null;
}
