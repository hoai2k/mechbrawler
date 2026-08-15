# Audio Requests — history

Record of the sound and voice rounds that have been **delivered and
integrated**. Nothing in this file is outstanding; open requests, if there ever
are any again, live in [audio-requests.md](audio-requests.md).

**All 115 files delivered and wired in** — 81 in the round-8 pass below, the
15-file element and signature round after it, then the 15 of round 10 (the
domain moment, including this project's first spoken lines) together with the
four sounds the staged fighters were owed, and finally round 11's four:
Inumaki's cursed speech. Filenames below say `.wav`; what ships is the same
name as **`.mp3`** (128 kbps) — a browser has to download these, and MP3 is
about a fifth the size. Generated with the ElevenLabs API from the entries
below — the sound-generation endpoint for effects, text-to-speech for the
spoken lines — then trimmed, peak-normalised to -3 dBFS and length-capped
automatically, except for loops and spoken lines, which are never cut to
length. The registry, mix and categories live in `src/config_audio.js`.

## This file is still live input, not just a record

`tools/generate_sfx.py` **parses this document** — filename, target length and
prompt — and that is how any of these files gets regenerated or re-rolled:

```sh
ELEVENLABS_API_KEY=... python3 tools/generate_sfx.py --force hit_light.wav
```

So the prompts are kept verbatim rather than summarised. Every one is complete:
copy it, paste it into a generator, save the result under the filename above it.
There is no style suffix to append — format, length, dryness and the
"no music / no voice" constraints are written into each one. **Adding a new
sound means adding a section here in the same shape**, then registering the key
in `src/config_audio.js`.

---

## The audit this round answered

Everything in this section describes the game **before** the round landed, and
is kept as the rationale for what was made. None of it is true now — see
[audio-requests.md](audio-requests.md) for where things actually stand.

**15 sound files** back **15 registry keys** in `SFX_FILES` (`src/audio.js`),
covering a 23-fighter roster with domains, ultimates, summons and a full menu
system. Three concrete consequences:

**1. One explosion is doing most of the work.** `blast` is requested from
**30 call sites in code plus 28 move configs** — it plays for a projectile
popping, a counter triggering, a summon appearing, a meteor landing and a
Domain Expansion. `punch` covers 32 move configs. The palette is so narrow
that most of the game sounds the same.

**2. Nine of the 23 live fighters have no voice at all.** `GRUNT_GROUPS` maps
only 14 characters to one of 4 shared grunt files. These fighters are silent
when they attack:

> **gojo, yuji, megumi, inumaki, nanami, yuta, geto, toji, reggie**

The 14 that do have a voice share 4 files between them — every "big" character
(hakari, todo, sukuna, choso, gakuganji) makes the identical noise.

**3. Several moments make no sound at all.** Verified silent in code:

| Moment | Where | Status |
|---|---|---|
| **READY… / GO!** countdown | `main.js:109,131` | `main.js` contains **zero** `playSfx` calls |
| **GAME!** at match end | `main.js:175` | silent |
| **Ground jump** | `fighter.js:678` | dust particles only — air jump gets a whoosh, ground jump gets nothing |
| **Ultimate meter filling** | `ui.js` `renderMeter` | HUD prints "ULTIMATE READY" with no audio cue |
| **Respawn** | `fighter.js:337` | silent |
| **Black Flash** (Yuji signature) | `combat.js:470` | popup only, no sound |
| **7:3 crit** (Nanami signature) | `combat.js:460` | popup only, no sound |
| **All 7 Domain Expansions** | `domains.js:65` | every one plays the same `ult` clip as a normal ultimate |
| **All 8 stage hazards** | `stage_fx.js` | 24 sound calls, every one a borrowed combat clip — a pitched-down sword `block` is standing in for a temple bell |

The menu works but borrows combat sounds — cursor movement is a pitched-up
`whoosh`, confirming is a `slash`, settings toggles are a sword `block`.

---

## Delivery spec

- **Format:** WAV (24-bit / 48 kHz) preferred, or MP3 at 192 kbps+. The loader
  handles both — existing files are a mix.
- **Trim:** **no leading silence.** The engine plays a one-shot the instant a
  hit lands, so even 30 ms of head padding reads as lag. Two files currently
  need a hardcoded offset to work around this (`SFX_START` in `audio.js`, for
  `landing` and `whoosh`) — please don't add more.
- **Loudness:** normalise peaks to about **-3 dBFS**, and keep loudness
  consistent *within* a tier. The engine scales volume per call, so a clip
  that arrives twice as loud as its neighbours can't be fixed without a code
  change.
- **Length:** each prompt states its own target. Combat one-shots that run
  long overlap themselves during combos and turn to mush (there is a 24-voice
  cap, and long clips eat it).
- **Naming:** exactly the filename given, into `assets/sfx/`.

Mono vs stereo and dry vs tail are specified per prompt — most combat and UI
sounds are mono and dry; domain, ultimate and match-end stings are stereo with
a tail. You don't need to decide.

---

## How these get wired in

Each new file needs one line in `SFX_FILES` (`src/audio.js`):

```js
hitLight: "assets/sfx/hit_light.wav",
```

Call sites then use `playSfx("hitLight")`, or a move config sets
`sfx: "hitLight"`. **I'll do the wiring** — deliver the files and I'll add the
keys, repoint the existing call sites, and add sounds to the silent moments.
Nothing breaks in the meantime: an unregistered key is a no-op, and the game
keeps using the current files until I switch them over.

Tiers are ordered by how much each one improves the game per file delivered.
**Tier 1 and 2 are the ones that matter** — 22 files that fix the "everything
sounds the same" problem and the silent moments. Tiers 3–6 are depth.

---

## Tier 1 — Core combat (12 files)

These fire constantly. Right now they're covered by 4 clips.

**`hit_light.wav`** · every jab / light attack connecting · 0.2 s
```
A sharp quick punch landing on a body, tight snappy thud with a slapping crack on the front of it, close-mic and completely dry with no room reverb, one single hit about 0.2 seconds long, mono anime fighting game impact sound effect, no music, no voice
```

**`hit_medium.wav`** · standard attack connecting · 0.3 s
```
A solid punch landing square on a torso, meaty low thump with a crisp cracking attack on the front, close-mic and dry with no room reverb, one single hit about 0.3 seconds long, mono anime fighting game impact sound effect, no music, no voice
```

**`hit_heavy.wav`** · heavy and smash attacks · 0.45 s
```
A devastating heavy punch driving deep into a body, bassy low body blow with a hard cracking transient and a short punchy low-end boom, dry and close with only a minimal tail, one single hit about 0.45 seconds long, mono anime fighting game heavy impact sound effect, no music, no voice
```

**`hit_crit.wav`** · Nanami's 7:3 crit band — currently silent · 0.5 s
```
A perfect critical strike landing, a sharp metallic ring layered over a deep body impact with a bright glassy shimmer decaying after it, precise and satisfying, mostly dry with only the shimmer trailing, about 0.5 seconds long, mono anime fighting game critical hit sound effect, no music, no voice
```

**`black_flash.wav`** · Yuji's Black Flash proc — currently silent · 0.9 s
```
A reality-cracking supernatural impact, a distorted low boom with a sharp glassy shattering crack and a brief warped pitch-bending sub-bass drop underneath it, ominous heavy and slightly detuned, about 0.9 seconds long with a short decaying tail, mono anime power moment impact sound effect, no music, no voice
```

**`slash_light.wav`** · fast blade attacks (Yuta, Maki, Toji) · 0.25 s
```
A fast katana slash cutting through air and then flesh, a sharp metallic whisk with a wet cutting edge at the end, quick and dry with no reverb, one single slash about 0.25 seconds long, mono anime fighting game blade hit sound effect, no music, no voice
```

**`slash_heavy.wav`** · heavy blade attacks · 0.4 s
```
A powerful greatsword cleave, a heavy metallic slash with a deep air whoosh leading into a solid cutting impact, weighty and dry with only a minimal tail, one single swing about 0.4 seconds long, mono anime fighting game heavy blade sound effect, no music, no voice
```

**`swing_whiff.wav`** · an attack that hits nothing · 0.25 s
```
A fast arm swinging through empty air and connecting with nothing, a sharp airy whoosh with a clean fast decay, dry with no reverb and no impact at the end, about 0.25 seconds long, mono video game attack whiff sound effect, no music, no voice
```

**`guard_hit.wav`** · attack absorbed by a shield · 0.3 s
```
An attack absorbed by a magical energy barrier, a muffled cushioned thud with a bright shimmering ring layered on top of it, dry and contained, one single hit about 0.3 seconds long, mono anime fighting game shield block sound effect, no music, no voice
```

**`guard_break.wav`** · shield depleted → dizzy (currently a pitched-up KO sound) · 0.8 s
```
A glass-like energy barrier shattering under pressure, a bright crystalline crack breaking apart into scattering falling shards with a low pressure release underneath, about 0.8 seconds long with a short scattering tail, mono anime fighting game shield break sound effect, no music, no voice
```

**`parry.wav`** · counter triggers (Gojo's Infinity, reflects) · 0.6 s
```
A perfect parry deflecting an incoming strike, a bright ringing metallic clang with a sharp time-freezing shimmer rising just after it, crisp clean and satisfying, about 0.6 seconds long, mono anime fighting game counter sound effect, no music, no voice
```

**`launch.wav`** · a hit sends someone flying at high knockback · 0.5 s
```
A powerful blow launching a body across the screen, a deep punchy impact immediately followed by a fast rising doppler whoosh receding away into the distance, dry and forceful, about 0.5 seconds long, mono anime fighting game knockback sound effect, no music, no voice
```

---

## Tier 2 — Currently silent moments (10 files)

Each of these is a moment the game presents visually with nothing on the audio
track.

**`jump.wav`** · ground jump — silent today · 0.2 s
```
A light athletic jump taking off from solid ground, a soft cloth rustle and shoe scuff with a quick push of air, subtle and understated, dry with no reverb, about 0.2 seconds long, mono video game movement sound effect, no music, no voice
```

**`land_soft.wav`** · landing from a short hop · 0.2 s
```
A light footstep landing on a hard stone surface, a soft scuffing thud with a small grit texture, dry and close with no reverb, about 0.2 seconds long, mono video game footstep sound effect, no music, no voice
```

**`land_heavy.wav`** · landing from height or after a launch · 0.4 s
```
A heavy body slamming down onto stone from a great height, a deep thud with scattering debris and a puff of dust, weighty and dry with a short tail, about 0.4 seconds long, mono video game heavy landing sound effect, no music, no voice
```

**`dash.wav`** · ground dash (double tap) · 0.3 s
```
A fighter bursting forward into a ground dash, a sharp low whoosh with a scraping foot push-off at the start, fast and dry with no reverb, about 0.3 seconds long, mono anime fighting game movement sound effect, no music, no voice
```

**`respawn.wav`** · fighter returns after a KO — silent today · 1.0 s
```
A character materialising back into the world after being defeated, a warm rising magical shimmer settling into a soft resolving chime, hopeful and clean, about 1 second long with a gentle tail, mono video game respawn sound effect, no music, no voice
```

**`meter_full.wav`** · ultimate meter reaches max — silent today · 1.2 s
```
A special-attack power meter reaching maximum charge, a rising energy hum resolving into a bright confident chime with a subtle choir swell underneath, noticeable and triumphant but not loud or startling, about 1.2 seconds long, mono video game power-up-ready cue, no music bed, no voice
```

**`countdown_ready.wav`** · the "READY…" banner — silent today · 0.8 s
```
A single deep resonant temple gong struck once to announce a duel about to begin, ominous and full of anticipation, one strike with a short controlled tail, about 0.8 seconds long, mono anime fighting game round-start cue, no music, no voice
```

**`countdown_go.wav`** · the "GO!" banner — silent today · 0.6 s
```
A sharp bright bell struck once to signal a fight beginning, urgent energetic and cutting, one strike with a quick decay, about 0.6 seconds long, mono anime fighting game round-start cue, no music, no voice
```

**`match_end.wav`** · the "GAME!" banner — silent today · 1.5 s
```
A match-ending flourish, one decisive low impact followed immediately by a short triumphant brass and taiko drum sting, conclusive and final, about 1.5 seconds long with a natural tail, stereo anime fighting game victory sting, no vocals
```

---

## Tier 3 — Character voices (18 files)

Non-verbal exertion only — **no words, no catchphrases.** These fire on
specials via `playGrunt(charKey)`.

Currently 4 files cover 14 characters and 9 characters have nothing. Below is
**6 voice groups × 3 variants**, so repeated specials don't loop the identical
sample and the 9 silent fighters get a voice. The three variants in each group
are deliberately different from each other — generate all three.

### Young male — covers gojo, yuji, megumi, yuta, inumaki (all currently silent)

**`grunt_young_male_1.wav`** · 0.5 s
```
A single short sharp effort grunt from a confident young man in his late teens swinging an attack, a non-verbal clipped exhale, dry close-mic vocal recording with no reverb, about 0.5 seconds long, mono anime fighting game voice, no words, no music
```

**`grunt_young_male_2.wav`** · 0.5 s
```
A single short determined shout from a young man in his late teens throwing a hard punch, a non-verbal exertion yell with a slight rasp to it, dry close-mic vocal recording with no reverb, about 0.5 seconds long, mono anime fighting game voice, no words, no music
```

**`grunt_young_male_3.wav`** · 0.4 s
```
A single clipped breathy effort grunt from a young man in his late teens striking quickly, a quiet sharp exhale with much lower energy than a shout, dry close-mic vocal recording with no reverb, about 0.4 seconds long, mono anime fighting game voice, no words, no music
```

### Adult male — covers nanami, toji, geto, reggie (all currently silent)

**`grunt_adult_male_1.wav`** · 0.5 s
```
A single low restrained effort grunt from a calm adult man in his thirties striking an opponent, controlled and unbothered, a non-verbal chest exhale, dry close-mic vocal recording with no reverb, about 0.5 seconds long, mono anime fighting game voice, no words, no music
```

**`grunt_adult_male_2.wav`** · 0.5 s
```
A single short forceful exhale from a composed adult man delivering a heavy blow, deeper and firmer than a shout, non-verbal, dry close-mic vocal recording with no reverb, about 0.5 seconds long, mono anime fighting game voice, no words, no music
```

**`grunt_adult_male_3.wav`** · 0.4 s
```
A single quiet clipped grunt from an adult man moving with practised efficiency, understated and almost bored, non-verbal, dry close-mic vocal recording with no reverb, about 0.4 seconds long, mono anime fighting game voice, no words, no music
```

### Big — covers hakari, todo, sukuna, choso, gakuganji

**`grunt_big_1.wav`** · 0.6 s
```
A single deep booming battle shout from a large powerful man swinging with his whole body, heavy aggressive and chest-driven, non-verbal, dry close-mic vocal recording with no reverb, about 0.6 seconds long, mono anime fighting game voice, no words, no music
```

**`grunt_big_2.wav`** · 0.5 s
```
A single guttural low roar from a huge muscular man delivering a crushing strike, throaty and violent, non-verbal, dry close-mic vocal recording with no reverb, about 0.5 seconds long, mono anime fighting game voice, no words, no music
```

**`grunt_big_3.wav`** · 0.5 s
```
A single short heavy grunt from a large man exerting enormous force, a deep compressed effort sound rather than a yell, non-verbal, dry close-mic vocal recording with no reverb, about 0.5 seconds long, mono anime fighting game voice, no words, no music
```

### Female — covers maki, nobara, momo, meimei, uro

**`grunt_female_1.wav`** · 0.5 s
```
A single sharp determined effort grunt from a young woman attacking, fierce and focused, non-verbal, dry close-mic vocal recording with no reverb, about 0.5 seconds long, mono anime fighting game voice, no words, no music
```

**`grunt_female_2.wav`** · 0.5 s
```
A single short fierce shout from a young woman swinging a weapon hard, an aggressive non-verbal exertion yell, dry close-mic vocal recording with no reverb, about 0.5 seconds long, mono anime fighting game voice, no words, no music
```

**`grunt_female_3.wav`** · 0.4 s
```
A single quiet clipped exhale from a young woman striking quickly and precisely, controlled and low energy, non-verbal, dry close-mic vocal recording with no reverb, about 0.4 seconds long, mono anime fighting game voice, no words, no music
```

### Monster — covers jogo, hanami

**`grunt_monster_1.wav`** · 0.6 s
```
A single guttural rumbling snarl from a large inhuman creature attacking, throaty wet and clearly non-human, non-verbal, dry close-mic recording with no reverb, about 0.6 seconds long, mono monster creature voice for a fighting game, no words, no music
```

**`grunt_monster_2.wav`** · 0.5 s
```
A single low grinding growl from a monstrous creature exerting force, deep and gravelly with an unnatural resonance, non-verbal, dry close-mic recording with no reverb, about 0.5 seconds long, mono monster creature voice for a fighting game, no words, no music
```

**`grunt_monster_3.wav`** · 0.5 s
```
A single short hissing rasp from an inhuman creature lunging, airy and venomous rather than deep, non-verbal, dry close-mic recording with no reverb, about 0.5 seconds long, mono monster creature voice for a fighting game, no words, no music
```

### Animal — covers panda, mahito

**`grunt_animal_1.wav`** · 0.5 s
```
A single heavy animalistic huff and growl from a large beast swinging, bestial and short, non-verbal, dry close-mic recording with no reverb, about 0.5 seconds long, mono animal creature voice for a fighting game, no words, no music
```

**`grunt_animal_2.wav`** · 0.5 s
```
A single deep chuffing bark from a large heavy animal striking, blunt and percussive, non-verbal, dry close-mic recording with no reverb, about 0.5 seconds long, mono animal creature voice for a fighting game, no words, no music
```

**`grunt_animal_3.wav`** · 0.4 s
```
A single short snorting exhale from a big animal bracing and pushing, low and breathy, non-verbal, dry close-mic recording with no reverb, about 0.4 seconds long, mono animal creature voice for a fighting game, no words, no music
```

### KO cries (6 files, optional)

Played when a fighter is knocked out and flies off the stage.

**`ko_young_male.wav`** · 1.0 s
```
A single short pained cry from a young man in his late teens being knocked away, fading and receding into the distance as it goes, non-verbal, close-mic vocal with a doppler falloff, about 1 second long, mono anime fighting game defeat voice, no words, no music
```

**`ko_adult_male.wav`** · 1.0 s
```
A single short pained grunt from an adult man being knocked away, restrained even in defeat, fading and receding into the distance, non-verbal, close-mic vocal with a doppler falloff, about 1 second long, mono anime fighting game defeat voice, no words, no music
```

**`ko_big.wav`** · 1.2 s
```
A single deep bellowing cry of defeat from a huge powerful man being launched away, fading and receding into the distance, non-verbal, close-mic vocal with a doppler falloff, about 1.2 seconds long, mono anime fighting game defeat voice, no words, no music
```

**`ko_female.wav`** · 1.0 s
```
A single short pained cry from a young woman being knocked away, fading and receding into the distance, non-verbal, close-mic vocal with a doppler falloff, about 1 second long, mono anime fighting game defeat voice, no words, no music
```

**`ko_monster.wav`** · 1.2 s
```
A single dying shriek from a large inhuman creature being blasted away, guttural and wet, fading and receding into the distance, non-verbal, close-mic recording with a doppler falloff, about 1.2 seconds long, mono monster defeat voice for a fighting game, no words, no music
```

**`ko_animal.wav`** · 1.0 s
```
A single yelping howl from a large beast being knocked away, fading and receding into the distance, non-verbal, close-mic recording with a doppler falloff, about 1 second long, mono animal defeat voice for a fighting game, no words, no music
```

---

## Tier 4 — Menu and UI (7 files)

The menu currently borrows combat sounds. These should feel like UI rather
than fighting — quiet, quick, synthetic.

**`ui_move.wav`** · cursor moves between fighters or options · 0.1 s
```
A soft crisp user interface cursor tick, a very short clean synthetic blip, subtle and unobtrusive, dry with no reverb, about 0.1 seconds long, mono game menu sound effect, no music, no voice
```

**`ui_select.wav`** · confirming a menu button · 0.2 s
```
A positive user interface confirmation click, a short bright two-tone synthetic chime moving upward, clean and satisfying, dry with no reverb, about 0.2 seconds long, mono game menu sound effect, no music, no voice
```

**`ui_back.wav`** · backing out of a screen · 0.2 s
```
A soft user interface cancel sound, a short descending two-tone synthetic blip, gentle and non-punishing, dry with no reverb, about 0.2 seconds long, mono game menu sound effect, no music, no voice
```

**`ui_lock_in.wav`** · a player locks in their fighter · 0.6 s
```
A decisive character-select lock-in, a solid stamping impact with a bright energetic shimmer rising immediately after it, satisfying and committed, about 0.6 seconds long, mono fighting game menu sound effect, no music, no voice
```

**`ui_denied.wav`** · trying to start before everyone is ready · 0.3 s
```
A soft user interface error buzz, a short muted low double blip, discouraging but not harsh or startling, dry with no reverb, about 0.3 seconds long, mono game menu sound effect, no music, no voice
```

**`ui_start.wav`** · leaving the menu to begin a match · 1.0 s
```
A match-starting flourish, a rising energetic synthetic swell resolving into one bright impact, exciting and forward-driving, about 1 second long, stereo fighting game menu transition sound effect, no music bed, no voice
```

**`ui_pause.wav`** · opening or closing the pause menu · 0.3 s
```
A game pausing, a short muffled downward whoosh with a soft low-pass filtered thud at the end, about 0.3 seconds long, mono game menu sound effect, no music, no voice
```

---

## Tier 5 — Cursed energy, summons, domains (11 files)

Where the game's identity lives, and where `blast` is currently doing the most
undeserved work.

**`energy_charge.wav`** · holding a chargeable heavy · 1.5 s, **seamless loop**
```
Supernatural cursed energy gathering and building, a low rising electrical hum with crackling arcs growing in intensity, ominous and tense, designed as a seamless loop with matching start and end so it can repeat without a click, exactly 1.5 seconds long, mono video game charge loop, no music, no voice
```

**`projectile_fire.wav`** · launching an energy projectile · 0.4 s
```
Firing a ball of cursed energy from the hand, a compressed whoosh with a low electrical thrum as it leaves and accelerates away, dry and punchy, about 0.4 seconds long, mono anime fighting game projectile launch, no music, no voice
```

**`projectile_hit.wav`** · energy projectile connecting · 0.5 s
```
A ball of cursed energy bursting on impact, a sharp energetic pop with a low bass thump underneath and crackling electrical residue after it, about 0.5 seconds long with a short tail, mono anime fighting game projectile impact, no music, no voice
```

**`explosion_small.wav`** · small bursts, traps springing · 0.6 s
```
A small tight explosion, a punchy debris burst with a short low tail and scattering fragments, contained rather than cinematic, about 0.6 seconds long, mono video game explosion sound effect, no music, no voice
```

**`explosion_large.wav`** · meteors, big ultimate impacts · 1.5 s
```
A huge devastating explosion, an enormous low-end boom with a sharp cracking transient at the front and a long rumbling debris tail rolling away after it, cinematic and overwhelming, about 1.5 seconds long, stereo video game explosion sound effect, no music, no voice
```

**`summon_appear.wav`** · a shikigami or curse is summoned · 0.8 s
```
A creature being summoned out of a pool of shadow, a low swelling whoosh with a dark magical shimmer and a short bestial growl arriving at the end, about 0.8 seconds long, mono anime fighting game summon sound effect, no music, no voice
```

**`summon_attack.wav`** · a summon lunges and bites · 0.4 s
```
A beast lunging forward and biting, sharp snapping jaws with a wet snarl behind them, fast and dry, about 0.4 seconds long, mono creature attack sound effect for a fighting game, no music, no voice
```

**`ultimate_activate.wav`** · any ultimate firing · 1.5 s
```
A devastating ultimate technique activating, a deep charging swell building and then exploding into a powerful energy release, cinematic and heavy, about 1.5 seconds long with a natural tail, stereo anime fighting game ultimate sound effect, no music bed, no voice
```

**`domain_expansion.wav`** · all 7 domains share one clip today · 3.0 s
```
A reality-warping domain unfolding and sealing shut around the listener, a vast low rumbling swell with an inverted reversed shimmer rising through it, one deep resonant bell strike, and the air closing in at the end, ominous enormous and cinematic, about 3 seconds long with a long tail, stereo anime supernatural sound effect, no music bed, no voice
```

**`domain_collapse.wav`** · a domain ending · 1.5 s
```
A sealed domain shattering and reality snapping back into place, glass-like cracking with a reversed whoosh and a low pressure release at the end, about 1.5 seconds long with a decaying tail, stereo anime supernatural sound effect, no music, no voice
```

**`install_activate.wav`** · a transformation buff turning on (True Form, Gorilla Mode) · 1.2 s
```
A character powering up and transforming, a rising energy surge with a heavy pulsing bass swell and a crackling aura settling in around them, intense and physical, about 1.2 seconds long, mono anime fighting game power-up sound effect, no music, no voice
```

### Per-domain stings (7 files, stretch goal)

The seven domains in `src/domains.js` all announce with the same clip today.
These are signature layers meant to sit **under** `domain_expansion.wav`, so
each keeps its own character without having to carry the whole moment.

**`domain_unlimited_void.wav`** · Gojo — Unlimited Void · 2.0 s
```
Infinite information flooding into a mind all at once, a vast airy void tone with layered whispering static swelling and then dropping into overwhelming silence, cold endless and disorienting, about 2 seconds long with a long tail, stereo supernatural atmosphere layer, no music, no voice
```

**`domain_malevolent_shrine.wav`** · Sukuna — Malevolent Shrine · 2.0 s
```
A shrine built of bone and slaughter manifesting from the ground, deep ritual taiko drums with wet bone-cracking textures and a menacing low male choir underneath, brutal and sacrificial, about 2 seconds long with a long tail, stereo supernatural atmosphere layer, no lyrics
```

**`domain_shadow_garden.wav`** · Megumi — Chimera Shadow Garden · 2.0 s
```
A garden of living shadow spreading outward across the ground, a soft dark liquid rush with rising inky whooshes and distant animal growls moving through it, about 2 seconds long with a long tail, stereo supernatural atmosphere layer, no music, no voice
```

**`domain_self_embodiment.wav`** · Mahito — Self-Embodiment of Perfection · 2.0 s
```
Human souls being reshaped against their will, an unsettling warped choral drone with wet stretching and morphing flesh textures woven through it, deeply wrong and nauseating, about 2 seconds long with a long tail, stereo supernatural atmosphere layer, no lyrics
```

**`domain_iron_mountain.wav`** · Jogo — Coffin of the Iron Mountain · 2.0 s
```
A volcanic mountain sealing shut around a victim, immense grinding stone with roaring magma underneath and a deep suffocating heat rumble, crushing and airless, about 2 seconds long with a long tail, stereo supernatural atmosphere layer, no music, no voice
```

**`domain_idle_death_gamble.wav`** · Hakari — Idle Death Gamble · 2.0 s
```
A pachinko parlour of fate exploding into life, cascading metal balls with bright manic jackpot bells and gaudy arcade fanfare stacking on top of each other, chaotic and euphoric, about 2 seconds long with a long tail, stereo arcade atmosphere layer, no voice
```

**`domain_mutual_love.wav`** · Yuta — Authentic Mutual Love · 2.0 s
```
An overwhelming outpouring of love and grief, a soaring sorrowful string swell with a warm protective hum underneath it, beautiful and devastating at once, about 2 seconds long with a long tail, stereo emotional atmosphere layer, no lyrics
```

---

## Tier 6 — Stage hazards / Active Boards (10 files)

`src/stage_fx.js` gives eight boards their own gimmick, with **24 sound calls
that all borrow combat clips** — the Lantern Corridor bell is a sword `block`
pitched down to 0.55, and the wandering curse on School Wing is `gruntMonster`.
Nothing here has audio of its own.

**`hazard_telegraph.wav`** · shared warning before any hazard fires · 0.5 s
```
A rising warning tone signalling that something dangerous is about to happen in this spot, a short tense two-note swell with a soft alarm edge, clear but not shrill, about 0.5 seconds long, mono video game hazard telegraph cue, no music, no voice
```

**`hazard_water_surge.wav`** · Flooded Gate — a wave sweeps the platform · 2.0 s
```
A knee-high wall of water surging across a flooded stone floor, a heavy rushing whoosh with churning foam and splashing at the leading edge, sustained then receding, about 2 seconds long, stereo water hazard sound effect, no music, no voice
```

**`hazard_fang_snap.wav`** · Curse Maw and Cursed Teeth — fangs snap shut · 0.5 s
```
Enormous bony fangs snapping shut like a trap, a hard wet bone-on-bone clack with a deep meaty closing thud underneath, brutal and sudden, about 0.5 seconds long, mono creature hazard sound effect, no music, no voice
```

**`hazard_bloom.wav`** · Garden Steps — a healing flower opens · 0.8 s
```
A large flower unfurling open with supernatural speed, a soft organic peeling rustle blossoming into a warm gentle chime, inviting and benign, about 0.8 seconds long, mono magical plant sound effect, no music, no voice
```

**`hazard_bell.wav`** · Lantern Corridor — the lantern shakes loose · 0.9 s
```
A single old temple bell struck once as a warning, a warm bronze ring with a natural decaying tail, calm and ominous rather than alarming, about 0.9 seconds long, mono temple bell sound effect, no music, no voice
```

**`hazard_fire_patch.wav`** · Lantern Corridor — burning floor · 1.5 s, **seamless loop**
```
A patch of floor burning steadily, a crackling fire bed with soft roaring underneath and occasional popping embers, designed as a seamless loop with matching start and end so it can repeat without a click, exactly 1.5 seconds long, mono fire loop sound effect, no music, no voice
```

**`hazard_electric_arc.wav`** · Neon Split — the bolt strikes and holds · 1.2 s
```
A high-voltage electrical bolt striking down and then holding as a sustained arc, a sharp cracking discharge followed by a buzzing crackling hum, dangerous and unstable, about 1.2 seconds long, mono electricity hazard sound effect, no music, no voice
```

**`hazard_traffic_pass.wav`** · Crosswalk Rush — traffic races through · 1.0 s
```
A vehicle rushing past at speed very close by, a fast doppler whoosh with a low tyre roar sweeping from one side to the other, about 1 second long, stereo traffic pass-by sound effect, no music, no voice
```

**`hazard_signal_chirp.wav`** · Crosswalk Rush — the crossing signal warns · 0.6 s
```
A pedestrian crossing signal chirping a warning, two or three short clean electronic beeps in a steady rhythm, everyday and slightly ominous in context, about 0.6 seconds long, mono street signal sound effect, no music, no voice
```

**`hazard_curse_latch.wav`** · School Wing — the wandering curse attaches · 0.7 s
```
A small parasitic creature latching onto a body, a wet sticky slap followed by a scrabbling chittering squeal, unpleasant and clingy, about 0.7 seconds long, mono creature hazard sound effect, no music, no voice
```

---

## Round 9 — element hit layers and signature one-shots (15 files)

Delivered and wired in. This round came out of the effects work in
[effects-plan.md](effects-plan.md): hits carry an element visually, and seven
characters had a technique whose whole identity is a sound nobody had made yet.
Every call site already existed when the request went out, so each file switched
on as it was registered.

### Element hit layers (7 files)

Played quietly UNDER the normal hit sound whenever a hit of that element
connects — `ELEMENT_HIT_SFX` in `src/config_audio.js`, fired from `combat.js`
at a gain that scales with damage. Seasoning, not the meal.

**`hit_fire.wav`** · `hitFire` — flame catching on impact · 0.5 s
```
a short burst of fire igniting on impact, whoomph of flame with a crackle tail, no explosion boom, tight and dry
```

**`hit_blood.wav`** · `hitBlood` — a heavy wet splat · 0.4 s
```
a thick heavy wet splat, dense liquid impact with a short spatter tail, visceral but not gory squelch
```

**`hit_steel.wav`** · `hitSteel` — metal glancing off metal · 0.4 s
```
a sharp steel-on-steel glance, bright metallic ring cut short, sword clash without the swing
```

**`hit_wind.wav`** · `hitWind` — a blade of air slicing through · 0.4 s
```
a fast slicing gust, sharp air whip crack with a hollow whoosh tail, no voice
```

**`hit_sound.wav`** · `hitSound` — a resonant concussive tone · 0.6 s
```
a deep resonant concussive tone hitting like a struck gong crossed with a bass drop, brief, musical edge
```

**`hit_shadow.wav`** · `hitShadow` — dark matter whipping past · 0.5 s
```
a dark whooshing impact, low smoky rush with a faint reversed tail, ominous, no scream
```

**`hit_soul.wav`** · `hitSoul` — something touching the soul · 0.6 s
```
an eerie shimmering impact, cold glassy ripple with a detuned harmonic tail, unsettling, quiet
```

### Signature one-shots (8 files)

Each is the sound of one technique, at a call site that was waiting for it.

**`boogie_clap.wav`** · `boogieClap` — Todo's clap, the whole technique · 0.7 s
```
a single enormous dry hand clap in a large hall, sharp transient, big natural reverb tail, nothing else
```

**`power_chord.wav`** · `powerChord` — Gakuganji's Power Chord · 1.2 s
```
a single aggressive distorted electric guitar power chord, palm-muted strike then ringing out, raw amp tone
```

**`crow_caw.wav`** · `crowCaw` — Mei Mei's crow leaving her hand · 0.6 s
```
a single harsh crow caw with a flutter of wingbeats, close and dry
```

**`paper_flutter.wav`** · `paperRustle` — Reggie's receipts becoming things · 0.6 s
```
a fast flutter of many paper slips fanning and snapping taut, dry crisp rustle ending in a thump
```

**`soul_reshape.wav`** · `soulReshape` — Mahito's Idle Transfiguration · 0.8 s
```
a wet clay-like squelch morphing with a bone creak and a faint chime, unsettling body-horror texture, not gory
```

**`seam_crack.wav`** · `seamCrack` — Nanami's 7:3 seam snapping onto the target · 0.5 s
```
a precise glass crack snapping along a line, clean sharp fracture with a faint metallic ping, surgical
```

**`rct_chime.wav`** · `healChime` — Reverse Cursed Technique beginning · 0.9 s
```
a warm gentle chime swell with soft rising sparkle motes, healing shimmer, calm, no melody
```

**`fire_burn_loop.wav`** · `fireBurnLoop` — the bed under burn ticks and Furnace Shell, seamless · 2.0 s
```
a small steady fire burning, soft crackle loop, even level, seamless loop, no wind
```

This last one is the only file in the round that arrived without a call site.
It has one now: `noteFireBurning()` (`src/audio.js`) is asked for the bed every
frame by anything alight — a burn status in `combat.js`, a `contactBurn` install
in `fighter.js` — and the loop stops on the first frame nobody asks. It is in
`LOOPING` in `tools/generate_sfx.py`, so a re-roll keeps its full length and
un-faded tail.

---

## Round 10 — the domain moment (12 files)

Delivered and wired in. **The request below is kept as written**, in the present
tense it was written in — it describes the game *before* the round landed, the
way the round-8 audit above does, and it is the rationale for what was made
rather than a description of anything still true. What actually arrived, and
where it differed from the brief, is in the
[delivery record](#round-10--delivery-record) below it. Every prompt and every
spoken line here is still live input: `tools/generate_sfx.py` and
`tools/generate_voice.py` both parse this file, and these entries are how any of
these 15 files gets re-rolled.

A Domain Expansion is the biggest thing in this game: it costs a full meter,
it stops the world for half a second, it swaps the entire backdrop, and it is
the move every one of these characters is known for. It currently sounds like
**one sting, one signature layer, and then seven seconds of the ordinary fight
mix** — no voice, no barrier, no room tone, and no sound at all when the
barrier comes down.

This round fixes that. It is deliberately two halves with different
deliverers: **10A is voice** and cannot come from the sound-effects generator;
**10B is sound effects** and can.

Everything in both halves is **already wired**. Every key below is registered
in `src/config_audio.js` and called from `src/domains.js`, and an undelivered
sound is dropped silently by `playSfx` — so the game sounds exactly as it does
today until the files land, and needs no code change on the day they do. Drop
the mp3s in `assets/sfx/` and the moment assembles itself.

### 10A — "Ryōiki Tenkai", per domain owner *(voice — 8 files)*

Eight fighters have a Domain Expansion. Each says the same two-part line the
show gives them: **領域展開** (*Ryōiki Tenkai*, "Domain Expansion") followed by
the domain's name. In Japanese, in character, one file each.

**One file per fighter, containing the whole line**, rather than a shared
"Ryōiki Tenkai" plus a separate name. The pacing between the two halves — how
long Gojo lets the pause sit, how fast Sukuna spits it — is a performance
decision, and splitting it would hand that to engine timing, which fires both
banners on the same frame and has no opinion worth having.

| Key | File | Fighter | Domain | Japanese | Kana | The read |
|---|---|---|---|---|---|---|
| `domainCallGojo` | `domain_call_gojo.mp3` | Gojo | Unlimited Void | 無量空処 *Muryōkūsho* | むりょうくうしょ | Unhurried, almost bored. He is not straining; he is doing the easiest thing he knows |
| `domainCallSukuna` | `domain_call_sukuna.mp3` | Sukuna | Malevolent Shrine | 伏魔御廚子 *Fukuma Mizushi* | ふくまみづし | Low, amused, contemptuous. A king naming a thing he has named a thousand times |
| `domainCallMegumi` | `domain_call_megumi.mp3` | Megumi | Chimera Shadow Garden | 嵌合暗翳庭 *Kangō An'eitei* | かんごうあんえいてい | Young, strained, committing everything. This costs him and it should sound like it |
| `domainCallMahito` | `domain_call_mahito.mp3` | Mahito | Self-Embodiment of Perfection | 自閉円頓裹 *Jihei Endonka* | じへいえんどんか | Delighted. A child showing you something he made |
| `domainCallJogo` | `domain_call_jogo.mp3` | Jogo | Coffin of the Iron Mountain | 蓋棺鉄囲山 *Gaikan Tecchisen* | がいかんてっちせん | Guttural, volcanic, furious — a curse's throat, not a man's |
| `domainCallDagon` | `domain_call_dagon.mp3` | Dagon | Horizon of the Captivating Skandha | 蕩蘊平線 *Tau'un Heisen* | たううんへいせん | Serene and wrong. Gentle, unbothered, like an announcement at a resort |
| `domainCallHakari` | `domain_call_hakari.mp3` | Hakari | Idle Death Gamble | 坐殺博徒 *Zasatsu Bakuto* | ざさつばくと | Loud, gleeful, showman — pitched to a crowd that is not there |
| `domainCallYuta` | `domain_call_yuta.mp3` | Yuta | Authentic Mutual Love | 真贋相愛 *Shingan Sōai* | しんがんそうあい | Quiet and certain. Grief that has stopped arguing with itself |

**The Japanese has been checked** against each domain's page on
[jujutsu-kaisen.fandom.com](https://jujutsu-kaisen.fandom.com), which is the
repo's standing authority for this on the art side and now here. The kanji were
all correct; **three romanizations were not**, and the row above is the fixed
one in each case — Megumi's *Kanko Chōkatei* → **Kangō An'eitei**, Jogo's
*Gaikan Tessaisen* → **Gaikan Tecchisen**, Dagon's *Tōun Heisen* →
**Tau'un Heisen**. The doc predicted two of the three.

**The kana column is what actually gets spoken**, and it is not decoration.
Every one of these names is an irregular reading — 蕩蘊平線 is *tau'un heisen*,
not *tōun*; 鉄囲 is *tecchi*, not *tessai* — so a synthesiser handed the kanji
guesses, and guesses wrong. The generation entries below are written in kana
for that reason, with 領域展開 spelled out as りょういきてんかい alongside them.
The kana is the fandom furigana, transcribed from the same page as the kanji.

**Delivery:** mono, dry, no music bed, no reverb — the sting and the barrier
underneath already supply the space, and a pre-reverbed line cannot be placed
in that mix. 1.5–3.0 s each; peak-normalised like every other file. Voice
category, trimmed at 1.1 gain so the line sits *above* its own sting rather
than inside it (`src/config_audio.js`).

**These cannot come from `tools/generate_sfx.py`.** That tool drives a
sound-*effects* endpoint; it does not speak. They come from
**`tools/generate_sfx.py`'s sibling, [`tools/generate_voice.py`](../tools/generate_voice.py)**,
which drives the text-to-speech endpoint instead and reads the entries below
the same way — same post-processing, same mono MP3 out, same idempotence:

```sh
ELEVENLABS_API_KEY=... python3 tools/generate_voice.py
```

Each entry names a **cast voice** as well as a line. Eight fighters sharing one
synthetic voice would be worse than the grunt groups they replace, so each is
cast separately from the Japanese side of the voice library, against the read
in the table above. The bracketed cues are performance direction for the `v3`
model — it takes them as direction and does not speak them.

**A voice entry is skipped by `generate_sfx.py` on purpose.** Both tools parse
the same `**`file.wav`** · … · N s` + fenced-block shape out of these docs, so
the ``· voice `id` ·`` field is what tells the sound-effects tool that an entry
is somebody else's: without it a domain call-out would be generated as a sound
effect, which is exactly the mistake this round is written to avoid.

**`domain_call_gojo.wav`** · Gojo — Unlimited Void · voice `ZcX76PwFSkrkyI78RBTK` *(Nayuta — dark anime hero, cool and edgy)* · 3.0 s
```
[casually] りょういきてんかい……むりょうくうしょ。
```

**`domain_call_sukuna.wav`** · Sukuna — Malevolent Shrine · voice `2UGDsJpBJAiAlF0jQQ7x` *(Henry — deep anime villain, mid-40s)* · 3.0 s
```
[low and amused] りょういきてんかい。ふくまみづし。
```

**`domain_call_megumi.wav`** · Megumi — Chimera Shadow Garden · voice `l3wUf9BndyIs5OPGxQB4` *(Subaru — young, deep, calm)* · 2.5 s
```
[strained] りょういきてんかい！ かんごうあんえいてい！
```

**`domain_call_mahito.wav`** · Mahito — Self-Embodiment of Perfection · voice `AAxVQbetQhXWMEZC9p8S` *(Kmy — energetic character voice)* · 2.5 s
```
[delighted] りょういきてんかい！ じへいえんどんか！
```

**`domain_call_jogo.wav`** · Jogo — Coffin of the Iron Mountain · voice `3U6tYxUqUpcplL5Qep78` *(Shimura — husky, hoarse)* · 2.5 s
```
[furious] [shouting] りょういきてんかい！ がいかんてっちせん！
```

**`domain_call_dagon.wav`** · Dagon — Horizon of the Captivating Skandha · voice `j9F4CefodWocCwFuvTC2` *(Shimo — gentle)* · 3.0 s
```
[serenely] りょういきてんかい。たううんへいせん。
```

**`domain_call_hakari.wav`** · Hakari — Idle Death Gamble · voice `BYXdCmviVEBLTqNmX1Mv` *(Yosh — upbeat, energetic)* · 2.5 s
```
[excited] [shouting] りょういきてんかい！ ざさつばくと！
```

**`domain_call_yuta.wav`** · Yuta — Authentic Mutual Love · voice `E6Kc2m06tkvciUiqnUhB` *(Hiro — calm, restrained, young)* · 3.0 s
```
[quietly] [determined] りょういきてんかい。しんがんそうあい。
```

### 10B — the barrier and the room *(sound effects — 4 files)*

These four go through the normal flow: they are written in the format
`tools/generate_sfx.py` parses, so
`ELEVENLABS_API_KEY=... python3 tools/generate_sfx.py` will make them. (That
tool now reads this file as well as the history file, precisely so an open
round can be generated before it lands.)

**`domain_captivating_skandha.wav`** · Dagon — Horizon of the Captivating Skandha · 2.0 s
```
A calm tropical shoreline opening into something enormous moving beneath the water, gentle surf and distant gulls with a vast low whale-like groan swelling underneath and pressure building, serene on the surface and deeply wrong below, about 2 seconds long with a long tail, stereo supernatural atmosphere layer, no music, no voice
```

**`domain_barrier.wav`** · the barrier closing over the stage · 1.2 s
```
An enormous curved barrier sealing shut around an arena, a deep dome-shaped whoomp with a glassy shimmering closure and a final locking thud, vast and enclosing, about 1.2 seconds long, stereo anime supernatural barrier, no music, no voice
```

**`domain_interior.wav`** · the room tone inside an open domain · 2.0 s, **seamless loop**
```
The inside of a vast supernatural enclosed space, a low airy pressurised drone with faint shifting harmonic overtones and a sense of enormous empty volume, oppressive and otherworldly but quiet enough to sit under combat, designed as a seamless loop with matching start and end so it can repeat without a click, exactly 2 seconds long, stereo ambient bed, no music, no voice
```

**`domain_rejected.wav`** · a second domain refused while one is open · 0.5 s
```
A cursed technique failing to take hold, a short choked energy swell that collapses inward with a dull dissonant clank, denied and final, about 0.5 seconds long, mono anime fighting game negative cue, no music, no voice
```

### What already changed in code

Three wiring gaps were closed while this round was written, all of them
audible today with the files that already exist:

- **`domainCollapse` has never been played.** `domain_collapse.mp3` has sat in
  `assets/sfx/` and in the registry since the round-8 pass; the barrier came
  down on a popup and silence. Now played from the domain entity's close path,
  which every exit runs through — expiry, the owner dying, the owner knocked
  off the stage.
- **`domainRejected`** is now called on the "A DOMAIN IS ALREADY OPEN" branch,
  which was silent.
- **`domainInterior`** starts with the barrier and stops on close *and* on
  match reset — a domain open when the match ends never runs its own close
  path, so without that a rematch would start inside the last match's room
  tone and never leave it.

The call-out **replaces the generic effort grunt** for these eight fighters
(`playGrunt` still runs for anyone else who ever gains a domain), so a
delivered line does not double up with a wordless shout.

---

## Round 15 leftovers — the sounds the staged fighters brought with them (4 files)

Round 15 of [asset-requests.md](asset-requests.md) added four fighters —
Mechamaru, Yuki Tsukumo, Dagon and Kurourushi — whose kits were built before
their art. Their audio was wired as far as it could go without new files: all
four are in `GRUNT_GROUPS` (`src/audio.js`) and so have a grunt trio and a KO
cry from the existing six voice groups.

> **All four are delivered.** The wording below was written while these four
> fighters were staged and unplayable, and was still open when they reached the
> select screen — at which point each one stopped being a sound owed against
> future art and became a **silent gap in play**, invisible because `playSfx`
> drops an unregistered or undelivered key without complaint. Dagon's domain
> sting was the most audible of the four and was delivered as part of
> [Round 10B](#10b--the-barrier-and-the-room-sound-effects--4-files) above; the
> three element layers were given the prompts they had always been missing and
> generated alongside it.

| Key | Where it belongs | What it is |
|---|---|---|
| `hitWater` | `ELEMENT_HIT_SFX.water` | The eighth element hit layer, for Dagon. A heavy wet slap and displacement — a body hit by a mass of water, not a splash in a puddle |
| `hitMachine` | `ELEMENT_HIT_SFX.machine` | The ninth, for Mechamaru. Steel on steel with a servo whine under it and a short vent of pressure after |
| `hitSwarm` | `ELEMENT_HIT_SFX.swarm` | The tenth, for Kurourushi. A dry chitinous crunch and a scatter of skittering — insects, close and many |
| `domainCaptivatingSkandha` | `DOMAIN_STING` (`src/domains.js`) | The eighth domain sting, for Horizon of the Captivating Skandha. Surf and gulls opening into something enormous moving underwater — the domain's whole trick is that it sounds like a holiday |

The three element layers are the same brief as Round 9's seven (above, with
their prompts and mix levels): **seasoning under the impact, not the impact** —
short, dry, and gain-trimmed to about 0.5. Their prompts, written in Round 9's
shape so `tools/generate_sfx.py` made them alongside 10B:

**`hit_water.wav`** · `hitWater` — a mass of water hitting a body · 0.4 s
```
a heavy wet slap of water displaced by a body, thick and dense with a short spatter tail, not a splash in a puddle, tight and dry
```

**`hit_machine.wav`** · `hitMachine` — steel with a motor behind it · 0.4 s
```
a hard steel-on-steel strike with a servo whine winding under it and a short vent of pressure after, mechanical, tight and dry
```

**`hit_swarm.wav`** · `hitSwarm` — insects, close and many · 0.4 s
```
a dry chitinous crunch of insect shells breaking, followed by a brief scatter of skittering legs, close and many, tight and dry
```

`DOMAIN_STING` had always named the Skandha key, so that file switched on where
it stood. `ELEMENT_HIT_SFX` deliberately did **not** name the three hit layers
while they were outstanding — an entry pointing at a file that is not there logs
a failed fetch on every hit, which reads as an error and trips the smoke tests —
so adding those three rows was part of landing the files, and is done.
`ELEMENT_HIT_SFX` now has ten rows.

---

## Round 11 — Inumaki's cursed speech *(open)*

**Inumaki is the one fighter whose entire kit is his voice**, and he is
currently the loudest argument for this round: every one of his four commands
fires a wordless young-male grunt shared with four other students. A character
whose technique *is* speech should not be the one who never speaks.

Four lines. Each is the command itself, in Japanese, spoken by him — the same
shape as the domain call-outs, one file per move.

**The on-screen text stays English.** The banner still reads `BLAST AWAY`, the
move list still reads "Blast Away". This round changes what he *sounds* like,
not what the game says — the same split the show uses, where the subtitle is
English and the command is not.

| Key | File | Move | Command | Kana | The read |
|---|---|---|---|---|---|
| `callInumakiBlastAway` | `call_inumaki_blast_away.mp3` | neutral special | ぶっとべ *Buttobe* | ぶっとべ | Hard and percussive, all in one push. The concussive one |
| `callInumakiDontMove` | `call_inumaki_dont_move.mp3` | side special | 動くな *Ugokuna* | うごくな | Flat, clipped, absolutely certain. Not shouted — a command does not need volume to be obeyed |
| `callInumakiGetCrushed` | `call_inumaki_get_crushed.mp3` | down special | 潰れろ *Tsuburero* | つぶれろ | Low and forced out, heavier than the other two. This one costs him two strain |
| `callInumakiUltimate` | `call_inumaki_ultimate.mp3` | ultimate | 捻れろ、ぶっとべ *Nejirero, Buttobe* | ねじれろ、ぶっとべ | Torn out of a throat that is about to give. The ult is a stage-buckling scream and this is the last thing that throat does |

**The Japanese is the canon command list**, checked against
[Cursed Speech on the fandom wiki](https://jujutsu-kaisen.fandom.com/wiki/Cursed_Speech)
the same way round 10's domain names were. All four map to attested commands
rather than translated English:

- 爆ぜろ *Hazero* (Explode), 捻れろ *Nejirero* (Get Twisted), 潰れろ *Tsuburero*
  (Get Crushed), 堕ちろ *Ochiro* (Crumble Away), 動くな *Ugokuna* (Don't Move),
  眠れ *Nemure* (Sleep), 戻れ *Modore* (Return), 逃げろ *Nigero* (Run Away),
  止まれ *Tomare* (Stop), ぶっとべ *Buttobe* (Blast Away), 死ね *Shine* (Die).
- **The ultimate is the only constructed line**, and it is constructed out of
  two attested commands rather than invented grammar: the move is called "GET
  TWISTED AND BLAST AWAY", so it is 捻れろ then ぶっとべ, spoken as two
  commands in sequence.
- **One deliberate departure from the wiki.** Its kana field for Blast Away
  reads ぶ**つ**とべ, which a synthesiser pronounces *butsutobe*. Its own romaji
  on the same row says *Buttobe*, and the small tsu is what makes that sound,
  so these entries use ぶ**っ**とべ. The wiki is the authority on *which* command
  it is; it is not the authority on a typo in its own furigana.

**Cast to a voice nobody else uses.** Eight voices are already spoken for by
the domain owners; reusing one would put Inumaki's mouth on Yuta's or Megumi's
line the first time both appear in a match.

**`call_inumaki_blast_away.wav`** · Inumaki — "Blast Away" · voice `EbuvaInXUGWtpYRUnKLQ` *(Sawaro — young Japanese voice actor)* · 1.2 s
```
[shouting] ぶっとべ！
```

**`call_inumaki_dont_move.wav`** · Inumaki — "Don't Move" · voice `EbuvaInXUGWtpYRUnKLQ` *(Sawaro)* · 1.2 s
```
[firmly] うごくな。
```

**`call_inumaki_get_crushed.wav`** · Inumaki — "Get Crushed" · voice `EbuvaInXUGWtpYRUnKLQ` *(Sawaro)* · 1.5 s
```
[low and forceful] つぶれろ！
```

**`call_inumaki_ultimate.wav`** · Inumaki — "Get Twisted and Blast Away" · voice `EbuvaInXUGWtpYRUnKLQ` *(Sawaro)* · 2.0 s
```
[screaming] ねじれろ！ ぶっとべ！！
```

### What this needs in code

Unlike round 10, **this round is not already wired** — there is no per-move
call-out mechanism yet, only the per-character domain one. What it needs is
small and is the general form of the thing `DOMAIN_CALL` does for domains:

- A `MOVE_CALL` map in `src/config_audio.js`, keyed by character and then by
  the move's own `name`, so it reads like the character sheet and survives a
  slot being reshuffled.
- `playGrunt(charKey, callKey)` takes an optional call, and plays it *instead*
  of the grunt when one is registered — the same "a line replaces the wordless
  shout" rule the domain call-outs established, so a delivered line never
  doubles up with a grunt.
- The 22 `playGrunt` sites in `src/specials.js` pass the move's call, and
  `cinematic()` in `src/ultimates.js` does the same for the ultimate. The
  grunt stays exactly where it is in each handler rather than being hoisted:
  four of those handlers only reach it after an early return, so a move that
  bails still makes no sound.

Any fighter who ever gets a line uses the same map; nothing here is
Inumaki-shaped except the rows in it.

---

### Delivery record

Delivered and wired in. All four peak-normalised to about -3 dBFS and encoded
to mono MP3, like every file before them.

| File | Brief | Delivered |
|---|---|---|
| `call_inumaki_blast_away.mp3` | 1.2 s | 1.14 s |
| `call_inumaki_dont_move.mp3` | 1.2 s | 0.73 s |
| `call_inumaki_get_crushed.mp3` | 1.5 s | 0.97 s |
| `call_inumaki_ultimate.mp3` | 2.0 s | 2.10 s |

**Two of his four moves turned out never to have made a sound at all.** The
request assumed all four fired the shared grunt; in fact only "Don't Move"
(a `projectile`) and the ultimate (via `cinematic()`) reached `playGrunt`.
`shout` and `crush` — his neutral and down specials, and the two loudest things
he does — were the only handlers in `specials.js` that never called it. Both
types are his alone, so adding the call there changed nothing for anyone else.

### Follow-up: the line became the wind-up

Round 11 shipped with the line and the move on the same frame — the command was
said *over* the attack rather than before it. That was corrected afterwards for
all twelve spoken moves, Inumaki's four and the eight domain call-outs alike:
the fighter now holds the pose, says the line, and the move lands 80% of the way
through it (`SPOKEN_TIMING`, `src/config_audio.js`). A Domain Expansion is
announced and then arrives, rather than arriving and being described.

Two things about that are audio decisions with gameplay consequences, and are
written up properly in [game-mechanics.md](game-mechanics.md#spoken-moves-wind-up-while-they-are-spoken):

- **The delay is read from written line lengths, never measured from the
  audio.** A move whose frame data depends on whether an mp3 finished
  downloading is a move nobody can learn, so `SPOKEN_LINES` carries the
  delivered length of each line and `tools/check_voice.mjs` fails when one has
  drifted from its file. **Re-rolling a line changes the frame data** — update
  its row, or the checker will say so.
- **The clamp matters more than the fraction.** Gojo's call-out is 3.28 s and
  80% of it would hold the match for 2.6 s; `SPOKEN_TIMING.max` caps every
  wind-up at 2.2 s, which is why his line, Jogo's and Mahito's all land at the
  ceiling rather than at their own 80%.
- **The first half of the line is interruptible, and free.** A spoken move can
  be hit out of its own sentence for the first 50% of it (`SPOKEN_TIMING.commit`)
  — domains included — and nothing is charged until the move actually goes off:
  no meter, no cooldown, no throat strain. A fighter shouted down keeps
  everything and can try again; what they lose is the opening they gave away.
  That is what makes a two-second telegraph a decision rather than a tax, and it
  is why the delay could be this long at all. Past the halfway point the move is
  committed, because by then it is visibly already happening.
- **An interrupted line stops mid-word**, faded over 60 ms rather than paused
  dead — a voice cut off on a vowel clicks, and the point is that the sentence
  was interrupted, not that the game stopped playing a file. `playSfx` returns
  its element so a caster can keep the handle and `cutSfx` it; a short winded
  grunt goes in its place.

**`MOVE_CALL` is the reusable half of this round.** It keys a spoken line by
character and then by the move's own `name`, and `playGrunt(charKey, moveName)`
plays it *instead* of the grunt. The 20 `playGrunt` sites in `specials.js` pass
the move they already have; the grunt stayed where it was in each handler
rather than being hoisted into `performSpecial`, because four of them only
reach it after an early return and a move that bails should still be silent.
A row naming a move that does not exist is checked at load and warned about
(`validateMoveCalls` in `audio.js`), because the symptom otherwise is a line
that was recorded, registered and silent.

---

## Round 12 — alternate takes (15 files)

> **Five of these were promoted into the game and round 13 answers the rest.**
> Gojo's relaxed take and Dagon's deep one replaced their originals (with
> `SPOKEN_LINES` moved to match), the female trio went in whole, two of the
> young-male trio and one of the big trio went in. Everything else was judged
> unusable — see the round-13 verdicts below.

Delivered as alternates rather than as replacements. The request is above in
[audio-requests.md](audio-requests.md) — it stays there rather than moving here
while the alternates are still alternates, because the round is not finished
until somebody has listened and chosen. Delivered lengths: the two domain calls
at 2.83 s (Gojo, after the direction was re-written) and 2.59 s (Dagon, after the
0.86 resample), and the twelve grunts between 0.54 s and 0.86 s.

**Gojo has two alternates, and they ask different questions** — whether he
should sound like he means it (*Commanding*) or like it costs him nothing
(*Flat*). The first was judged too expressive, which turned out to be a note
about the model's freedom rather than about the words.

**Three levers were added to `tools/generate_voice.py` for it**, and all three
are worth knowing about before the next voice round:

- **`· pitch 0.86 ·`** resamples a take downward — lower and slower together.
  Deliberately not formant-preserving: dragging the formants down with the
  pitch is what makes a voice read as coming from a bigger throat rather than
  as a person played back slowly. It is the only thing that got Dagon away from
  sounding like a polite man, because no amount of direction stops a
  text-to-speech model sounding human — it is a model of humans.
- **`· capped ·`** opts an entry back into the length cap that spoken lines are
  exempt from. The exemption exists because a cap lands mid-word in a sentence;
  a one-syllable effort grunt has no mid-word to land in, and an effort grunt
  fired on every special that runs 2.7 s long is unusable however good the take
  is. Three of the twelve came back over two seconds before this existed.

- **`· stability 1.0 ·`** overrides how far v3 may wander from a flat reading
  (0.0 creative, 0.5 natural, 1.0 robust). The default is right for a
  performance and wrong for a line that is meant to sound UNPERFORMED: somebody
  talking to themselves puts the emphasis nowhere, and while the model is free
  to act, no wording of the direction stops it acting.

**The grunts moved endpoint, which was the actual fix.** The originals came
from `generate_sfx.py` in round 8 — the sound-generation endpoint being asked
for a human noise and producing its impression of one, which is exactly why
they read as odd and animal-like. The alternates are a voice model making a
short vocal effort, which is a person making a short vocal effort.
`gruntMonster` and `gruntAnimal` are left alone on purpose: they are supposed
to sound like something that is not a person.

---

## Round 10 — delivery record

Delivered and wired in, in one pass with the four sounds the staged fighters
were owed. Everything below was **already called from `src/domains.js` before
the files existed** — `playSfx` drops an undelivered key silently — so nothing
in the sequence needed a code change on the day they landed. The two additions
to `src/config_audio.js` were the three element rows, which are the one case
where a missing file is *not* free: a row pointing at nothing logs a failed
fetch on every hit.

| File | Brief | Delivered | Voice |
|---|---|---|---|
| `domain_call_gojo.mp3` | 3.0 s | 3.28 s | Nayuta |
| `domain_call_sukuna.mp3` | 3.0 s | 2.52 s | Henry |
| `domain_call_megumi.mp3` | 2.5 s | 2.48 s | Subaru |
| `domain_call_mahito.mp3` | 2.5 s | 3.03 s | Kmy |
| `domain_call_jogo.mp3` | 2.5 s | 2.80 s | Shimura |
| `domain_call_dagon.mp3` | 3.0 s | 2.25 s | Shimo |
| `domain_call_hakari.mp3` | 2.5 s | 2.03 s | Yosh |
| `domain_call_yuta.mp3` | 3.0 s | 2.42 s | Hiro |
| `domain_captivating_skandha.mp3` | 2.0 s | 2.70 s | — |
| `domain_barrier.mp3` | 1.2 s | 1.62 s | — |
| `domain_interior.mp3` | 2.0 s | 6.40 s | — |
| `domain_rejected.mp3` | 0.5 s | 0.67 s | — |
| `hit_water.mp3` | 0.4 s | 0.54 s | — |
| `hit_machine.mp3` | 0.4 s | 0.54 s | — |
| `hit_swarm.mp3` | 0.4 s | 0.54 s | — |

All 15 peak-normalised to about -3 dBFS and encoded to mono MP3, like every
file before them.

**Three things worth knowing about the delivery:**

- **`domain_interior.mp3` is 6.4 s, not the 2.0 s asked for.** It is in
  `LOOPING`, and a looping file is deliberately never cut to length — a loop
  trimmed to a target loses its period and clicks. A longer bed was kept rather
  than re-rolled for length: it is a quiet drone under combat at 0.45 gain, and
  three times the period means three times as long before a listener can hear
  it repeat.
- **The three element layers are all exactly 0.54 s** because that is the cap
  (0.4 s × 1.35), not because they are the same sound. Short impact layers hit
  it routinely.
- **The romanizations in the request were wrong in three places** and were
  corrected against the fandom wiki before recording, as the request itself
  asked. The kanji were all correct. See the note under the 10A table.

**`tools/generate_voice.py` was written for 10A** and is the reason the voice
half did not need a human supplier. It is `generate_sfx.py`'s sibling: same
docs, same entry format, same post-processing, same idempotence, a different
endpoint. The routing rule between them is the ``· voice `id` ·`` field — an
entry that has one is speech and belongs to the voice tool, an entry that does
not is a sound effect and belongs to the other. Neither tool will touch the
other's entries.

One difference in the post-processing is worth knowing before re-rolling a
line: **a spoken entry is never length-capped.** The cap that keeps an impact
from turning a combo to mush lands mid-word in a sentence, so the voice tool
passes `cap=False` and reports a line that overruns its brief instead of
truncating it. If a re-roll comes back long, that is a take to re-roll, not a
file to trim.

---

## Suggested delivery order (as written at the time)

Kept for the record. It was followed, and everything below shipped.

1. **The 6 male-voice files in Tier 3** — 9 fighters including Gojo are
   literally mute right now. Biggest gap per file.
2. **Tier 1** (12 files) — breaks up the one-explosion-for-everything problem
   in the moment-to-moment game.
3. **Tier 2** (10 files) — fills the silent moments. `meter_full` and
   `countdown_go` are the two players will notice most.
4. **Tier 4** (7 files) — makes menus stop sounding like swordfights.
5. **Tier 5** (11 files) — the identity pass.
6. **Tier 6** (10 files) — Active Boards currently run entirely on borrowed
   combat clips.
7. Per-domain stings and KO cries last.

Totals: **68 files** for tiers 1–6, plus 13 optional. Tiers 1–3 alone
(40 files) would transform how the game feels.

---

## Delivery checklist

| Tier | Files | Delivered | Wired up |
|---|---|---|---|
| 1 — core combat | 12 | ☑ | ☑ |
| 2 — silent moments | 10 | ☑ | ☑ |
| 3 — voices | 18 (+6 KO) | ☑ | ☑ |
| 4 — menu / UI | 7 | ☑ | ☑ |
| 5 — energy / summons / domains | 11 (+7 stings) | ☑ | ☑ |
| 6 — stage hazards | 10 | ☑ | ☑ |
| 9 — element layers + signatures | 15 | ☑ | ☑ |
| 10 — the domain moment (8 voice + 4 sfx) | 12 | ☑ | ☑ |
| 15 leftovers — owed element layers + Dagon's sting | 3 (+1 in round 10) | ☑ | ☑ |
| 11 — Inumaki's cursed speech | 4 | ☑ | ☑ |

All 26 sound calls in `src/stage_fx.js` now name a specific sound; no generic
key is left in that file. Two hazards that were audible only when they
connected — the Curse Maw's jaws and the Neon Split's bolt wall — now sound
when they fire, so dodging one is no longer silent, and the Garden Steps
flower is heard opening rather than only when someone collects it.
