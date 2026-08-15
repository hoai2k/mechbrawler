// Alternate paint jobs ("color schemes") so two players on the same mech
// stay readable. Pure color math + def-cloning — split out of roster.js so
// the roster stays data-only. A scheme recolors the PRIMARY armor
// (procedural synth AND texture-tint paths both read skin.primary.base/
// base2) plus the menu tint / glow.
//
// A scheme is a PAINT TARGET, not a hue swap. That distinction is what makes
// the white/black/silver mechs work. FENRIR (silver, L 0.73), WRAITH (near
// black, L 0.15), RHINO and SAURION (gunmetal) and GLACIER (pale ice) have
// almost no chroma to re-hue and sit at the far ends of the value range: force
// a hue onto them while keeping their own lightness and you get a silver mech
// with a faint tint, or a black mech that is still black. So every scheme also
// names the LIGHTNESS its paint wants (`lum`), and each mech's armor is dragged
// most of the way there (PULL) — carrying its own panel shading with it. A mech
// that already sits in the readable midtones (TITANUS, INFERNO, FROGGER…) barely
// moves, so the schemes that already worked are unchanged.

function hexToHsl(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export function smoothstep(e0, e1, x) {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Eleven paint jobs. Names are the mech's, not the crayon's — a robot wears
// EMBER, not "red". Order is the cycle order in mech select; STOCK first so
// the default pick is always the mech as its designer painted it, and the two
// achromatic jobs last so existing saved picks keep their meaning.
//
//   h      target hue — on the achromatic jobs it survives only as a warm/cool cast
//   minS   chromatic floor: saturation is raised to at least this
//   maxS   achromatic ceiling: saturation is pulled down to at most this
//   lum    the lightness this paint wants to sit at (see PULL below)
//   skin   overrides merged into skin.primary — how the paint takes light
//          (procedural synth); `metal` does the same job on baked GLB materials
export const SCHEME_NAMES = ['STOCK', 'EMBER', 'TIDE', 'MIDNIGHT',
  'AMETHYST', 'VERDANT', 'SOLAR', 'BLOSSOM', 'UMBER', 'IVORY', 'SILVER'];
export const SCHEME_COUNT = SCHEME_NAMES.length;
const SCHEMES = [
  null,
  { h: 0.02, minS: 0.6, lum: 0.40, glow: 0xff7a28 },   // EMBER — molten red-orange
  { h: 0.58, minS: 0.55, lum: 0.42, glow: 0x3fc8ff },  // TIDE — deep-sea blue
  // MIDNIGHT — blacked-out stealth: a cold cast, chroma bleached, value floored
  { h: 0.62, maxS: 0.13, lum: 0.10, dark: true },
  { h: 0.77, minS: 0.55, lum: 0.40, glow: 0xc07aff },  // AMETHYST — purple
  { h: 0.33, minS: 0.55, lum: 0.40, glow: 0x5fe08a },  // VERDANT — green
  { h: 0.09, minS: 0.7, lum: 0.52, glow: 0xffa62b },   // SOLAR — bright orange
  { h: 0.92, minS: 0.5, lum: 0.66, satMul: 0.9, glow: 0xff8fd0 },      // BLOSSOM — pink
  { h: 0.075, minS: 0.45, lum: 0.30, satMul: 0.55, glow: 0xc98b4a },   // UMBER — brown
  // IVORY — warm bone-white parade paint: matte, barely tinted, bright
  {
    h: 0.10, maxS: 0.11, lum: 0.82, glow: 0xffe6bc,
    skin: { metalPaint: 0.14, roughPaint: 0.62, grime: 0.22 },
  },
  // SILVER — bare polished metal: colder, a shade darker than ivory so the two
  // never read alike, and it takes light as METAL rather than paint
  {
    h: 0.58, maxS: 0.06, lum: 0.64, glow: 0xd6e8f7, metal: true,
    skin: { metalPaint: 0.9, roughPaint: 0.26, normalStrength: 1.25 },
  },
];

// ---------------------------------------------------------------------------
// FIRE IN THE TEAM COLOUR.
//
// A repainted mech's FLAMES should answer to the paint too — inferno in
// AMETHYST breathing purple, in VERDANT breathing green. But only where it
// reads as a deliberate colour: white, silver, black and brown are what an
// ordinary fire looks like against soot, and tinting those gives a muddy flame
// that just looks broken. So the rule comes off the scheme's own numbers rather
// than a hand-kept list — a scheme tints the fire when it has a chromatic FLOOR
// (`minS`, i.e. it is pushing paint toward a hue) and is not deliberately
// desaturating on top of it (`satMul`, which is what makes UMBER brown).
// MIDNIGHT, IVORY and SILVER have no `minS` at all (they cap saturation
// instead) and fall out on the first test.
//
// THE RAMP IS THE FIRE'S OWN, hue-swapped. A flame is four stops from a dark
// base through the body to a near-white core, and the shader already carried a
// second set for the blue gas-flame TIDE used. Those two are the same profile
// at different hues — saturation ~1, lightness 0.235 / 0.53 / 0.71 / 0.925 —
// so any hue can be generated from it, and TIDE comes back out of the formula
// as the blue it always was.
const FIRE_STOPS = [[0.98, 0.235], [0.96, 0.53], [1.0, 0.71], [1.0, 0.925]];
// where an ordinary flame already sits on the wheel — the atlas' own orange
const FIRE_HUE = 0.055;

/**
 * The four flame ramp stops for a colour scheme, or null for "ordinary fire".
 * @param {number} v  scheme index (def.variant)
 */
export function schemeFire(v) {
  const S = SCHEMES[v];
  if (!S || S.minS == null || (S.satMul ?? 1) < 0.8) return null;
  return {
    h: S.h,
    glow: S.glow ?? 0xffffff,
    stops: FIRE_STOPS.map(([sat, lum]) => hslToHex(S.h, sat, lum)),
    // …and the same move as a HUE ROTATION, in radians, for the sprite-based
    // flames. Their atlas bakes the orange ramp into its own pixels, so they
    // cannot be tinted by multiplying — the whole sampled colour is turned
    // around the wheel instead (see the particle shader's hueRot).
    rot: ((S.h - FIRE_HUE + 1.5) % 1 - 0.5) * Math.PI * 2,
  };
}

/** The same, straight off a roster def (`def.variant` is the scheme index). */
export const fireTintOf = (def) => schemeFire(def?.variant || 0);

// How far a mech's paint is dragged toward the scheme's target lightness. Not
// all the way: at 0.8 WRAITH in EMBER is unmistakably red but still the darkest
// red on the field, and FENRIR in UMBER is the palest brown — each mech keeps a
// trace of its own identity inside the team color.
const PULL = 0.8;

// Saturation the scheme wants for paint that arrives at `s`.
export function schemeSat(s, spec) {
  if (spec.maxS != null) return Math.min(s, spec.maxS);
  return Math.min(1, Math.max(s, spec.minS) * (spec.satMul ?? 1));
}

// Lightness after the scheme's value shift. `lumShift` is computed once per
// mech (paintSpec), so a pixel keeps its own relative shading while the mech as
// a whole slides to where the scheme's color can be seen. Tapered at both ends
// so shadow gaps stay black and speculars stay hot instead of sliding with it.
export function schemeLum(l, spec) {
  const t = smoothstep(0.02, 0.12, l) * (1 - smoothstep(0.86, 1.0, l));
  return clamp(l + spec.lumShift * t, 0.02, 0.97);
}

// The per-mech spec both repaint routes run on: the scheme's targets plus
// everything that depends on how the mech is painted TO BEGIN WITH.
function paintSpec(def, v, S) {
  const [stockHue, stockSat, stockLum] = hexToHsl(def.colors.primary);
  return {
    variant: v,
    dark: !!S.dark,
    hue: S.h,
    minS: S.minS,
    maxS: S.maxS,
    satMul: S.satMul,
    metal: !!S.metal,
    lumShift: (S.lum - stockLum) * PULL,
    glowHue: S.glow != null ? hexToHsl(S.glow)[0] : null,
    stockHue,
    // Which pixels of a baked GLB texture count as "the paint" (recolorglb.js).
    // On a VIVID mech that's the stock-hue family — saturated, near the primary
    // hue — and everything else (bare metal, decals, off-hue accents) is left
    // alone. On a near-grey mech that test is exactly backwards: its armor has
    // no hue to match and the only saturated pixels on it ARE the accents
    // (RHINO's red horn, SAURION's red eyes). So the low-chroma mechs invert
    // it — repaint the NEUTRAL pixels, protect the vivid ones — and neutralMix
    // crossfades between the two rules rather than switching at a cliff, since
    // GLACIER sits right on the line.
    neutralMix: smoothstep(0.30, 0.14, stockSat),
    satCeil: clamp(stockSat + 0.10, 0.16, 0.42),
    // and the value gates that keep shadow gaps / blown highlights out have to
    // straddle the mech's own paint, not a mid-grey mech's
    lumGate: [Math.min(0.04, stockLum * 0.25), Math.min(0.11, stockLum * 0.6),
      Math.max(0.90, stockLum + 0.16), Math.max(0.99, stockLum + 0.24)],
  };
}

const repaint = (hex, spec) => {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(spec.hue ?? h, schemeSat(s, spec), schemeLum(l, spec));
};

// swatch color for menus (cheap: primary after the scheme)
export function schemeSwatch(def, v = 0) {
  const S = SCHEMES[v];
  if (!S) return def.colors.primary;
  return repaint(def.colors.primary, paintSpec(def, v, S));
}

// Returns a def clone wearing the scheme; variant 0 is the stock paint.
export function applyColorScheme(def, v = 0) {
  const S = SCHEMES[v];
  if (!S) return def;
  // GLB mechs can't re-synthesize maps from the recolored skin, so they carry
  // this spec to recolorglb.js, which repaints the baked textures to match.
  const spec = paintSpec(def, v, S);
  const re = (hex) => repaint(hex, spec);
  return {
    ...def,
    variant: v,
    recolor: spec,
    colors: { ...def.colors, primary: re(def.colors.primary), glow: S.glow ?? def.colors.glow },
    skin: def.skin ? {
      ...def.skin,
      primary: {
        ...def.skin.primary, ...(S.skin || {}),
        base: re(def.skin.primary.base), base2: re(def.skin.primary.base2),
      },
    } : def.skin,
  };
}
