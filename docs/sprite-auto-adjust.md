# Can the placement pass be automated?

Every intake round lands art at numbers the pipeline derives, and then somebody
opens the workbench and moves them. That pass is the most expensive thing about
a delivery, so the question is whether any of it is mechanical.

This is the measurement behind the answer. It reads the `edited` map that
`apply_sprite_adjustments.py` writes — which stores each hand-tuned field's
**pre-edit** value — so for every correction ever made we have both what the
pipeline derived and what a human chose instead. That is a labelled dataset of
1,605 corrections across 767 poses, and it can be asked directly: *is the
derived value wrong in a predictable way?*

The answer differs per field, and the useful split is not "automatable / not"
but **"is the pipeline's rule wrong, or is it just imprecise?"** A wrong rule
can be replaced. An imprecise one cannot be sharpened by guessing harder.

| Field | Edits | Direction | Verdict |
|---|---|---|---|
| `bodyBottom` | 513 | **100% the same way** | **Fix the rule.** The default is wrong by construction |
| `renderScale` | 699 | split by state | **Fix 10 states, never the other 15** — and the split is self-detecting |
| `ox` | 218 | 61% right, 39% left | **Fix the derivation.** Better default, not a confident correction |
| `rotationDeg` | 118 | all from nothing | Not automatable — no signal |
| `faceLeft` | 44 | all off→on | Detectable in principle, unreliable in practice |

---

## `bodyBottom` — the pipeline's rule is wrong, not imprecise

**Every single one of 513 corrections moved the foot line the same way.** Not
95%. All of them. A field that is only ever adjusted in one direction is not
being tuned, it is being *corrected*, and the thing doing it wrong is findable.

It is one line in `extract_sprites.generated_frame_meta`:

```python
"oy": int(body_bottom - by1),      # by1 = bottom of the alpha bounding box
```

Since `footLocal = bodyBottom - oy`, that pins the foot line to `by1` — **the
lowest drawn pixel** — and it cannot produce anything else. Measured across the
513, the derived foot line sits at 0.9996 of the body's height (sd 0.004); the
value a human chose sits at **0.946** (sd 0.035), every time above the bottom of
the art.

That is not an error, it is anatomy. A foot drawn in perspective shows the top
of the shoe with the sole running away from the camera, so the pixel-bottom of
the art is the toe and the figure actually *stands* somewhat higher. The
pipeline has no notion of this; a person looking at the sprite has.

It is stable enough to use. Per-character medians run 0.925–0.961 (sd 0.010)
across all 23 fighters — no character is an outlier, and the fraction does not
drift by round.

### What each rule would cost, at the size the game draws

Fighters render about 230 px tall, so image-pixel error is scaled by
`renderScale` (~0.25) to get what a player sees:

| Rule | On-screen error, median | 90th percentile |
|---|---|---|
| foot line = bottom of the art (**today**) | **15.8 px** | 27.1 px |
| foot line = 0.946 × body height | 4.1 px | 12.4 px |
| foot line = that character's own median fraction | 3.3 px | 11.3 px |

15.8 px of error on a 230 px fighter is about 7% of body height — feet visibly
sunk into the floor, which is what the hand pass is fixing.

**Recommendation: change the derived default from 1.0 to 0.946.** This is not
an auto-*fix* step, it is a better starting point, and it is close to free —
one constant, no new measurement, no detection. It cannot make things worse on
average because the current rule is wrong in 100% of reviewed cases. It removes
about three quarters of the correction and leaves the rest to the eye, where a
12 px tail still belongs.

### What does not work

Smarter measurement of the foot does **not** beat the flat fraction:

| Predictor | On-screen error, median |
|---|---|
| lowest row ≥ 25% of the body's max width | 4.9 px |
| lowest row ≥ 20% of max width | 6.9 px |
| flat 0.946 fraction | **4.1 px** |

Scanning for "where the body gets wide enough to be a foot" is the obvious idea
and it loses to a constant. Even fitting a separate fraction per pose — which
is in-sample and therefore flattering — only reaches 3.4 px. The remaining
error is per-drawing perspective, and nothing in the alpha channel knows about
it.

---

## `renderScale` — two populations, and they separate cleanly

Overall the corrections look like noise: median ratio 0.98, 48% of them
upward. That is an artefact of mixing states. Split by animation state, the
roster falls into two groups with nothing in between.

**Ten states were sized by a rule.** Their height-to-idle ratio is identical
across all 17 size-reviewed fighters — coefficient of variation ≤ 0.1%:

| State | Ratio to idle | Spread |
|---|---|---|
| `idle`, `win` | 1.000 | 0.0% |
| `hurt` | 0.805 | 0.0% |
| `fall` | 0.941 | 0.0% |
| `dizzy` | 0.977 | 0.0% |
| `upHeavy` | 1.211 | 0.0% |
| `shield`, `charge` | 0.879 | 0.1% |
| `jump` | 0.902 | 0.1% |
| `ledge` | 1.150 | 0.1% |

**Fifteen states were judged per character.** Spread 8–18%: `light` 8.3%,
`land` 10.6%, `ult` 10.6%, `airLight` 11.6%, `sideHeavy` 12.8%, `specialDown`
13.0%, `crouch` 13.0%, `dash` 13.1%, `downHeavy` 13.1%, `dodge_air` 13.4%,
`specialNeutral` 13.6%, `dodge`/`dodge_roll` 13.7%, `specialSide` 16.7%,
`crouchAttack` 18.4%.

A leave-one-character-out test — predict a fighter's hand-set `bodyH` from the
*other* reviewed fighters only — shows what that costs:

- rule states: **0.0% error.** The value is recoverable exactly.
- judged states: 8–13% median error. `crouchAttack` and `dodge_air` are the
  worst.

An 11% size error is the same magnitude as the corrections being applied, so
auto-applying there would be moving sprites at random.

**Recommendation: automate the ten rule states and refuse the other fifteen.**
The important part is that *the tool can tell them apart by itself* — compute
the spread of each state's ratio across the reviewed roster and act only where
it is near zero. Nothing needs hardcoding, and a state that stops being uniform
stops being auto-fixed on its own.

`tools/audit_frame_sizes.py` already learns these ratios and is the right home
for it. What it does not do is distinguish the two populations: it applies one
tolerance everywhere, so it will offer to "fix" a `crouchAttack` whose spread
means there is no right answer to fix it to. That is why its 81 outstanding
findings cannot be applied wholesale.

---

## `ox` — a better derivation, not a correction

The pipeline centres the **content bounding box**:

```python
ox = SHEET_W / COLS / 2 - center_x     # center_x = (bx0 + bx1) / 2
```

A bounding box includes Maki's naginata, Gakuganji's guitar neck and every
effect trail, so a fighter holding something wide is pushed off centre by it.
The corrections track the **alpha-weighted centroid** instead — mass, not
extent — which is what a person reads as "the middle of the character".

| Predictor | Error, median | 90th pct | Within 10 px |
|---|---|---|---|
| content-box centre (**today**) | 76.7 px | 156 px | 5% |
| alpha-weighted centroid | **20.6 px** | 83 px | 26% |
| largest-component box centre | 68.5 px | 151 px | 8% |

Better by 73%, and free: **`centroidX` is already computed and stored in the
manifest** for every frame.

It is the weakest of the three and it is worth being precise about why it is
still applied. The corrections go both ways (134 right, 84 left), so unlike the
foot line — where every correction points one way and being too timid still
lands closer — a wrong move here goes the wrong direction. At 26% within 10 px,
most frames will still want the hand pass.

What settles it is that **there is no do-nothing option.** Every imported frame
must be given some `ox`, and the choice is between two estimators of the same
quantity, one of which is measurably four times worse. Declining to act does not
leave the frame untouched; it leaves it on the bounding-box centre.

So it runs, but as a *derivation* rather than a correction: it only ever
replaces a number the pipeline itself produced, never one a person chose, and it
is separately switchable (`--rules foot size`) if it ever stops earning its
place.

---

## `rotationDeg` and `faceLeft` — no

**`rotationDeg`**: all 118 edits set a value where there was none. Median 4°,
range −14° to +16°, 22% negative. There is no derived value being corrected, so
there is no error to detect — the tilt is a judgement about how a pose reads in
motion. Nothing in the file predicts it.

**`faceLeft`**: all 44 edits turn it on, never off. Facing detection exists
(`detect_facing`) and `docs/asset-pipeline.md` records why it is not trusted:
near-zero confidence on two thirds of round 6. Round 12 agreed — confidences of
0.001 to 0.27 on plates whose facing was obvious to look at. The need is real
and the signal is absent; guessing here silently mirrors a character, which is
the worst failure mode in this list because it looks deliberate.

---

## The tuning phase — `tools/auto_tune.py`

All three are implemented, as step 5 of the intake flow:

| Rule | What it sets | Learned from |
|---|---|---|
| `foot` | `bodyBottom`, so the foot line sits at 0.946 × body height — the character's own median where they have ≥8 measured poses | the 513 hand corrections |
| `size` | `bodyH` and `renderScale` together, on poses whose every animation state is uniform across the reviewed roster | the roster's own ratios |
| `centre` | `ox`, putting the alpha-weighted centroid on the cell's centre line rather than the bounding box | the 218 hand corrections |

```bash
python3 tools/auto_tune.py --report     # what the rules learned
python3 tools/auto_tune.py --backtest   # scored against the hand values
python3 tools/auto_tune.py --dry-run    # what it would do to the last import
python3 tools/auto_tune.py --round 2026-08-09   # a round that came in batches
```

Together they address 1,430 of the 1,605 recorded corrections at their source.
What is left — the per-drawing tail on the foot line, the fifteen judged size
states, rotation and facing — is the part that is actually judgement, and it
stays in the workbench where somebody can see it.

### The three things it must not do

The rules are ordinary statistics; the guarantees are what make them safe to
run unattended, and `tools/test_auto_tune.py` holds each one down.

**It never overwrites a human.** A field named in `edited` was chosen by
somebody looking at the sprite, and no measurement here outranks that. Asked to
tune a pose whose every field is spoken for, it does nothing.

**Tuning is not an edit.** The workbench's *No saved edits (to do)* list, its
character markers and the recently-updated list all read `meta.edited`, and
nothing in the tuner writes there. Provenance goes to `autoTuned`, shown in the
panel as "Auto-placed · not an edit" with the rule that produced each number. A
tuned pose is still a pose nobody has looked at: a rule measured across the
roster cannot say whether *this* drawing looks right, and a step that quietly
took poses off the to-do list would be trading a placement problem for a
tracking one.

**It refuses rules that are not rules.** The uniform/judged split is measured
at run time rather than listed, so a state that stops being uniform stops being
tuned without anyone editing the tool. A pose serving both a uniform and a
judged state is left alone, because there is no single right answer for it. And
a foot line that would move more than 20% of body height is refused with a
reason printed — that is not the rule being wrong, it is the frame not being
what the rule assumes, usually a detached effect owning the largest component.

It is also idempotent: run twice, the second run proposes nothing.

### What it cost on the round it was built for

Applied to the 29 poses of round 12A, it set `bodyBottom` and `ox` on all 29
and `renderScale` on none — every one of those poses serves a judged state, so
the size rule correctly declined all of them. Feet that were floating landed on
the ground line; bodies holding a naginata or a guitar came back over the
centre line.

Scored against the 513 poses with known hand values, leave-one-character-out:

| | Closer to the hand value | Unchanged | Further away |
|---|---|---|---|
| foot line | **91%** | 2% | 7% |

When it lands further away it does so by a median 4.8 px on screen, against the
15.8 px the pipeline was wrong by to begin with — so the downside is bounded
and smaller than the problem.

**None of this removes the tuning pass**, and a step that claimed to would be
the wrong thing to build. It makes the starting point defensible instead of
knowingly wrong, so the pass becomes checking rather than correcting.

### How to check any of this again

Everything above is derived from the manifest and the art, so it can be re-run
after any round to see whether a rule still holds:

- the `edited` map holds pre-edit values, so `edited[field]` vs `meta[field]`
  is a labelled before/after for every correction ever made;
- foot-line fraction is `(bodyBottom − oy) / <bottom of the largest connected
  component>`;
- a size state is "rule-sized" when its `bodyH / idle bodyH` ratio has near-zero
  spread across `DEFAULT_REVIEWED` in `tools/audit_frame_sizes.py`.

A rule that stops holding should stop being applied, and this is how that gets
noticed.
