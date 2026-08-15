# JJK Brawler II — UI design language: **"Cursed Broadcast"**

This document is the design pass for the whole game shell — every menu, overlay
and HUD element — written as if designing it from scratch. The goal is the
register of a first-party platform fighter (Smash Bros. Ultimate is the open
reference): **dynamic, angled, loud where the game is loud, quiet where the
player is reading** — and consistent enough that any new screen designs itself.

---

## 1. Concept

Every screen is treated like a segment of a tournament broadcast for an anime
fight: hard diagonals, heavy condensed italics, fighter colors carried through
every surface, and the painted character art saved up and then spent BIG at the
two emotional peaks — the moment a battle starts, and the moment it ends.

Three rules govern everything:

1. **One angle.** A single slash angle (10°) is the game's entire geometry.
   Buttons, plates, ribbons, HUD panels, entrance motion — all of it leans on
   the same diagonal. One angle reads as a design; three read as a mistake.
2. **Loud type is earned.** The condensed italic display face is reserved for
   things the game is *shouting* — names, damage, VS, WINNER, screen titles.
   Everything the player must *read* (move descriptions, hints, stats) stays in
   a quiet upright text face. The contrast between the two is the visual system.
3. **Color is identity.** A seat's color follows its player everywhere: hero
   card, roster ring, HUD plate, results row, intro panel. Gold appears in
   exactly one context — victory — so it never devalues.

## 2. Design tokens

### Typography

| Role | Face | Case |
|---|---|---|
| Display (titles, names, VS, damage, buttons) | **Barlow Condensed** Italic 800/900, bundled woff2 (OFL) | UPPERCASE |
| Labels / chips / kickers | Barlow Condensed 600–800 | UPPERCASE, wide tracking |
| Reading text (blurbs, descriptions, hints) | Inter / system-ui, 400–700 | Sentence case |
| Numbers (clock, damage, stats) | tabular figures, always | — |

Barlow Condensed is the one dependency added — five latin woff2 files,
~115 KB total, served from `assets/fonts/` with no network fetch. Its 900
italic is the closest open face to the Smash Ultimate display register: tall,
tight, fast-leaning.

### Color

| Token | Value | Job |
|---|---|---|
| Ink | `#04060e` | page & panel ground |
| Panel | `rgba(9, 13, 26, .92)` | raised surfaces |
| Text / dim | `#eef1fb` / `#98a2c0` | reading / support |
| Cyan | `#62dcff` | system accent, interactivity, P1 |
| Crimson | `#ff4c55` | VS, danger, P2 |
| Jade | `#8cff65` | P3 |
| Amber | `#ffd35a` | P4 |
| **Victory gold** | `#ffd97a` | results screen ONLY |

### The slash

- Global angle: **10°** (`skewX(-10deg)` / 100°-gradient edges).
- Buttons and plates are parallelograms — skewed containers whose (upright,
  heavy) type inherits the lean, so text and frame agree instead of
  double-italicizing.
- Panels that hold *content* (grids, tables, art) stay rectangular with sharp
  2–4 px corners; the angle lives in their furniture: ribbons, name bands,
  kicker chips, accent spines. Art is never skewed.
- Surface texture: a barely-there diagonal hatch on the slash angle unifies
  panels without stealing contrast from text.

### Motion

- Screens **arrive along the slash axis**: backdrop fades ~180 ms, content
  slides in on the diagonal ~240 ms with a fast-out ease.
- Commits snap: lock-in, stage-draw landing, winner stinger all overshoot
  slightly and settle. Menus never bounce for browsing, only for committing.
- `prefers-reduced-motion` collapses every entrance and pulse to ~1 ms.

## 3. The two big art moments

### Battle intro — the VS splash

New screen. When a match launches, before the READY…GO! countdown, the screen
cuts to a full-bleed splash: each fighter's painted hero card **huge** (full
screen height in a 1-v-1), sliced into angled panels that slam in from the
sides, each carrying an italic name plate and seat chip; a massive crimson
**VS** monogram at the center; the arena's name on a plaque at the bottom.

- 1v1: two diagonal half-screens facing off.
- 3–8 fighters: a row of angled slats, every entrant present, team matches
  grouped by side.
- ~1.8 s total (slam in → hold → cut), then READY…GO! runs as before. It is a
  *cut-scene beat*, not a menu: no input, self-dismissing, reduced-motion safe.

### Results — the winner blowup

The results screen leads with the fighter, not the table: the winner's painted
card at ~2× its former size under a gold **WINNER** ribbon crossing it on the
slash angle, name in display italic at poster size, defeated fighters small,
grayscale and ranked beneath. The scoreboard keeps its fixed-grid columns but
sits in an angled-ribbon frame. Gold lives here and nowhere else.

## 4. Screen-by-screen

- **Fighter select** — hero cards get an angled seat-color header band (label
  chip + ready badge live on it); roster tiles stay rectangular for scanning,
  with angled name bands and sharp seat-color rings; category titles become
  slash-cut tags; the central VS column uses the display face; the primary
  action is a long parallelogram "GO" plate. The roster **sizes itself to the
  window** (`layoutCharacterGrid`): it tries every depth from 2 rows to 5, takes
  the tallest crop that fits at each, and keeps whichever gives the biggest
  cards — a deeper roster needs fewer columns per category and so buys card
  width with height. Ties go to the shallower layout. The height it fits into is
  the overlay less everything else in it, computed directly: #menuOverlay is a
  centred flex column, and centred content that overflows spills out of *both*
  ends, so `scrollHeight > clientHeight` under-reports an overflow by half and
  cannot be used as the fit test. It was, which is why the roster shipped for a
  while as a two-row band of 2/1 letterboxes across the bottom of an empty
  screen. Guarded by `tools/smoke_select_layout.mjs`.
- **Stage select** — straight 16:9 thumbnails (art wins), angled name bands,
  Random as a wide parallelogram draw button; the roulette highlight keeps its
  sweep-and-land grammar.
- **Move list / controls** — reading screen: quiet panel, display face only in
  the header, player columns keep their seat-color spines (now angled).
- **Settings / pause** — parallelogram button stacks; pause gets a huge
  "PAUSED" display title over a dimmed arena.
- **HUD** — fighter plates become parallelograms leaning into the arena,
  seat-color spine on the leading edge, damage in display italic 900, portrait
  counter-skewed upright; match clock in display face; arena plaque keeps its
  wooden-sign character (it is set dressing, not chrome).
- **Loading** — slash-cut progress bar, display-face status line.

## 5. Consistency contract

Any future screen follows from five questions: (1) shouting or reading? picks
the face; (2) whose is it? picks the seat color; (3) is it a surface or
furniture? picks rectangle vs. parallelogram; (4) how does it arrive? along the
slash; (5) is someone winning? only then, gold.
