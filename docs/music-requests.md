# Music Requests — one battle theme per stage

> **STATUS: all 20 delivered.** Every track listed here is in
> `assets/music/boards/` and matches `BOARD_TRACKS` in `src/config_music.js` —
> no track listed without a file, no file without a listing. The prompts below
> are kept as the brief each one was written from, and as the shape a
> replacement or a new stage's theme should follow. Nothing here is outstanding.

Twenty instrumental loops, one for each stage in `src/stages.js`. Every prompt is
written to be pasted straight into a music generator (Suno, Udio, MusicGen, or a
human composer's brief). They deliberately span very different genres, because
the Jujutsu Kaisen soundtrack does.

---

## What makes it sound like Jujutsu Kaisen

From the show's own scores (Hiroaki Tsutsumi, Yoshimasa Terui and Alisa
Okehazama, with a rotating cast of guest artists):

- **It is a compilation, not a style.** The composers treat the OST "both
  traditionally and like a sort of compilation album" — orchestral cues sit next
  to rap, metal, EDM and jazz on the same disc. Two stages sounding nothing
  alike is correct, not a mistake.
- **Industrial rock is the spine.** Okehazama cites Nine Inch Nails and Trent
  Reznor, aiming at a "1990s, early 2000s industrial rock sound" — distorted
  bass, mechanical percussion, grit on everything.
- **Orchestra plus electronic drums.** Big string and brass writing gets
  programmed drums under it rather than a live kit; that hybrid is the house
  sound for transformations and villain reveals.
- **World instruments over modern production.** The season 1 sessions used
  electric sitar, oud, erhu, duduk, viola da gamba and hammered dulcimer
  alongside a full orchestra — the "ancient curse in modern Tokyo" contrast.
- **Taiko, dissonant brass, and a low choir** carry the ancient-power cues
  (Sukuna's themes, Domain Expansions).
- **Real hip hop, not anime-flavoured hip hop.** Boom-bap basslines, jaunty
  keys, trap hats and drill patterns show up in full tracks, not as garnish.
- **Percussion is a lead instrument.** Hammered dulcimer and unusual
  percussion-string layers build fight tension where a guitar riff normally
  would.

Sources: [All the Anime — Music: Jujutsu Kaisen](https://blog.alltheanime.com/music-jujutsu-kaisen/),
[Wikipedia — JJK season 1 soundtrack](https://en.wikipedia.org/wiki/Jujutsu_Kaisen_season_1_(soundtrack)),
[Wikipedia — JJK season 2 soundtrack](https://en.wikipedia.org/wiki/Jujutsu_Kaisen_season_2_(soundtrack)),
[LIFTED — The 4 times Jujutsu Kaisen reps Hip Hop](https://liftedasia.com/article/jujutsu-kaisen-reps-hip-hop),
[Anime Papa — Jujutsu Kaisen Music](https://animepapa.com/jujutsu-kaisen-music/).

---

## Delivery spec — applies to all twenty

Append this to every prompt, or hand it to the composer once:

> **Fully instrumental — no lyrics, no sung or rapped words.** Wordless vocal
> textures (chant, breath, hums, chopped syllables) are welcome as instruments.
> Written as looping fight-scene background music for a 2D platform fighter:
> energetic but not distracting, no long silences, no dramatic full stops, no
> fade-in or fade-out. 90–150 seconds, seamless loop point. Mixed with a clear
> mid-range hole so sound effects and voices cut through; keep the sub-bass
> controlled. Clean, modern anime-score production quality. Deliver 44.1 kHz
> stereo MP3 (320 kbps) or WAV, normalised to about −14 LUFS.

Files go in `assets/music/`, named after the stage key —
`assets/music/training_bridge.mp3`, `assets/music/curse_maw.mp3`, and so on.
(Per-stage playback is not wired up yet: `src/audio.js` currently rotates two
tracks for every match. Hooking a `music` field on each stage into `TRACKS` is a
small change once the audio exists.)

---

## The twenty prompts

### 1. Training Bridge — *the first lesson*
Green, sunlit, safe. The bout everyone plays first.

> Bright shonen battle theme, hybrid orchestral rock, 148 BPM, D minor turning
> to F major. Palm-muted electric guitar and a driving live-feel kit under
> soaring string ostinatos and a hopeful horn melody; light taiko fills on the
> turnarounds. Confident and encouraging rather than dangerous — a training
> sparring match between friends who are still learning. Clean, punchy, upbeat.

### 2. Quiet Hall — *held breath*
Warm wood, low light, nobody raising their voice.

> Restrained jazz-noir instrumental, 96 BPM, minor blues tonality. Brushed
> drums, walking upright bass, muted trumpet, sparse Rhodes chords, and a koto
> answering the trumpet phrase for phrase. Smoky, patient, faintly menacing —
> two people about to fight in a room where fighting is forbidden. Groove holds
> steady; never explodes.

### 3. Flooded Gate — *water under a torii*
Ankle-deep water, cold blue light, ruined shrine gate.

> Ambient dub with taiko, 84 BPM, atmospheric and heavy. Deep sub bass, tape
> delay throws, reverse cymbals, dripping-water percussion and wet field
> textures; slow taiko strikes marking the bar, a lone shakuhachi motif drifting
> in and out. Ancient, waterlogged, quietly threatening. Sparse arrangement with
> enormous space.

### 4. Shibuya Night — *the incident*
Rain-slick crossing, sodium light, everything about to go wrong.

> Dark UK drill instrumental, 142 BPM, minor key. Sliding 808 bass, sparse
> skittering hi-hats, ominous plucked-string and bell melody, gunshot-tight
> snares, cinematic string stabs on the drop. Cold, tense, modern Tokyo at
> midnight — an ambush in a crowded place. Menacing swagger, no triumph.

### 5. Curse Maw — *inside the mouth*
A shrine roof and a giant fanged maw glowing sick teal.

> Industrial horror metal instrumental, 132 BPM, drop-tuned and dissonant.
> Distorted mechanical percussion, detuned bass grind, scraped-metal samples,
> chugging low guitar, and a wordless low male chant buried in the reverb;
> occasional dissonant brass cluster like a scream. Nine Inch Nails filth with a
> Japanese temple bell. Claustrophobic, wrong, biological.

### 6. Garden Steps — *the stone stairway*
Green terraces, old stone, mountain air.

> Folk-orchestral battle theme, 120 BPM, dorian mode. Shakuhachi lead over
> pizzicato strings and hand percussion; koto arpeggios; a warm cello
> countermelody that builds into a full string section by the second half.
> Graceful and rooted — a duel with etiquette, on ground that has seen this
> before. Elegant motion, never frantic.

### 7. Lantern Corridor — *festival night*
Rows of hanging lanterns, orange warmth, narrow passage.

> Japanese festival percussion meets electronic dance, 138 BPM, pentatonic and
> celebratory-but-eerie. Matsuri taiko pattern, shamisen riff, atarigane bell,
> layered with a four-on-the-floor synth bassline and filtered arpeggios;
> shouted crowd-style vocal chops used purely as rhythm. Joyful on the surface,
> something following you underneath.

### 8. Sunken Crossing — *below the waterline*
Blue, submerged, light coming from above.

> Liquid drum and bass, 174 BPM, lush minor keys. Rolling amen-style breaks,
> deep round Reese bass, wide pads, glassy piano stabs and a legato string line
> gliding over the top; underwater filter sweeps between sections. Fast but
> weightless — fighting in slow motion while the drums race. Momentum without
> aggression.

### 9. Neon Split — *the street torn in half*
Red on one side, blue on the other, a violet fracture down the middle.

> Aggressive synthwave-EDM hybrid, 128 BPM, two-key structure that flips between
> a warm major-ish A section and a cold minor B section. Fat detuned saw bass,
> gated arpeggios, glitched stutter edits and hard electro drums; a distorted
> lead that answers itself across the stereo field. Duelling halves, rivalry,
> electricity. Big neon energy.

### 10. Bone Sanctum — *the throne of teeth*
Vaulted cathedral of ribs and tusks lit by blue flame.

> Dark choral orchestral, 100 BPM, minor with tritone emphasis. Wordless low
> male choir chanting in slow rhythmic syllables, war taiko, sul ponticello
> strings, dissonant brass swells and a tolling temple bell; electronic sub
> reinforcement on the downbeats. Ancient, ritual, enormous — the throne room of
> a king of curses. Slow, crushing, unhurried.

### 11. Bridge Duel — *one on one, nowhere to run*
A narrow span, two fighters, a long drop.

> Tense minimalist duel theme, 112 BPM, sparse and modal. A single shamisen
> ostinato, low string drone, taut taiko heartbeat and hammered dulcimer
> tremolo; instruments enter one at a time and the tension is built by
> accumulation rather than volume. Duel standoff, breath held, blade half-drawn.
> Restraint until the last twenty seconds, which finally releases.

### 12. Academy Hall — *after class*
Wood floors, old school building, students being students.

> Boom-bap hip hop instrumental, 92 BPM, jazzy minor. Dusty sampled drum break,
> upright bass line, jaunty Rhodes and vibraphone chords, muted horn stabs, a
> little vinyl crackle; occasional record-scratch transitions. Loose, cocky,
> effortlessly cool — a schoolyard scrap between people who like each other.
> Head-nod groove throughout.

### 13. Mist Pier — *dawn on the water*
Fog, lanterns, a torii out in the bay, first light.

> Ambient post-rock, 76 BPM building to 76 BPM double-time feel, major-key
> melancholy. Reverb-drenched tremolo guitars, bowed cymbals, soft mallet
> percussion, distant shakuhachi and slow swelling strings that finally arrive
> with full drums two thirds in. Beautiful and sad — a fight neither person
> wanted, at sunrise. Patient build, big warm payoff.

### 14. Crosswalk Rush — *rush hour*
Wide intersection, traffic light glare, motion everywhere.

> Big beat breakbeat, 136 BPM, driving and cluttered in a controlled way.
> Chunky processed breaks, filtered funk bass, siren-like synth stabs, brass
> hits, car-horn and turnstile samples used percussively. Urgent, kinetic,
> chaotic city energy — a running battle through a crowd. Relentless forward
> drive, no breathing room.

### 15. Cursed Teeth — *the thing that bites*
Teal-lit fangs, wrong geometry, something alive.

> Heavy bass music with world instruments, 140 BPM (half-time feel), grotesque
> and physical. Riddim-style wobble bass and hard mechanical snares under a
> frantic erhu melody; growling sub, metallic percussion, pitch-bent stabs that
> sound like chewing. Monstrous and rhythmic — fighting something with too many
> mouths. Nasty, danceable, unhinged.

### 16. River Gate — *the crossing place*
Green water, an old gate, somewhere between worlds.

> Mournful orchestral battle theme with world lead, 118 BPM, minor. Duduk and
> erhu trading a long grieving melody over rolling low strings, frame drums and
> a slow taiko pulse; a hammered dulcimer keeps a nervous ostinato underneath;
> brass enters late and heavy. Beautiful sorrow with real force behind it — a
> fight between people who were once on the same side.

### 17. School Wing — *lunch break brawl*
Corridors, warm afternoon light, nothing serious at stake.

> Upbeat jazz-fusion instrumental, 132 BPM, bright and busy. Tight funk drums,
> slap bass, stabbing brass section riffs, electric piano solo trading with a
> clean guitar; playful key changes and a shuffle turnaround. Cheerful,
> mischievous, high-energy — a scrap that will end in laughing. Zero menace.

### 18. Empty City — *nobody left*
Pale grey towers, no people, no sound but wind.

> Desolate ambient techno, 122 BPM, cold and hollow. Muted four-on-the-floor
> kick heard as if through concrete, dub-delayed stabs, granular wind textures,
> a distant detuned piano figure repeating; slow filter opening across the whole
> track. Empty, eerie, vast — a battle nobody is watching. Hypnotic, minimal,
> steadily building pressure.

### 19. Billboard Roof — *top of the world*
Rooftop, storm lightning, the whole skyline lit up.

> Instrumental arena metalcore, 160 BPM, drop C. Twin-guitar riffing, double
> kick, huge open-string chugs, a soaring lead melody in the chorus, orchestral
> strings doubling the guitars, and one half-time breakdown with taiko
> reinforcement. Triumphant and enormous — the showdown at the highest point in
> the city, in the rain. Anthemic, chest-out, cinematic.

### 20. Domain Core — *sure-hit*
Crystal cathedral, floating debris, a mandala of light. The final stage.

> Maximal hybrid orchestral finale, 145 BPM, epic minor with a modal shift at
> the climax. Full orchestra and wordless choir, war taiko and electronic drums
> together, distorted synth bass, dissonant brass clusters, glassy bell
> arpeggios and a single soaring string melody that returns three times, bigger
> each time. Sacred, overwhelming, unstoppable — a Domain Expansion where the
> attack cannot miss. Everything at once, still clear.

---

## Coverage check

| Stage | Genre |
|---|---|
| Training Bridge | Hybrid orchestral rock |
| Quiet Hall | Jazz noir |
| Flooded Gate | Ambient dub + taiko |
| Shibuya Night | UK drill |
| Curse Maw | Industrial horror metal |
| Garden Steps | Folk-orchestral |
| Lantern Corridor | Matsuri percussion + EDM |
| Sunken Crossing | Liquid drum and bass |
| Neon Split | Synthwave / electro |
| Bone Sanctum | Dark choral orchestral |
| Bridge Duel | Minimalist traditional |
| Academy Hall | Boom-bap hip hop |
| Mist Pier | Ambient post-rock |
| Crosswalk Rush | Big beat breakbeat |
| Cursed Teeth | Riddim bass + erhu |
| River Gate | Mournful orchestral + duduk |
| School Wing | Jazz fusion |
| Empty City | Ambient techno |
| Billboard Roof | Instrumental metalcore |
| Domain Core | Hybrid orchestral finale |
