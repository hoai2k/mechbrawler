# What the engine has to build

An exported `.glb` carries the body, the skeleton, the anchors and the
animation. It cannot carry **behaviour that is geometry surgery** — the things
the game does *to* the mesh at runtime. This is that list, so a new game knows
what it is taking on before it promises a feature.

`characters.json` flags which of these each mech needs (`capabilities`).

---

## TITANUS' ROCKET FIST — the worked example

He throws his fist and it flies away as **real geometry**, then re-docks. On a
procedural body that is free: the fist is its own object under the hand joint,
and launching it is scaling that object to nothing. **An exported mech is one
skinned mesh** — Titanus is ~84,000 vertices in a single buffer, and the fist is
a few thousand of them in the middle of it, driven by a bone. So this is a real
cut, and it took five decisions worth repeating:

1. **Identify the fist by a painted selection, not by a bone.** The fist
   vertices are weighted to static `fistL` / `fistR` **tip bones** — rigid,
   never-animated children of `handL` / `handR`. Binding to them changes nothing
   about how the mech deforms; it is purely a stored selection meaning "this is
   the fist". Those bones are in the exported skeleton. *(A new rig would paint
   this once.)*
2. **Treat the selection as a seed, not as the answer.** Hand-painted weights
   have feathered edges and a break in solid armour must not. Take the
   wrist→fist axis from the two vertex clouds' centroids, find the threshold
   along it that best separates them, then flood-fill through the mesh from the
   seed without ever crossing back over that plane, claiming **whole triangles**.
   The cut comes out flat to triangle resolution, nothing is torn, and strays
   the artist left on a neighbouring bone travel with the fist instead of
   hanging in the open socket.
3. **Move the cut triangles into their own index range** (a geometry group) so
   detaching the fist is one material's `visible = false`. No second copy of an
   84k-vertex buffer per fighter, and the body still draws in one call.
4. **Hide the break with a backface layer, not a cap.** Cutting a closed shell
   exposes its inside, which renders as unlit inside-out geometry or as a hole
   in the silhouette. Capping the rim geometrically does not work — a mech fist
   is ~20 separate armour plates, so there is no single rim, and boundary-loop
   extraction fails at every non-manifold junction. Instead both halves carry a
   dark **BackSide** layer over the shell around the cut, in gunmetal. On closed
   shell it is hidden behind the front faces; exactly where the fist tore away,
   it is what you see.
5. **Cover the whole arm, not the wrist.** With the fist gone you are looking
   down an open tube, and the walls you can see are the forearm and upper-arm
   shells. Covering only the wrist left the arm see-through from the knuckles up.

**Known issue, honestly:** this step does not currently survive the game's own
model bake — a baked Titanus builds one mesh where an unbaked one builds three,
i.e. the split declines silently. His export is otherwise correct and carries
the `fistL`/`fistR` bones, so the cut is reproducible from the export; the
game-side bake is the thing that is broken, not the model.

---

## Geometry the model does NOT have, on purpose

Some sculpted detail was **deleted** from these models because an engine does it
better, and the bones it hung off were kept so the effect has something to ride.

| mech | what was removed | what replaces it |
|---|---|---|
| INFERNO | the sculpted flame tongues on both chimneys **and** both hand torches | live flame, embers and a smoke column emitted from `anchor_stackL/R` and `anchor_muzzleL/R`. A chimney vents **up in world space** whatever the spine does; a hand torch burns along its own barrel and swings with the arm. Direction is a property of the kind of burner. |
| TEMPEST | two sculpted zigzag "spark" squiggles | a live crackle: discrete spark bursts on ballistic arcs, a lip glow, occasional short arcs. Electricity is never still enough to be geometry. |
| KONGA | a 121-triangle blob | nothing — it was an artifact. |

Each opening was **capped** when the geometry came out, so there are no holes.

---

## Per-body geometry behaviour

- **Welded parts that must come apart (JERRY).** An auto-mesher returns one
  shell, so parts that sit close at bind pose get triangles running between
  them — his claw-arm wrists are welded to his shell, and without a cut the
  torso gets dragged across the arena when he swings. The fix is a **seam cut**:
  bridging triangles go to whichever side carries more of their weight, corner
  vertices are duplicated, cross-side weights stripped, and both rims capped.
  It is baked into the exported geometry, with a record kept in mesh extras so a
  deliberate split can still be told from a crack.
- **Organic bind (KONGA).** A cyborg gorilla's shoulder should swell into his
  chest, and a rigid one-bone-per-vertex bind can only draw a one-vertex-wide
  border. His weights are **feathered**: each bone's influence grows out of its
  own region across the mesh surface, dying away over a radius, with distance
  measured *across the surface* rather than straight-line. The face and the
  missile pods are exempt — a face that smears is never right, and a bolted-on
  launcher should keep a crisp seam. Baked in.
- **Surface walking (JERRY, KONGA).** They walk up walls and over roofs. The
  engine reduces nearby geometry to an average outward normal and a nearest
  point, damps the body toward it, and steps the limbs onto real contact points
  with a two-limbs-down rule. Jerry becomes part of the wall; Konga stays
  upright and hauls himself up by the hands.
- **Chains that go slack (FENRIR, TRITONE, WRAITH).** A tail or a cloak hem is
  a lever: a knocked-down body clamped to the floor will happily stand on its
  own tail tip and levitate. Named chains are solved limp when the body is
  down. Tritone additionally may never point a tail segment below his feet.
- **Bodies the shared clips do not fit (TRITONE).** His skull and three horns
  hang off an already-low chassis, and clips authored for a humanoid drive them
  through the pavement. The engine lifts the render container — never the
  physics body — when the lowest rendered vertex goes too far under.
- **Real weapon bones (VIPER, WRAITH).** Viper's daggers are actual bones off
  her forearms, so a thrown dagger can be collapsed and regrown; Wraith's rifle
  is in the model's **left** hand, so his arm animation tracks are swapped at
  playback.

---

## Hitboxes

Combat resolves against **bone-bound capsules measured off each model's own
geometry**, not a hand-authored collision mesh — so they follow the animation
and a new rig is covered the day it lands. Any bone carrying ≥1% of the mesh
that the 15 named joints cannot account for gets its own capsule, which is what
lets a crab's extra legs and a spear be hit. The measuring code is in
`lib/src/combat/hurtbox.js`.

---

## Not in the model at all

These are procedural and would have to be rebuilt: Wraith's cloak (grown at
runtime, simulated per row), every particle effect, the team-colour repaint
(which re-synthesizes the baked textures toward a paint target rather than
hue-shifting), and the facial performance.
