# Audio Requests — open requests

**Nothing is outstanding for the 23 fighters who can be played.** The element
and signature round — the last one open — is delivered, wired in and recorded in
[audio-requests-history.md](audio-requests-history.md) as Round 9, along with
every earlier round's audit, prompts and delivery record.

**Four sounds come due when round 15's art lands**, and not before — see
[Owed by the staged fighters](#owed-by-the-staged-fighters) at the bottom. They
are listed rather than requested because nothing plays them today: the four
fighters they belong to are not on the select screen.

This file exists so there is somewhere obvious for the next request to go, and
so "is any audio still owed?" has a one-line answer rather than an 800-line
document to read.

**Voice is the one thing that could still be asked for** — all 23 fighters have
grunt trios and KO cries, but nobody has per-character technique call-outs. That
is a separate, much larger round (23 fighters × lines) and should be scoped on
its own rather than tacked onto a sound-effect pass.

## Where the game actually is

| | |
|---|---|
| Sound files | **96** referenced, in `assets/sfx/` |
| Registry keys | **84** in `SFX` (`src/config_audio.js`) |
| With a generation prompt on file | **95 of 96** — `sound_shield.mp3` predates the rounds and has none |
| Fighters with a voice | **23 of 23** — six voice groups, three grunt variants each, plus a matching KO cry |
| Domain Expansions with their own sting | **7 of 7** |
| Element hit layers | **7 of 7** — fire, blood, steel, wind, sound, shadow, soul |
| Generic sounds left in `stage_fx.js` | **none** — all 26 calls name a specific hazard sound |

Categories and their mix levels: `combat` (22), `energy` (14), `voice` (12),
`domain` (10), `hazard` (10), `ui` (7), `stinger` (5), `movement` (4).

The things the original audit was written to fix are all fixed: one explosion no
longer covers every impact, no fighter is mute, the countdown / match end /
meter-full / respawn / Black Flash / 7:3-crit moments all sound, and the menus
no longer borrow swordfight clips. Round 9 closed the last of it: a fire hit no
longer sounds the same as a steel one, and the techniques whose whole identity
is a sound — Todo's clap, Gakuganji's chord, Mei Mei's crow — make it.

## Music

[music-requests.md](music-requests.md) specifies one battle theme per stage.
**All 20 are delivered** and present in `assets/music/boards/`, matching
`BOARD_TRACKS` in `src/config_music.js` exactly — no track listed without a file,
no file without a listing. The menu theme and the two mode tracks are in
`assets/music/`. That document carries no status line of its own, which is worth
knowing before reading it as an open request.

### Leftovers worth knowing about

- **14 unreferenced files** sit in `assets/sfx/` — `sound_punch.mp3`,
  `sound_whoosh.mp3`, `sound_sword_hit*.mp3` and friends. They are the original
  15-file palette the round replaced, and nothing in `src/` names them any more.
  Left in place rather than deleted: they cost ~0.7 MB, they are never fetched
  (the loader only requests registry entries), and they are the only copies of
  the pre-round sound of the game.
- **`sound_shield.mp3`** is the one survivor of that set still in use, which is
  why it has no prompt. If it is ever re-rolled it needs one written first.
- **The Round 9 files are stereo**, where every earlier file is mono. They play
  the same and cost about 4 KB each extra; `tools/generate_sfx.py` writes mono,
  so re-rolling any of them converts it.

## Adding a sound

1. Write the request into
   [audio-requests-history.md](audio-requests-history.md), in the shape the
   entries there already use — **`filename.wav`** · what it is · length, then a
   fenced prompt. That file is not only a record: `tools/generate_sfx.py`
   parses it, so a prompt written anywhere else cannot be generated or re-rolled.
2. Generate it:
   ```sh
   ELEVENLABS_API_KEY=... python3 tools/generate_sfx.py
   ```
   Idempotent — it skips files that already exist unless `--force`. Output is
   trimmed, length-capped, peak-normalised to -3 dBFS and encoded to mono MP3.
   A sound that loops in game also goes in `LOOPING` there, or it comes back
   trimmed and faded.
3. Register the key in `src/config_audio.js` with its category, and call it with
   `playSfx("key")` — or, for a held sound, `startLoop` in `src/audio.js`.

If a whole new round is ever commissioned, write it here as an open request and
move it across once it lands — the same relationship
[asset-requests.md](asset-requests.md) has with its history file. Delivered
files are uploaded to `assets/intake/sfx/` and moved into `assets/sfx/` as part
of that landing, the way art arrives through `assets/intake/`.

---

## Owed by the staged fighters

Round 15 of [asset-requests.md](asset-requests.md) adds four fighters —
Mechamaru, Yuki Tsukumo, Dagon and Kurourushi — whose kits are already built but
who are held off the select screen until their art exists. Their audio is wired
as far as it can be without new files: all four are in `GRUNT_GROUPS`
(`src/audio.js`) and so already have a grunt trio and a KO cry from the existing
six voice groups.

Four sounds are genuinely new, and **none of them can be heard today** — nothing
in a match reaches a staged fighter. They are recorded here so the tallies above
do not quietly become wrong, and so this is a delivery rather than a discovery
on the day those four ship.

| Key | Where it belongs | What it is |
|---|---|---|
| `hitWater` | `ELEMENT_HIT_SFX.water` | The eighth element hit layer, for Dagon. A heavy wet slap and displacement — a body hit by a mass of water, not a splash in a puddle |
| `hitMachine` | `ELEMENT_HIT_SFX.machine` | The ninth, for Mechamaru. Steel on steel with a servo whine under it and a short vent of pressure after |
| `hitSwarm` | `ELEMENT_HIT_SFX.swarm` | The tenth, for Kurourushi. A dry chitinous crunch and a scatter of skittering — insects, close and many |
| `domainCaptivatingSkandha` | `DOMAIN_STING` (`src/domains.js`) | The eighth domain sting, for Horizon of the Captivating Skandha. Surf and gulls opening into something enormous moving underwater — the domain's whole trick is that it sounds like a holiday |

The three element layers are the same brief as Round 9's seven (see the history
file for those prompts and their mix levels): **seasoning under the impact, not
the impact** — short, dry, and gain-trimmed to about 0.5.

`DOMAIN_STING` already names the Skandha key, and `ELEMENT_HIT_SFX` deliberately
does **not** name the three hit layers yet: an entry pointing at a file that is
not there logs a failed fetch on every hit, which reads as an error and trips
the smoke tests. Adding the three lines is part of landing the files, not part
of staging the fighters.
