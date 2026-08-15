# Audio — pruned takes

**38 takes, delivered and then deleted on purpose.** They were auditioned in
the [audio workbench](../workbench/?edit=audio) and thrown out by ear, which is
the one test no tool in this repo can run.

## Why this file exists at all

The prompts that made these files are still in
[audio-requests.md](audio-requests.md) and
[audio-requests-history.md](audio-requests-history.md), verbatim, because a
prompt is the record of how a file was made and this repo keeps those even for
work that did not land.

That record and the deletion fight each other. Both generators are idempotent
by *does the file exist* — so a deleted take looks exactly like an undelivered
one, and the next `generate_sfx.py` run would faithfully recreate all 33 of
them. An evening of listening would be undone by a command that did nothing
wrong.

**So this list is the third state: delivered, judged, and gone deliberately.**
`tools/generate_sfx.py` and `tools/generate_voice.py` both read it and skip
every filename in it, including under `--force` — that flag is for re-rolling a
take you are keeping, not for reversing a verdict. Putting a name back in play
means deleting its line here, which is one edit and an obvious one.

Format matters, because the tools parse it: a pruned entry is a list item whose
first thing is the `.wav` filename in backticks. Anything after it is a note for
people.

## What the deletions say

Read as a group they are not 33 separate opinions, they are about four:

- **The round-8 effects-endpoint takes lost everywhere a human is involved.**
  Every `grunt_*_1/2/3` and every original `ko_*` for a human group is here.
  That endpoint has no voice; it produces its impression of one.
- **...and won everywhere one is not.** `grunt_animal_2` and `ko_animal`
  survived while every voice-cast animal alternate was deleted. A model
  imitating a beast beats an actor playing one.
- **The kiai round was a mistake in the brief, not in the delivery.** せいっ,
  どりゃっ and ぬんっ are shouts a person chooses, so a voice model articulates
  them, so they came out as words. Round 13 replaced the whole vocabulary with
  non-lexical vocalisations and its takes are the ones still standing.
- **Nagi did not survive as an adult male** — his entire casting is gone except
  two takes that were *moved* to `gruntFemale` rather than deleted, which is a
  judgement no amount of generating could have produced.

## The list

### gruntYoungMale / koYoungMale

- `grunt_young_male_alt_3.wav` — kiai (せいっ) — a word, articulated as speech
- `grunt_young_male_alt_5.wav`
- `grunt_young_male_1.wav`
- `grunt_young_male_2.wav`
- `grunt_young_male_3.wav`
- `ko_young_male.wav`
- `ko_young_male_alt_1.wav`
- `ko_young_male_alt_3.wav`

### gruntAdultMale / koAdultMale

- `grunt_adult_male_alt_1.wav` — silent — `audit_voice_takes.py` found no signal in it at all
- `grunt_adult_male_1.wav`
- `grunt_adult_male_2.wav`
- `grunt_adult_male_3.wav`
- `ko_adult_male.wav`

### gruntBig / koBig

- `grunt_big_1.wav`
- `grunt_big_2.wav`
- `grunt_big_3.wav`
- `grunt_big_alt_2.wav` — kiai (どりゃっ) — a word
- `grunt_big_alt_3.wav` — kiai (ぐぬっ)
- `grunt_big_alt_5.wav`
- `ko_big.wav`

### gruntFemale / koFemale

- `grunt_female_1.wav`
- `grunt_female_2.wav`
- `grunt_female_3.wav`
- `ko_female.wav`

### gruntMonster / koMonster

- `grunt_monster_1.wav`
- `grunt_monster_2.wav`
- `grunt_monster_3.wav`
- `ko_monster.wav`

### gruntAnimal / koAnimal

- `grunt_animal_1.wav`
- `grunt_animal_3.wav`
- `ko_animal_alt_1.wav`
- `ko_animal_alt_2.wav`
- `ko_animal_alt_3.wav`

### Round 14's own casualties — pruned in the pass after it

Five of the 24 takes round 14 delivered did not survive their first audition,
which is the round working rather than failing: two per group was always going
to be one or two too many, and the ones that stayed are the point.

- `grunt_young_male_alt_7.wav`
- `grunt_big_alt_7.wav`
- `ko_young_male_alt_4.wav`
- `ko_young_male_alt_5.wav`
- `ko_animal.wav` — the round-8 original, beaten outright by `ko_animal_alt_5`
  and deleted rather than kept as an alternate. The last effects-endpoint KO
  cry in the game

**`koYoungMale` now has one file and no alternates at all** — the whole group
came down to `ko_young_male_alt_2`. That is the narrowest any voice has been
since the banks were built, and it is the clearest possible brief for what to
generate next.
