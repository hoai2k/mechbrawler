# Audio Requests — history

Record of the sound-effect rounds that have been **delivered and integrated**.
Nothing in this file is outstanding; open requests, if there ever are any
again, live in [audio-requests.md](audio-requests.md).

**All 96 files delivered and wired in** — 81 in the round-8 pass below, then the
15-file element and signature round after it. Filenames below say `.wav`; what
ships is the same name as **`.mp3`** (128 kbps) — a browser has to download
these, and MP3 is about a fifth the size. Generated with the ElevenLabs
sound-generation API from the prompts below, then trimmed, length-capped and
peak-normalised to -3 dBFS automatically. The registry, mix and categories live
in `src/config_audio.js`.

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

All 26 sound calls in `src/stage_fx.js` now name a specific sound; no generic
key is left in that file. Two hazards that were audible only when they
connected — the Curse Maw's jaws and the Neon Split's bolt wall — now sound
when they fire, so dodging one is no longer silent, and the Garden Steps
flower is heard opening rather than only when someone collects it.
