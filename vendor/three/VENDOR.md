# Vendored: three.js r185 (npm `three@0.185.1`)

Copied from the npm package, MIT licensed (LICENSE beside this file):

    three.core.js                  package/build/three.core.js, verbatim
    three.module.js                package/build/three.module.js, verbatim
    loaders/GLTFLoader.js          package/examples/jsm/loaders/GLTFLoader.js
    utils/BufferGeometryUtils.js   package/examples/jsm/utils/…
    utils/SkeletonUtils.js         package/examples/jsm/utils/…

The only edit: the three files under loaders/ and utils/ import from the bare
specifier `'three'`, which needs an import map this no-build repo does not
have — each had that one line rewritten to `'../three.module.js'`. Nothing
else is modified, so upgrading is: copy the new files, redo the one-line
rewrite, update the version here.

Vendored because the repo has no build step and no runtime npm: plain ES
modules are the only way to ship a dependency. This copy lives at
`/vendor/three/` and is SHARED by every feature that needs an engine —
**only `billboards/src/`, `render3d/src/`, `src/camera3d/` and their
workbenches may import from here**:

    billboards/src/   ?render=billboard  models posed at quantised holds
    render3d/src/     ?render=3d         the same rigs animated live
    src/camera3d/     ?camera=3d         the 2.5D perspective camera

The rule is about the ENTRY PATH, not about any one import statement: a
player who picks none of them must never download ~2 MB of 3D engine, so
**nothing statically reachable from `src/main.js` may name this directory**.
Either way of honouring that is fine — the two backends reach it through a
dynamic `import()` inside otherwise-static modules, while `src/camera3d/*`
imports it statically and is itself only `import()`ed once main.js has seen
`?camera=3d`. What is NOT fine is a static import chain from main.js.

One copy, one version: the moment two of these need different three.js
versions, something has gone wrong upstream. Two copies would not merely
waste the bytes — the modes compose, so both could be live at once, and two
engines have mutually unrecognisable classes (a `Mesh` from one is not a
`Mesh` to the other). That fails as objects silently not rendering rather
than as an error.
`tools/check_imports.mjs` does not scan this directory; it is third-party
code, not ours to lint.
