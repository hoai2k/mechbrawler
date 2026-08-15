# JJK Brawler II — Character Research & Design

How each fighter's canon abilities and personality from *Jujutsu Kaisen* were
translated into stats, specials, ultimates, and passives. Numbers live in
`src/characters.js`; this document explains **why** each kit is the way it is.

**Names:** each section heading is `Full Name — "Epithet"`, and both are
canonical. `src/characters.js` mirrors them as `fullName` and `epithet`, next to
the short `name` the roster tiles and in-match HUD use where space is tight. The
hero card on the select screen shows the full name. Adding a fighter means
adding all three; they should not drift from the heading here.

**Reading a kit:** every character has universal lights/heavies (same inputs,
different reach/speed/damage/effects), three specials (neutral, side, down),
one ultimate, and one always-on passive. Seven of them also have a **Domain
Expansion** — see the section at the end.

**Nothing is staged.** Round 15's four late additions — Mechamaru, Yuki
Tsukumo, Dagon and Kurourushi — were built in full in `src/characters.js` before
any of their art existed, held off the select screen by `STAGED_CHARACTER_KEYS`
while it was drawn. All four have now shipped; Kurourushi was the last, joining
the Curses group once his 36-pose set was placed and approved. The roster is 27
fighters and `STAGED_CHARACTER_KEYS` is empty.

The staging machinery stays, because it is how the next fighter gets built:
`node tools/smoke_staged.mjs` plays every staged kit's moves in a real match
(with nothing staged it still checks the round-15 mechanics no other fighter
exercises), and the sprite workbench lists staged fighters alongside the roster,
labelled *(not on the roster yet)*, so a delivered set can be placed and
approved before the fighter is promoted. All four of round 15's went that way.

**Cursed Energy has two tiers.** An ultimate costs **half** a bar, so a match
has several. A Domain Expansion costs the **whole** bar and only the seven
fighters who canonically have one can open it. That is what makes the second
half of the bar a decision instead of a formality: bank it for the domain, or
spend it now on a second ultimate. Stats shown as
*speed / weight* where speed is ground px/s and weight divides knockback
(higher = harder to launch).

Research sources: the series itself plus the
[Jujutsu Kaisen Wiki](https://jujutsu-kaisen.fandom.com/) (see the References
section at the bottom).

---

## Satoru Gojo — "The Honored One"
**Canon:** The strongest sorcerer alive. The Limitless technique manipulates
space at infinity — attacks simply never arrive (Infinity), while Blue
(attraction), Red (repulsion), and Hollow Purple (their fusion — erasure) weaponize
it. Six Eyes gives him perfect information. Personality: playful, arrogant,
untouchable — and backs every bit of it up.

**Design mapping:** Fastest all-rounder in the game but the second-lightest —
he wins by *not being touched*, and when you finally do tag him, he goes flying.
His whole kit is about control of space.
- *Stats:* 468 speed / 0.92 weight — top-tier mobility, glass frame.
- **Lapse: Blue** (neutral): a slow attraction core that **drags the opponent
  toward it** before popping — sets up combos and ruins retreats.
- **Reversal: Red** (side): repulsion — modest damage, brutal knockback, and it
  **deletes enemy projectiles** along its path.
- **Infinity** (down): a counter stance. The next attack "stops before it
  reaches him" — nullified and answered automatically.
- **Ultimate — Hollow Technique: Purple:** a massive erasing mass that crosses
  the entire stage, unblockable. The screen-clearing statement piece.
- *Passive — Infinity:* his shield takes 45% less damage; chip-outs don't work
  on the Limitless.

## Yuta Okkotsu — "Rika's Beloved"
**Canon:** Special-grade student haunted by (and devoted to) Rika, the Queen of
Curses; an enormous cursed-energy pool, refined swordsmanship, Reverse Cursed
Technique healing, and full Rika manifestation. Personality: gentle and
self-sacrificing until someone he loves is threatened — then terrifying.

**Design mapping:** The honest all-rounder with a guardian angel. Clean sword
buttons, one of the game's only heals, and a love-powered comeback engine.
- *Stats:* 402 / 1.02 — textbook midweight.
- **Cursed Energy Slash** (neutral): sword-beam projectile.
- **Rika's Claw** (side): Rika rakes a huge box in front of him — big, delayed,
  scary.
- **Reverse Cursed Technique** (down): channel to heal ~9%/s for 1.4 s —
  interruptible, so it's a spacing reward.
- **Ultimate — Full Manifestation: Rika:** for 9 s Rika **echoes every melee
  hit** with bonus damage of her own.
- *Passive — Bond of Love:* past 100% damage his damage rises 12% — he gets
  scarier as he's cornered, exactly like the Shibuya novel fight.

## Kinji Hakari — "The Gambler"
**Canon:** Suspended student who runs an illegal fight club; his domain, Idle
Death Gamble, is a pachinko parlor — hitting the jackpot grants **4 minutes 11
seconds of infinite cursed energy**, with reflexive Reverse Cursed Technique
making him effectively immortal for the duration. Personality: thrill-addict,
mouthy, thrives on momentum and risk.

**Design mapping:** A brawler whose entire game plan is *getting to jackpot*.
- *Stats:* 415 / 1.08 — sturdy rush frame.
- **Rough Energy Shutter** (neutral): slams a piercing shutter-door wave.
- **Restless Rush** (side): advancing multi-hit flurry.
- **Reserve Balance** (down): **spin the reels** — random heal, meter, damage
  buff, or a dud. Pure Hakari.
- **Ultimate — JACKPOT:** he skips the reels and simply collects — an 8 s
  install of constant healing, hyper-armor (no hitstun), +damage and +speed.
  Playing the reels for a bigger payout is his Domain Expansion.
- *Passive — Gambler's Flow:* builds ultimate meter 30% faster than anyone
  else. The house always reaches jackpot eventually.

## Maki Zen'in — "Heavenly Restricted"
**Canon:** Born with a Heavenly Restriction — no cursed energy at all, traded
for superhuman physique (eventually Toji-tier). Fights with cursed tools:
Playful Cloud, the Dragon-Bone sword, the Split Soul Katana that cuts the soul
directly. Personality: defiant, disciplined, driven to overthrow the clan that
called her worthless.

**Design mapping:** Pure rushdown with zero magic and maximum steel — the
anti-defense character. If they hide in shield, Maki is the answer.
- *Stats:* 452 / 1.00 — second-fastest, real weapons give her the longest
  normal reach.
- Her lights and heavies all carry **weaponBreak** (+18 flat shield damage);
  her side special multiplies that.
- **Cursed Tool Toss** (neutral): her only "projectile" — she throws hardware.
- **Playful Cloud** (side): invincible-startup three-section-staff rush with a
  3× shield multiplier — a guard-break on a stick.
- **Split Soul Stance** (down): 3.2 s where her attacks **ignore shields
  entirely** — the katana cuts the soul, not the guard.
- **Ultimate — Heavenly Restriction: Awakening:** the night the Zen'in clan
  ended, as an install: +35% speed, +30% damage for 8 s.
- *Passive — Heavenly Restriction:* immune to burn/snare/soul-mark/cursed
  speech. A body without cursed energy can't be cursed.

## Megumi Fushiguro — "Ten Shadows"
**Canon:** Zen'in-blooded user of the Ten Shadows technique — shikigami
summoned from shadow: Divine Dogs, Nue, the Great Serpent, toads, and at the
apex the never-tamed Mahoraga, the wheel-crowned general that **adapts to any
phenomenon**. Personality: reserved, tactical, self-sacrificing to a fault
("I'll save people unfairly").

**Design mapping:** Mid-range tactician — his shikigami fight so he doesn't
have to.
- *Stats:* 418 / 0.96 — nimble but light.
- **Nue** (neutral): diving shadow-bird arc that **paralyzes** (snare).
- **Ten Shadows: Shikigami** (side): calls whichever shikigami answers, and it
  is a different one every cast — the **Divine Dogs** (two hunters that chase
  and bite), the **Great Serpent** (fast, enormous reach, fragile), the
  **Toad** (holds ground behind him and lashes), **Max Elephant** (slow, huge,
  very hard to remove) or a scatter of three **rabbits**. Ten shikigami is the
  whole of his technique, so one dog forever was the one thing it should never
  have been.
- **Shadow Sink** (down): melts into his own shadow, teleporting through
  danger (an invincible reposition).
- **Ultimate — Mahoraga:** the full ritual. The general drops onto the stage as
  his own actor and fights like a character for 10 s — walking in, jumping at
  anyone above him, and choosing between a fast swipe, a committed smash and an
  anti-air cleave — while Megumi keeps his own body and his own controls beside
  him, taking reduced damage. He has 150 HP and can be killed, but **adapts**
  after 8 hits taken and halves everything after that. (He summoned it; you deal
  with it.)
- *Passive — Ten Shadows:* summon specials refund extra ultimate meter.

## Nobara Kugisaki — "Straw Doll Sorceress"
**Canon:** Straw Doll Technique: cursed nails driven by hammer, **Hairpin**
detonating planted nails, and **Resonance** channeling damage through a straw
doll into anything marked by her nails — range means nothing. Personality:
loud, vain, utterly fearless; "I love me."

**Design mapping:** The mark-economy zoner. Every nail that lands is money in
the bank; her specials decide when to cash out.
- *Stats:* 400 / 0.98.
- Her lights and heavies plant **nail marks** (up to 6 with her passive).
- **Nail Shot** (neutral): twin nail projectiles — the mark applicator.
- **Hairpin** (side): detonates *all* marks — damage and knockback scale with
  the count. Six-mark Hairpin is a KO.
- **Resonance** (down): unblockable soul damage to a marked target **anywhere
  on screen** — punishes runaways; keeps half the marks.
- **Ultimate — Deluxe Resonance:** a storm of nails from every direction, then
  a full-power resonance ritual finisher.
- *Passive — Straw Doll Technique:* marks last twice as long, stack twice as
  high.

## Toge Inumaki — "Cursed Speech User"
**Canon:** Inherited Cursed Speech — spoken commands the world must obey:
"Don't move," "Blast away," "Get crushed," "Sleep." Overuse tears his throat
(cough syrup and blood). Speaks only in onigiri ingredients to keep everyone
safe. Personality: kind, laconic, quietly heroic.

**Design mapping:** A controller whose resource is his own throat.
- *Stats:* 408 / 0.98.
- **"Blast Away"** (neutral): a cone shout with huge knockback for its damage.
- **"Don't Move"** (side): a word-projectile that **locks the target in
  place** — his combo starter and edge-guard.
- **"Get Crushed"** (down): mid-range slam that smashes airborne enemies into
  the ground.
- **Ultimate — "GET TWISTED AND BLAST AWAY":** a stage-buckling scream —
  colossal knockback across most of the arena, followed by an involuntary
  coughing fit (specials sealed 4 s). Power at a price, exactly in character.
- *Passive — Throat Strain:* commands stack strain; three quick casts trigger
  a coughing lockout. Pace your words.

## Panda — "Not Just Any Panda"
**Canon:** An Abrupt Mutated Cursed Corpse built by Principal Yaga with three
cores he thinks of as siblings: the balanced Panda, the power-type **Gorilla**
brother (Unblockable Drumming Beat), and the bashful **Triceratops** sister.
Personality: easygoing, wise-cracking, secretly the school's most stable soul.

**Design mapping:** The armored heavyweight with a mode switch.
- *Stats:* 356 / 1.28 — slowest and heaviest body in the game.
- **Unblockable Drumming Beat** (neutral): the guard-ignoring palm, straight
  from canon.
- **Cursed Corpse Charge** (side): armored tackle — he trades and wins.
- **Gorilla Mode** (down): core swap install — slower, +30% damage, hits
  cannot stagger him.
- **Ultimate — Sister Core: Triceratops:** the third sibling wakes up: an
  unstoppable horned stampede, wall to wall, three passes.
- *Passive — Abrupt Mutated Body:* cotton, cores, and stubbornness — takes 10%
  less knockback from everything.

## Aoi Todo — "My Brother"
**Canon:** Kyoto's powerhouse; **Boogie Woogie** swaps the positions of
anything with cursed energy on a clap. A physical monster (Black Flash user)
whose real weapon is making opponents doubt every distance. Devoted superfan
of idol Takada-chan; adopts kindred spirits as "my brother."
Personality: loud, theatrical, shockingly perceptive in a fight.

**Design mapping:** A grappler whose gimmick is geometry: nowhere is safe when
positions are one clap away.
- *Stats:* 392 / 1.18 — heavy bruiser.
- **Boogie Woogie** (neutral): **swap places with the opponent** instantly,
  with a followup strike as they reel. Projectile incoming? Clap. Cornered?
  Clap.
- **Vigorous Lariat** (side): freight-train shoulder rush.
- **Takada-chan Devotion** (down): a restorative moment of idol worship —
  meter and a little healing.
- **Ultimate — Boogie Woogie: Zero-Distance Finale:** a teleporting beatdown —
  six swaps, six hits, one **Black Flash** finisher.
- *Passive — Ride the Wave:* landing heavies pumps him up: +8 bonus meter per
  heavy hit.

## Momo Nishimiya — "Witch of the Wind"
**Canon:** Kyoto third-year; Tool Manipulation lets her ride and telepathically
steer her broom, firing **Wind Scythe** vacuum blades sharpened with debris.
Personality: prideful, protective of her juniors, fights smart because she
can't fight heavy.

**Design mapping:** The lightest, floatiest zoner — queen of the air, allergic
to getting hit.
- *Stats:* 428 / 0.88 — lightest in the game, best air drift, and **three
  jumps** (broom).
- **Wind Scythe** (neutral): twin vacuum blades.
- **Broom Charge** (side): a flying rush that works midair — offense and
  recovery in one.
- **Updraft** (down): a wind column that flings enemies skyward and lifts
  Momo herself — anti-air and escape hatch.
- **Ultimate — Maximum: Great Tempest:** the whole sky answers: a stage-wide
  storm that drags, grinds, and finally launches.
- *Passive — Tool Manipulation:* the extra jump and drift are the passive.

## Kento Nanami — "The Salaryman"
**Canon:** Ex-salaryman, grade 1 sorcerer. **Ratio Technique** marks any
target with a 7:3 line where a weak point is forced into existence — his blunt
blade always finds it. Declares **Overtime** when work runs late, unlocking
his reserves. Personality: weary professionalism, dry kindness, absolute
reliability.

**Design mapping:** The precision midweight. His whole kit rewards exact
spacing — hit at the 7:3 distance and everything crits.
- *Stats:* 388 / 1.14 — deliberate, sturdy.
- *Signature mechanic:* his lights and heavies have a **crit band** — struck
  from the sweet-spot range they automatically deal 7:3 criticals (+36%
  damage, more launch).
- **Ratio Wave** (neutral): blade wave with a 30% crit chance.
- **Collapse** (side): the stairwell-dropping overhead — 2.4× shield damage.
- **Overtime** (down): the tie comes off: +20% speed and damage for 5 s.
- **Ultimate — Ratio: Certain Kill:** a methodical rush of strikes, every one
  at 7:3, ending in a critical that ends the workday.
- *Passive — Ratio Technique:* the crit bands themselves.

## Toji Fushiguro — "The Sorcerer Killer"
**Canon:** Born Zen'in with a Heavenly Restriction: zero cursed energy,
inhuman body, invisible to curse-sensing. Kills sorcerers with a cursed-tool
arsenal from his inventory spirit: the **Inverted Spear of Heaven** (nullifies
techniques on contact), Playful Cloud, the **Chain of a Thousand Miles**.
Personality: lazy drawl, ruthless pragmatism, apex-predator confidence.

**Design mapping:** The assassin. Fastest kill buttons in the game, tools for
every range, and the unique ability to *turn the opponent's magic off*.
- *Stats:* 465 / 1.04 — near-Gojo speed with a real frame.
- His weapons carry **heavenly** — bonus shield damage and invuln-piercing.
- **Chain of a Thousand Miles** (neutral): a near-hitscan piercing chain snipe.
- **Inverted Spear of Heaven** (side): gap-closing stab that **silences** —
  the victim's specials are sealed for 3 s. Uniquely hateful, exactly canon.
- **Open the Inventory** (down): something pact-bound comes out of storage,
  and which one is a draw — the **Inventory Curse** (hovers at his shoulder
  hurling cursed tools), the **Coil Curse** (chain-wrapped, let off the leash)
  or a **Husk Curse** (carries a blade over and lets go, breaking guards).
- **Ultimate — Zen'in Massacre Arsenal:** the inventory opens: a
  weapon-swapping execution rush that ends with a silencing finisher.
- *Passive — Invisible to Curses:* dodge invincibility lasts 25% longer, and
  his hits **drain the victim's ultimate meter** — fighting him starves your
  cursed energy.

## Ryomen Sukuna — "King of Curses"
**Canon:** The undisputed King of Curses. **Dismantle** (slashes for objects),
**Cleave** (adjusts to cut cursed targets in one stroke), the fire arrow
(Divine Flame / "Open, Fuga"), and the barrier-less domain **Malevolent
Shrine**, which rains slashes on everything within. Personality: sovereign
cruelty; everyone else is entertainment or ingredients.

**Design mapping:** The aggressive executioner — high damage everywhere, bleed
on everything, and the game's most oppressive ultimate.
- *Stats:* 435 / 1.06 — fast *and* sturdy; he's simply better, as intended.
- His slashes inflict **bleed** (movement-taxed damage over time).
- **Dismantle** (neutral): the fastest slash-wave projectile in the game.
- **Cleave** (side): a two-hit carving dash.
- **Divine Flame: Fuga** (down): "Open." — an arcing fire arrow that
  detonates.
- **Ultimate — Dismantle: Merciless Barrage:** a carving rush too fast to
  read, closed with a Cleave that adjusts to whatever it meets. (Malevolent
  Shrine moved to his Domain Expansion, where it belongs — it is a domain, not
  a single attack.)
- *Passive — King's Contempt:* +10% damage to opponents past 80% — he plays
  with food, then eats.

## Mahito — "Soul Shaper"
**Canon:** A curse born from human hatred of humans. **Idle Transfiguration**
reshapes souls on touch — bodies follow. Self-modification (blades, spikes),
Polymorphic Soul Isomers, and the streamlined killing form Instant Spirit Body
of Distorted Killing. Personality: a child-philosopher sadist; souls are toys.

**Design mapping:** Tricky rushdown with the game's command grab.
- *Stats:* 422 / 0.98.
- Everything he lands leaves a **Soul Mark** (+18% damage taken from all
  sources) — his pressure compounds.
- **Idle Transfiguration** (neutral): short-range **unblockable grab**. Shield
  Mahito at your peril.
- **Body Distortion Lunge** (side): arm-blade dash.
- **Transfigured Souls** (down): reshapes a stored soul into whatever amuses
  him this time — the shambling **Transfigured Human** that bursts on contact,
  a **Bloated Hulk** that walks over and keeps hitting, two low fast
  **Crawlers**, or a **Spitter** that hangs back and shoots. Getting the same
  shape twice is the one thing his technique should never do.
- **Ultimate — Instant Spirit Body of Distorted Killing:** his true form:
  +30% speed and **every attack unblockable** for 8 s.
- *Passive — Idle Transfiguration:* the soul marks.

## Suguru Geto — "Curse Collector"
**Canon:** Cursed Spirit Manipulation — swallow defeated curses, command
thousands. Signature releases include the Rainbow Dragon and the merged
hyper-spirit attack **Maximum: Uzumaki**. Personality: silken condescension;
the fallen best friend who chose curses over "monkeys."

**Design mapping:** The summoner-zoner: he spends minions, not effort.
- *Stats:* 398 / 1.04.
- His strikes carry **curse drain** (bonus shield damage — spirits gnaw at
  guards).
- **Cursed Spirit Volley** (neutral): three lightly-homing lesser curses.
- **Cursed Spirit Release** (side): he opens the collection, and what comes
  out is whatever his hand finds — the **Rainbow Dragon** (his prized heavy
  hitter), a **Smallpox Deity** (hangs back, poisons), a brace of **Curse
  Hounds** or a **Cursed Womb** that lurches over and detonates.
- **Kuchisake-Onna's Scissors** (down): plants a lurking curse that erupts
  when the enemy steps close — trap control.
- **Ultimate — Maximum: Uzumaki:** every stockpiled curse wrung into one
  spiraling annihilation that drags victims in and detonates.
- *Passive — Cursed Spirit Manipulation:* summon specials return double
  ultimate meter — his collection feeds itself.

## Jogo — "Disaster of Flame"
**Canon:** A disaster curse born from fear of volcanoes; one-eyed,
short-fused, strongest raw output among the disaster curses. Ember Insects,
lava geysers, Coffin of the Iron Mountain, and **Maximum: Meteor** — he pulled
a meteor onto Shibuya. Personality: proud, perpetually disrespected, explodes
(literally) when mocked.

**Design mapping:** The heavy zoner whose screen is always on fire.
- *Stats:* 368 / 1.16 — slow, hits like an eruption.
- Everything applies **burn**, and his burns tick 50% harder (passive —
  Disaster Curse).
- **Ember Insects** (neutral): arcing fire lobs.
- **Lava Geyser** (side): the floor under the *opponent* erupts — anti-camp.
- **Furnace Shell** (down): furnace armor — unstaggerable and searing to the
  touch (melee attackers get burned). Renamed: *Coffin of the Iron Mountain*
  is the name of his domain, which he now actually has.
- **Ultimate — Maximum: Meteor:** a falling star on the opponent's position;
  the crater keeps burning.

## Hanami — "Grief of the Forest"
**Canon:** A disaster curse born from the land's grief at humanity; serene,
mossy, nearly indestructible. Cursed buds that sap strength, root eruptions,
a body harder than old wood. Personality: gentle sorrow, planetary patience —
the kindest thing on the roster and still a monster.

**Design mapping:** The patient fortress. Slow, huge normals, endless
attrition.
- *Stats:* 358 / 1.24 — second-heaviest.
- Attacks inflict **root snare** (slow + sap).
- **Cursed Buds** (neutral): lobbed parasite seeds.
- **Root Eruption** (side): impaling roots under the opponent.
- **Flower Field** (down): a blooming ring that heals him and grants armor —
  the forest reclaims.
- **Ultimate — Domain of the Flowering Forest:** the floor becomes his
  garden: five expanding waves of vines harvest the arena outward from his
  roots.
- *Passive — Old-Growth Body:* 12% less damage taken while grounded — cut the
  tree down before it settles.

## Choso — "Eldest Brother"
**Canon:** The eldest Death Painting Womb — half curse, half human, animated
by **Blood Manipulation**: Piercing Blood (blood pressurized past the speed of
sound), Convergence, Flowing Red Scale (overclocking his own blood), and
Supernova (orbiting blood orbs detonated at once). Personality: quiet,
implacable, defined entirely by love for his brothers — including, after one
very strange fight, Yuji.

**Design mapping:** A zoner who pays in blood. His projectiles are the best
pound-for-pound in the game, and every one of them costs him a sliver of his
own health — his resource bar is his damage meter.
- *Stats:* 405 / 1.06 — deliberate, sturdy midweight.
- **Piercing Blood** (neutral): a near-hitscan piercing lance across the whole
  lane. Costs 1.5% of himself per shot.
- **Convergence: Blood Meteorite** (side): a dense arcing sphere that
  detonates on arrival. Costs 2%.
- **Flowing Red Scale** (down): overclocks his blood — +22% speed, +18%
  damage, and it burns him slowly the whole time it's held.
- **Ultimate — Supernova:** orbs of compressed blood ring the enemy, close in,
  and all detonate inward — escapable by leaving the ring, lethal inside it.
- *Passive — Death Painting Body:* immune to bleed and poison (he *is* the
  blood), which also makes him the natural counter to Sukuna's chip game.

## Mei Mei — "The Mercenary"
**Canon:** Grade 1 sorcerer who fights exclusively for money; wields a
battle-axe and **Black Bird Manipulation** — crows as scouts and, at the
limit, **Bird Strike**: a crow that abandons self-preservation gains force
beyond all reason. Personality: silken, transactional, genuinely dangerous —
every kindness is an invoice.

**Design mapping:** A balanced axe-fighter whose economy is literal: she
converts meter to power and gets paid better than anyone for landing hits.
- *Stats:* 425 / 1.00 — even frame, axe gives her heavy shield pressure
  (2.0× shield damage on heavies).
- **Crow Scout** (neutral): a homing crow dive — cheap, persistent chip.
- **Axe Rush** (side): an advancing overhead arc with brutal shield damage.
- **Advance Payment** (down): spends 15 ultimate meter for +25% damage over
  4 s. If she can't afford it, the card declines.
- **Ultimate — Bird Strike:** the limit-broken crow crosses the arena like a
  cannon shell, unblockable, with the flock homing in behind it.
- *Passive — Everything Has a Price:* +25% ultimate meter from damage dealt,
  and every new stock starts with an advance payment of meter. She is never
  not accruing.

## Takako Uro — "Sky Manipulator"
**Canon:** Heian-era assassin leader reincarnated into the Culling Game; her
technique treats **the sky itself as a surface** she can touch, fold, bend and
weaponize — attacks arrive from impossible angles, projectiles curve away,
and space itself can slam shut. Personality: prickly pride over old wounds,
a professional soldier's pragmatism, and real joy in a proper fight.

**Design mapping:** The air-superiority trickster. Nothing about her plays in
a straight line: her poke arrives out of the air behind you, and shooting at
her is a good way to get shot.
- *Stats:* 432 / 0.90 — light, fast, **three jumps** and the second-best air
  drift in the game.
- **Sky Warp Palm** (neutral): marks the spot the target holds, then the blow
  falls out of the sky onto it a beat later — dodge by not standing there.
- **Surface Dive** (side): kicks off a fold in the air; a swooping strike
  that works midair and doubles as recovery.
- **Sky Fold** (down): curves the sky into a lens — a counter stance that
  answers melee *and bends projectiles straight back at their owner*. The
  anti-zoner button.
- **Ultimate — Inverted Sky:** the sky folds shut around the enemy, hoists
  them off the earth, and slams them back into it. Whiffs if nobody is under
  her sky.
- *Passive — Mistress of the Air:* 12% less damage and knockback while
  airborne. Fight her on the ground; you won't get to.

## Yuji Itadori — "Sukuna's Vessel"
**Canon:** The vessel of the King of Curses — a physically freakish, endlessly
kind-hearted student whose signature is **Divergent Fist** (his cursed energy
lags a beat behind his fist, so one punch lands twice) and, once his timing
sharpens, **Black Flash** — cursed energy applied within a millionth of a
second of impact, distorting space and multiplying force. Superhuman
athleticism, the Manji Kick, and a refusal to stay down. Personality: warm,
direct, self-sacrificing — "I'll be the cog"; he saves people so they can have
a proper death.

**Design mapping:** The honest fists-first brawler with a slot-machine heart:
his whole kit is clean fundamentals, and the Black Flash roll is the spike of
drama on top.
- *Stats:* 448 / 1.02 — third-fastest ground speed; a pure rushdown frame.
- **Divergent Fist** (neutral): a punch whose cursed-energy impact arrives a
  beat later — one input, two hits, and the delayed hit is the launcher. Great
  for catching shields dropped too early.
- **Manji Kick** (side): a sliding low kick that sweeps in under pokes.
- **Unbreakable Grit** (down): plants his feet — brief hyper-armor and reduced
  damage. He just keeps coming, exactly like the manga panels.
- **Ultimate — Black Flash: Consecutive:** the zone. A rush of blows where
  every hit is on the edge of a Black Flash, capped with one that isn't on the
  edge of anything.
- *Passive — Black Flash:* every melee hit has a 12% chance to spark: bonus
  damage, extra launch, and a surge of ultimate meter. Feast or famine, like
  the real thing.

## Reggie Star — "The Contractor"
**Canon:** A Culling Game player whose cursed technique materializes anything
he has a **purchase receipt** for — a katana umbrella, insecticide, a futon,
and famously an entire car dropped on his opponent mid-fight. Personality:
smug, theatrical dealmaker; treats every fight as a negotiation he has already
won.

**Design mapping:** The wildcard zoner. His screen presence is a shopping
spree: blade waves, poison clouds, and appliances falling from the sky —
some deliveries are better than others.
- *Stats:* 402 / 1.05 — midweight who wants to fight from behind his purchases.
- **Receipt: Katana Umbrella** (neutral): a blade wave off the umbrella's
  edge — his bread-and-butter poke.
- **Receipt: Insecticide** (side): a lingering aerosol cloud that **poisons**
  (ticking damage plus a slow) and seeps through guards — area denial in a
  can.
- **Receipt: Big-Ticket Item** (down): something heavy materializes over the
  enemy: a vending machine, a motorbike... or a futon. Terms and conditions
  apply.
- **Ultimate — Grand Contract: Luxury Sedan:** the car. It arrives at
  terminal velocity on the opponent's position, then keeps going as a
  battering ram across the floor.
- *Passive — Paper Trail:* the fine print always favors him — special
  cooldowns tick 18% faster, so the deliveries never stop.

## Yoshinobu Gakuganji — "The Old Guard"
**Canon:** The conservative principal of Kyoto Jujutsu High — an old man on
the Big Three's conservative wing whose cursed technique **amplifies cursed
energy through melody**, channeled via an electric guitar. He shreds. His
riffs travel as destructive waves of amplified sound. Personality: stern
traditionalist, institutional to the bone — until the guitar comes out.

**Design mapping:** The slow fortress-zoner whose walls are made of sound.
Weakest legs on the roster, but a stage that is always ringing.
- *Stats:* 356 / 1.18 — slowest fighter in the game; plays entirely off
  spacing and walls.
- **Power Chord** (neutral): a piercing wall of amplified sound down the lane.
- **Feedback Wall** (side): plants a standing wave of shrieking feedback that
  erupts when crossed — his zoning anchor.
- **Distortion Solo** (down): steps on the pedal — while it rings, every
  Power Chord comes out doubled, plus a general damage lift.
- **Ultimate — Deadly Melody: Encore:** the full performance: waves of sound
  roll off him in both directions, shoving and grinding everyone in range,
  until the closing chord throws the crowd.
- *Passive — Unshakeable Tradition:* takes 25% less hitstun. Decades on every
  kind of stage; the old man barely flinches, which makes comboing him a
  genuinely different problem.

---

# Round 15 — the four late additions

The four below were wired into the game and balanced against the roster before
any of their art existed, held out of character select by
`STAGED_CHARACTER_KEYS` until it landed (see the note at the top of this file).
All four are selectable now. They keep their own section because it is how they
were designed — kit first, art as a delivery against it — and because the three
statuses and the shared technique below arrived with them.

They introduce **three statuses** and **one shared technique** that nobody on
the roster has:

| New thing | Owner | What it does |
|---|---|---|
| **drench** | Dagon | Soaked: −16% movement speed, and Dagon's own hits land 15% harder on a soaked target. No damage of its own. |
| **infest** | Kurourushi | Cursed eggs hatch in the wound: ticking damage that **stacks up to three generations**, and every tick feeds Kurourushi. |
| **blind** | Kurourushi | Eyes fouled: the victim deals 12% less damage and their dodge invincibility is **halved**. |
| **Simple Domain** | Mechamaru, Yuki | Not a Domain Expansion — the anti-domain circle. Turns one attack that reaches it, and while it holds, an enemy domain's **sure-hit stops being sure** (see the Domain section). |

## Kokichi Muta — "Ultimate Mechamaru"
**Canon:** A Kyoto second-year who has never once attended in person. Born with
a Heavenly Restriction that left him without a right arm, without usable legs
and unable to bear daylight, he was paid for it in cursed energy: output past
any human limit and **Puppet Manipulation** with a range covering all of Japan.
He attends school as a cursed corpse — Ultimate Mechamaru — and fights through
it: Sword Option, Ultra Spin, Boost On, Ultra Cannon. At the end he spent his
entire life's savings of cursed energy, seventeen years five months six days of
it, piloting **Mode: Absolute** against Mahito, and very nearly won.
Personality: withdrawn, bitter about a life spent indoors, and a genuinely
excellent tactician who plans several moves past his opponent.

**Design mapping:** The artillery piece. Slow, heavy, armoured, and the only
fighter whose damage comes disproportionately from things that are not his
fists — which is exactly what his restriction traded for.
- *Stats:* 372 / 1.22 — second-slowest, third-heaviest.
- **Ultra Cannon** (neutral): a piercing bolt down the lane. His bread and
  butter, and the thing his passive is really about.
- **Boost On** (side): elbow thrusters, armoured. Half a ton of puppet arrives
  and trades on purpose.
- **New Shadow Style: Simple Domain** (down): the technique he could not cast,
  so he built it into cartridges. A held circle that turns what reaches it —
  and switches off a domain's guaranteed hit while it lasts.
- **Ultimate — Mode: Absolute:** the whole savings account at once. A tracking
  volley (**Pigeon Viola**) to take the ground away, then the three-barrel
  **Ultimate Cannon**. The charge is long and visible on purpose; so was his.
- *Passive — Heavenly Restriction (Output):* techniques and cannons deal 15%
  more, and the puppet frame takes 8% more. The trade, stated as a number.

## Yuki Tsukumo — "Star Rage"
**Canon:** One of only four special-grade sorcerers, and the one who refuses
missions — she is trying to end curses at the source rather than sweep them up.
Her innate technique, **Star Rage** (*Bombaye*), adds **virtual mass** to
herself and to her shikigami **Garuda**: imaginary weight that lends her blows
the force of the real thing without weighing her down. She also carries
Reverse Cursed Technique and taught Todo his Simple Domain, and his catchphrase.
Personality: loud, blunt, unbothered, and the person Gojo goes to when he wants
to be talked to like a colleague.

**Design mapping:** The heavyweight puncher with a lightweight's frame. Nothing
in her kit is a projectile: she wins by arriving, and everything she lands
travels further than it should.
- *Stats:* 430 / 1.04 — fast for how hard she hits.
- **Star Rage: Bombaye** (neutral): a short-range straight with mass poured
  into it. Huge launch for the damage.
- **Garuda** (side): her shikigami, out for six seconds, hunting on its own.
  The only part of her game that is not her.
- **New Shadow Style: Simple Domain** (down): the same circle Mechamaru runs on
  cartridges — she just knows it.
- **Ultimate — Star Rage: Maximum Mass:** as much imaginary mass as she can
  hold behind one blow. A core that is unblockable and a survivable shockwave
  around it, after a wind-up everybody in the building can read.
- *Passive — Star Rage:* her hits launch 20% further, and nothing that drags at
  a body — snare, poison, standing water — slows her. Mass with no weight.

## Dagon — "Disaster of Tides"
**Canon:** A special-grade curse born of humanity's fear of water disaster. He
spent most of the series as a cursed womb — timid, silent, minding the group's
hideout — and evolved mid-Shibuya out of pure rage at Hanami's death. In his
full form he generates oceans out of nothing, conjures man-eating shikigami
straight from his body (eels, piranha, sharks, crustaceans) and opens
**Horizon of the Captivating Skandha**, a tropical shore where his shikigami
cannot miss. Naobito, Nanami and Maki together could not put him down inside
it; Toji did, from the outside.
Personality: an infant that grew up angry. Insists, at volume, that he and his
friends have names.

**Design mapping:** The fortress zoner, and the roster's second Domain user
among the curses. Everything he does soaks you, and everything he does is worse
against someone soaked.
- *Stats:* 350 / 1.26 — slowest and heaviest of the four; wings give him
  better air movement than a body that size deserves.
- **Disaster Tides** (neutral): two rolling waves down the floor. Piercing,
  slow, and they leave the lane wet.
- **Man-Eating Shikigami** (side): fish conjured out of his body that swim at
  whoever is closest and burst on them.
- **Undertow** (down): pulls the water back in and everything in it with it.
  No launch — it just relocates them into his reach, soaked.
- **Ultimate — Death Swarm:** shikigami without end at one target, homing,
  finished by one that is unblockable. Outside the domain they still have to
  travel; inside, they don't.
- **Domain — Horizon of the Captivating Skandha:** see the Domain section.
- *Passive — Disaster of Water:* soaked opponents take 15% more from him, and
  nothing he makes can soak him.

## Kurourushi — "Bottomless Appetite"
**Canon:** A special-grade **cockroach** cursed spirit, born from humanity's
collective disgust for them, released by Kenjaku into the Culling Game. It
commands endless swarms of real roaches reinforced with cursed energy, blinds
with **Earthen Insect Trance**, and carries the **Festering Life Sword** — six
barrels along the blade that fire eggs which hatch the instant the blade opens
a wound. It reproduces by **parthenogenesis**, and made a child specifically so
that its cursed energy would survive its own exorcism. It nearly ate Yuta.
Personality: barely one. It wants to eat, it resents interruption, and asked
why it kills it said it loves the taste of iron.

**Design mapping:** The attrition rushdown. It does not out-damage anyone in a
single exchange — it puts something in you that keeps working and takes its
share of everything.
- *Stats:* 412 / 1.08, and **three jumps** — it has wings and rides a twister
  of its own roaches.
- Its lights and heavies plant **infest**, so its pressure keeps paying after
  the fighters separate.
- **Festering Life Sword: Egg Volley** (neutral): three eggs downrange. The
  applicator.
- **Cursed Cockroaches** (side): three swarms out at once, fast, weak, and
  they all carry the infestation.
- **Earthen Insect Trance** (down): a cloud of bursting sacs that **blinds** —
  the setup it used to open Yuta up.
- **Ultimate — Parthenogenesis:** it does not power up, it reproduces. Two
  offspring fight beside it and its appetite runs hot for the duration, so
  every bite anywhere on the stage puts the parent back together.
- *Passive — Bottomless Appetite:* it recovers 12% of all damage it deals, and
  the eggs go on feeding it long after the cut.

---

## Roster balance at a glance

| Fighter | Archetype | Speed | Weight | Wins by |
|---|---|---|---|---|
| Gojo | Mobile all-rounder | ★★★★★ | Light | Spacing control, untouchability |
| Yuta | All-rounder | ★★★☆ | Mid | Fundamentals + Rika swings |
| Hakari | Momentum brawler | ★★★☆ | Mid-heavy | Reaching Jackpot |
| Maki | Anti-defense rushdown | ★★★★★ | Mid | Shield destruction |
| Megumi | Summon tactician | ★★★★ | Light | Stage control |
| Nobara | Mark zoner | ★★★☆ | Mid | Nail economy cash-outs |
| Inumaki | Controller | ★★★☆ | Mid | Stuns into edge-guards |
| Panda | Armored heavy | ★★ | Heaviest | Trades and armor |
| Todo | Swap grappler | ★★★ | Heavy | Position mind-games |
| Momo | Aerial zoner | ★★★★ | Lightest | Air superiority |
| Nanami | Precision mid | ★★★ | Mid-heavy | 7:3 spacing crits |
| Toji | Assassin | ★★★★★ | Mid | Speed + silencing techniques |
| Sukuna | Aggressive executioner | ★★★★ | Mid-heavy | Raw damage, domain |
| Mahito | Tricky rushdown | ★★★★ | Mid | Command grabs, soul marks |
| Geto | Summoner-zoner | ★★★☆ | Mid | Minion attrition |
| Jogo | Heavy zoner | ★★☆ | Heavy | Burn attrition, meteor |
| Hanami | Fortress | ★★☆ | Very heavy | Outlasting everyone |
| Choso | Blood zoner | ★★★☆ | Mid-heavy | Premium projectiles paid in HP |
| Mei Mei | Economy all-rounder | ★★★★ | Mid | Meter economy, axe shield pressure |
| Uro | Aerial trickster | ★★★★ | Light | Air control, reflected projectiles |
| Yuji | Rushdown brawler | ★★★★★ | Mid | Fundamentals + Black Flash spikes |
| Reggie | Wildcard zoner | ★★★☆ | Mid | Area denial, falling appliances |
| Gakuganji | Sound fortress | ★☆ | Heavy | Walls of sound, unflinching trades |

All 27 fighters are live. The six round-7 additions (Choso, Mei Mei, Uro, Yuji,
Reggie, Gakuganji) were built and balanced in code before their art existed, and
round 15's four did the same; that history is in
[asset-requests-history.md](asset-requests-history.md).

Round 15's four, at the same glance:

| Fighter | Archetype | Speed | Weight | Wins by |
|---|---|---|---|---|
| Mechamaru | Artillery zoner | ★★ | Heavy | Cannons, armour, out-ranging you |
| Yuki | Mass brawler | ★★★★ | Mid | One blow landing further than it should |
| Dagon | Tide fortress | ★★ | Very heavy | Soaking you, then a sure-hit domain |
| Kurourushi | Attrition rushdown | ★★★★ | Mid | Infestation, swarms, eating what it hurts |

---

# Domain Expansion

The pinnacle of jujutsu: a barrier that manifests the sorcerer's innate domain
and, inside it, bends the fight to their technique. In game it is the **second,
larger super** — **LB** on a controller, **U** (P1) / **;** (P2) on keyboard,
costing a **full** Cursed Energy bar, the same as an ultimate (RB). (A fighter
with two would pick between them by holding the left stick up or down with LB;
none has two.)

Eight fighters have one, and two more — Mechamaru and Yuki — carry the New
Shadow Style's **Simple Domain** instead. That is a special, not an Expansion:
its own cooldown, no meter. The domain button casts it for them all the same,
because the button opens whatever domain a fighter has. The design rule for all of them: **a domain you watch
is a cutscene, a domain you operate is a move.** Every one binds a live
interaction to SPECIAL while it is open, so the player is still playing rather
than waiting out an animation. The in-game moves screen carries the same
"How it plays" text as the table below.

`char.domains` is an array, so a fighter with more than one could split them
across the left stick held with LB. Nobody has two; the input path and the
moves screen already handle it (`domainSlotFor` / `domainStickFor` in
`src/domains.js`, which the moves screen asks rather than restating).

When two or more human players are on different fighters, the move list opens
as a **column per player** so everyone reads their own kit — domain included —
at the same time, rather than passing one shared list around. *Browse all
fighters* switches back to the single paging view.

| Fighter | Domain | What it does | What you do |
|---|---|---|---|
| Gojo | **Unlimited Void** | The enemy receives infinite information and can act on none of it — total paralysis for 5.5 s. | Every hit banks a purple orb; when the domain closes, all of them detonate at once. Hit them as many times as you can. |
| Sukuna | **Malevolent Shrine** | The wall-less shrine; slashes rain on the enemy automatically. | Press SPECIAL to snatch an orbiting blade, then LIGHT/HEAVY to unleash a colossal Cleave. The more blades still orbiting, the harder it lands. |
| Megumi | **Chimera Shadow Garden** | The floor becomes an ocean of shadow; knockback he takes is halved. | SPECIAL sinks him and resurfaces him behind the enemy — unlimited, no cooldown — and each resurface looses a shikigami strike. |
| Mahito | **Self-Embodiment of Perfection** | Every surface is his hand; nothing can be blocked. | Each landed hit stacks Distortion. At five stacks the soul collapses on its own for massive damage and the counter resets. |
| Jogo | **Coffin of the Iron Mountain** | Sealed inside a volcano — the whole floor burns anything standing on it. | SPECIAL erupts a geyser directly under the enemy, free and instant, as often as you like. |
| Hakari | **Idle Death Gamble** | The pachinko parlour with the door shut. | Three reels spin overhead; SPECIAL stops the next one. Three matching symbols is the JACKPOT — full heal, hyper-armour and +35% damage. A pair still pays something. |
| Yuta | **Authentic Mutual Love** | Rika manifests completely and heals him continuously. | SPECIAL sends her at the enemy for a huge unblockable bite, on a short cooldown. |
| Dagon | **Horizon of the Captivating Skandha** | A tropical shore with an endless ocean; fish bite automatically, cannot be blocked or dodged, and leave the enemy soaked. | SPECIAL fires **Death Swarm**: an unblockable surge on the enemy, short cooldown. |

**Not implemented yet.** The wiki also lists Hanami, Uro and Yuji as domain
users. Their domains are unnamed in canon or arrive very late in the series, so
they have no kit here — a deliberate omission rather than an oversight. **Yuki
is the same case**: she has an innate domain and discusses expanding it with
Tengen, but it is never shown, so she has an ultimate and no domain.

## Simple Domain — the counter to a domain

`New Shadow Style: Simple Domain` is **not** a Domain Expansion and does not
cost the bar: it is a down special, held for 1.6 s, and Mechamaru and Yuki both
carry it because both canonically do — Kokichi built it into cartridges because
his body could not cast it, and Yuki taught it to Todo.

It does two things, which are the same idea twice. Anything that reaches the
circle is turned, exactly like Infinity. And while it holds, an open domain's
**sure-hit half does not land on the holder** — Unlimited Void's paralysis, the
Shrine's rain, the Iron Mountain's burning floor, Skandha's fish. What it does
*not* stop is the half the domain's owner aims by hand: Sukuna's thrown Cleave,
Megumi's resurfacing strike, Dagon's Death Swarm. That split is the canon one,
and mechanically it is the point — a domain is still worth opening against
someone holding a circle, they just have to be hit with it rather than by it.

In code it is `simpleDomainActive()` in `src/domains.js`, consulted by
`sureHitFoesOf()`, which every automatic domain effect now runs through.

**Three kits were renamed** to make room, because a domain and an ultimate
should not be the same technique: Sukuna's ultimate became *Dismantle:
Merciless Barrage*, Hakari's became simply *JACKPOT*, and Jogo's down special
became *Furnace Shell*.

## References

- [Jujutsu Kaisen Wiki — Idle Death Gamble](https://jujutsu-kaisen.fandom.com/wiki/Idle_Death_Gamble) (jackpot: 4:11 of infinite cursed energy, reflexive RCT immortality)
- [Gamerant — Hakari's Cursed Technique, Explained](https://gamerant.com/jujutsu-kaisen-kinji-hakari-cursed-technique-private-pure-love-train-explained/)
- [Jujutsu Kaisen Wiki — Gorilla Mode](https://jujutsu-kaisen.fandom.com/wiki/Gorilla_Mode) / [Gamerant — Panda's Cursed Corpse Cores](https://gamerant.com/jujutsu-kaisen-panda-cursed-corpse-cores/) (three sibling cores; Triceratops sister)
- [Jujutsu Kaisen Wiki — Tool Manipulation](https://jujutsu-kaisen.fandom.com/wiki/Tool_Manipulation) / [Wind Scythe](https://jujutsu-kaisen.fandom.com/wiki/Wind_Scythe)
- [Jujutsu Kaisen Wiki — Cursed Speech](https://jujutsu-kaisen.fandom.com/wiki/Cursed_Speech) / [CBR — The Power and Drawbacks of Inumaki's Cursed Speech](https://www.cbr.com/jujutsu-kaisen-the-power-and-drawbacks-of-inumakis-cursed-speech-explained/)

Round 15 (the four late additions):

- [Jujutsu Kaisen Wiki — Kokichi Muta](https://jujutsu-kaisen.fandom.com/wiki/Kokichi_Muta) (Heavenly Restriction, Puppet Manipulation, Sword Option / Ultra Spin / Ultra Shield / Boost On / Ultra Cannon, the Simple Domain cartridges) / [Mode: Absolute](https://jujutsu-kaisen.fandom.com/wiki/Mode:_Absolute) (Ultra Cannon, Miracle Cannon, Pigeon Viola, and the 17 years 5 months 6 days of banked cursed energy)
- [Jujutsu Kaisen Wiki — Yuki Tsukumo](https://jujutsu-kaisen.fandom.com/wiki/Yuki_Tsukumo) / [Star Rage](https://jujutsu-kaisen.fandom.com/wiki/Star_Rage) (virtual mass, "Bombaye") / [Garuda](https://jujutsu-kaisen.fandom.com/wiki/Garuda) (shikigami and cursed tool in one; fights independently)
- [Jujutsu Kaisen Wiki — Dagon](https://jujutsu-kaisen.fandom.com/wiki/Dagon) (Disaster Tides, the shikigami menagerie, evolution from cursed womb) / [Horizon of the Captivating Skandha](https://jujutsu-kaisen.fandom.com/wiki/Horizon_of_the_Captivating_Skandha) / [Death Swarm](https://jujutsu-kaisen.fandom.com/wiki/Death_Swarm)
- [Jujutsu Kaisen Wiki — Kurourushi](https://jujutsu-kaisen.fandom.com/wiki/Kurourushi) (cursed cockroaches, parthenogenesis, Earthen Insect Trance) / [Festering Life Sword](https://jujutsu-kaisen.fandom.com/wiki/Festering_Life_Sword) (six barrels, eggs that hatch in the wound)

**On the spelling:** the curse is written **Kurourushi** (黒沐死) on the wiki and
in the subtitles, and that is the key used in code (`kurourushi`). "Kuroroshi"
and "Kuro-Urushi" are both in circulation; they are the same character.
