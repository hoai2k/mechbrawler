// Where each mech's painted card is CROPPED — one number per character.
//
// The hero cards (assets/cards/<key>_card.jpg) are tall 3:4 paintings, and the
// UI shows them in eight differently-shaped holes: a 52px square beside the
// damage readout, a 44px square on the pause chip, the 3:4 select tile, the
// wide matchup art, the victory hero and its loser variant, the intro panel.
// Every one of those is `object-fit: cover`, so the browser scales the painting
// to fill and throws away the overflow — and what it throws away is decided by
// `object-position`.
//
// That used to be the keyword `top` everywhere, which is `50% 0%`: keep the top
// of the painting, crop off the bottom. It is the right answer for a mech whose
// head sits high in its frame and the wrong one for a mech painted small in a
// tall pose or standing low on its plinth — a square crop of those is a chest,
// or a plinth, rather than a face.
//
// A card's FOCUS is the height in the painting that should survive every crop,
// as a percentage from its top edge: 0 is the top edge (what everything did
// before), 50 the middle, 100 the bottom. It goes to CSS as the y half of
// `object-position: 50% <focus>%`, so a percentage here means exactly what it
// means there — align that point of the PAINTING with the same point of the
// HOLE — which is why a single number works for holes of eight different
// shapes instead of needing one offset each.
//
// AUTHORED IN THE WORKBENCH, not by eye in this file: /workbench/?edit=cards
// drags the line over the real painting and shows every one of those eight
// crops updating as it moves. Export from there, then:
//   node tools/apply_card_focus.mjs <the-exported.json>
// rewrites the table below.
//
// An absent key means 0 — the old `top` behaviour, exactly — so this file being
// empty is the same game it was before the focus existed, and a card nobody has
// tuned is never worse than it was.

export const CARD_FOCUS = {
  titanus:  35.3, // Titanus
  colossus: 31.1, // Colossus
  rhino:    40.4, // Rhino
  konga:    39,   // Konga
  tritone:  56.3, // Tritone
  viper:    17.1, // Viper
  saurion:  31.4, // Saurion
  fenrir:   24.9, // Fenrir
  tempest:  21.6, // Tempest
  wraith:   20.1, // Wraith
  frogger:  20.2, // Frogger
  jerry:    19.7, // Jerry
  vulcan:   17.2, // Vulcan
  inferno:  22.4, // Inferno
  glacier:  21.6, // Glacier
  cranky:   59.2, // Cranky
  nullbot:  26.7, // Nullbot
};

/** The crop focus for `key`, as a percentage from the painting's top edge.
 *  Untuned cards answer 0: the top-aligned crop the UI has always used. */
export function cardFocus(key) {
  const v = CARD_FOCUS[key];
  return Number.isFinite(v) ? v : 0;
}
