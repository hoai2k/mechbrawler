# `assets/sprites/` — shared art

Drawings the renderer **spawns**, as opposed to drawings a fighter is **drawn
from**. These belong to no single character and can turn up in any match.

    effects/    techniques, projectiles, auras, impacts, stage-hazard polish
    summons/    shikigami and creature stills (config_summons.js)

Character sheets are **not** here — they live in `sprites/assets/`, along with
the manifest that indexes them. That includes Mahoraga, who is a summon in the
fiction but is animated out of a character sprite set like any fighter; the
still under `summons/mahoraga.png` is only the fallback for a set that fails its
pose check.

See `sprites/README.md` for the full split and the reasoning behind it. Python
tools take both roots from `tools/sprite_paths.py` (`SHARED` is this directory,
`CHAR` is the character tree).

Most of this is loaded by key from the catalogue in `src/assets.js` rather than
by manifest lookup. The exception runs the other way: the manifest's pseudo-
character `effects` indexes the install auras in `effects/` so the workbench can
place them like poses, and `spriteUrl()` in `src/assets.js` sends those paths
back here instead of to the character tree.
