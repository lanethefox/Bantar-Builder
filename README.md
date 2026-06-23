# Bantar Builder

A browser tool for converting a **fretless banjo** (4- or 5-string) into an
**Americanized tār / setār** — and specifically for the hardest part of that
build: laying out and tying the gut frets.

It takes the full physical spec of your banjo (scale length, neck taper,
materials, bridge/nut, string count and tuning) and produces a **to-scale fret
diagram**, a **cut-and-wrap chart for tied Aquila Nylgut frets**, a generated
**assembly guide**, and a built-in **chromatic tuner** that rides the fret
diagram so you can slide each tied fret to pitch.

No build step, no dependencies, nothing leaves your browser. Open
`index.html` or serve the folder.

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

> The microphone tuner needs a *secure context*: `localhost` works as-is; a
> remote host needs `https`.

---

## What it does

**1 · Instrument parameters.** Scale length, nut/join width and thickness
(frets wrap the whole neck, so thickness matters as much as width),
materials, and your Nylgut knot allowance. Banjo string count maps onto
Persian string roles via tuning presets.

**2 · Fret diagram.** A to-scale neck with every tied fret drawn at its true
distance from the nut, color-coded by type (diatonic / koron / sori /
chromatic), labelled in solfège, Western, and Persian script. Pick a
**dastgāh or āvāz** and the frets that mode needs light up — and, optionally,
get auto-added to your fret set. Wrap pips on the bass edge show how many
times the gut goes around the neck.

**3 · Chromatic tuner.** Microphone pitch detection (autocorrelation). Shows
frequency, nearest note, cents deviation, and a plain-language adjustment
("raise / tighten" vs "lower / loosen"). A marker also rides the fret diagram
at the heard pitch so you can see where a note currently lands versus where its
fret sits, and slide the tie accordingly.

**4 · Fret cut & wrap chart.** Per fret: distance from nut, spacing from the
previous fret, neck cross-section there, wrap count, the exact Nylgut **cut
length** (perimeter × wraps + knot allowance), and a suggested gauge from your
tenor stock (thicker low, thinner high). Plus the total length to cut. Export
to CSV or print a shop sheet.

**5 · Assembly order & directions.** A generated, parameter-aware procedure:
which reference frets to tie first (octave / fifth / fourth), knot direction
and why, the slide-to-tune method, fill-in order, and the overnight
re-tune that Nylgut always needs.

---

## Persian conventions used

- **String names** by role/color: *sefid* (white/melody), *zard* (yellow),
  *bam* (bass), *vākhān* (drone), *zang* (high drone — the banjo 5th string
  maps here perfectly).
- **Note names** in solfège (*do, re, mi…*), Western, and Persian script, with
  the neutral accidentals **koron** (≈ ¼-tone flat) and **sori** (≈ ¼-tone
  sharp).
- **All 12 dastgāh / āvāz**: Māhur, Shur, Homāyun, Segāh, Chahārgāh, Navā,
  Rāst-Panjgāh, and the five āvāz (Abu‘atā, Bayāt-e Tork, Afshāri, Dashti,
  Bayāt-e Esfahān).
- **Wraps around the neck per note**, **assembly order/direction**, and
  **per-fret tie lengths** as described above.

---

## A note on accuracy (please read)

Persian art music is **not** 12-tone equal temperament, and the exact size of
the neutral (koron/sori) intervals varies by region, master, and dastgāh.
This tool deliberately uses a **practical, "Americanized" compromise**: a
12-TET skeleton so the instrument sits comfortably with Western instruments,
**plus** the principal Persian neutral tones placed at sensible neutral-interval
cents.

Likewise, the dastgāh "scales" highlighted here are **skeleton scales** — "the
frets you need tied to play in this mode" — not a full account of the modal
system, which is built from melodic figures (gushe), not fixed scales.

**Everything is meant to be adjusted.** The interval cents live in
`js/data.js`; toggle individual frets with the chips; override the wrap
convention in the form. Treat the defaults as a sane starting point, then trust
your ear and the tuner.

---

## Math

Fret positions use the generalized rule of 18:

```
distance_from_nut = scale_length × (1 − 2^(−cents / 1200))
```

Tie length per fret uses Ramanujan's ellipse-perimeter approximation of the
neck cross-section (semi-axes = ½ width, ½ thickness), times the wrap count,
plus the knot allowance.

## Project layout

```
index.html        UI shell
css/styles.css    styling (+ print stylesheet for the shop sheet)
js/data.js        Persian music + materials data (edit me)
js/calc.js        fret math, neck geometry, cut lengths (pure functions)
js/tuner.js       Web Audio autocorrelation pitch detection
js/fretboard.js   SVG fret diagram + live tuner overlay
js/app.js         controller wiring it together
```