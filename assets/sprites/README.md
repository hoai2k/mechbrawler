# `assets/sprites/` — shared art

Drawings the renderer **spawns**, as opposed to a fighter's own body (which is
a rigged GLB under `mechs/`, indexed by `render3d/assets/manifest.json`).
These belong to no single mech and can turn up in any match.

    effects/    projectile art the ult directors draw (currently just nail.png,
                the flechette sprite Titanus's SIEGE PROTOCOL volleys use)
    garnish/    near-field cards for the 3D camera's garnish layer
                (src/camera3d/garnish.js) — lanterns, vehicles, rubble,
                hoardings, leaves. Each has a procedural fallback, so the set
                can change one file at a time.

Everything here is loaded by key from the catalogue in `src/assets.js`.
The JJK-era effect/summon/aura sheets were removed in the Mech Brawler
conversion (plan task K4); new power-effect art is requested through
`docs/image-requests.md` and lands here when delivered.
