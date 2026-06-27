/* =============================================================================
 * Bantar Builder — calculation engine
 * Pure functions, no DOM. Units: millimetres and cents throughout.
 * ========================================================================== */

const A4_HZ = 440;

/* Scientific pitch name -> frequency (Hz). Accepts e.g. "C4", "G#3", "Bb2". */
function noteNameToFreq(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) return null;
  const letters = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semis = letters[m[1].toUpperCase()];
  if (m[2] === '#') semis += 1;
  if (m[2] === 'b') semis -= 1;
  const octave = parseInt(m[3], 10);
  // MIDI: C-1 = 0; A4 = 69
  const midi = semis + (octave + 1) * 12;
  return A4_HZ * Math.pow(2, (midi - 69) / 12);
}

/* Frequency (Hz) -> nearest 12-TET note name + cents deviation. */
function freqToNoteName(freq) {
  if (!freq || freq <= 0) return null;
  const midiFloat = 69 + 12 * Math.log2(freq / A4_HZ);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const name = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { name: name + octave, cents, midi };
}

/* A pitch some number of cents above a base frequency. */
function centsAbove(baseFreq, cents) {
  return baseFreq * Math.pow(2, cents / 1200);
}

/* The core fret formula, generalized from the "rule of 18" to arbitrary cents.
 * distance from nut = L * (1 - 2^(-cents/1200))                              */
function fretDistanceFromNut(scaleLength, cents) {
  return scaleLength * (1 - Math.pow(2, -cents / 1200));
}

/* Build the ordered fret list for a given set of enabled note-ids across N
 * octaves. Returns objects with absolute cents, the source note, octave index,
 * distance from nut, and spacing from the previous fret. */
function buildFrets(enabledNoteIds, octaves, scaleLength, maxFrets) {
  const base = NOTES.filter(n => enabledNoteIds.includes(n.id))
                    .sort((a, b) => a.cents - b.cents);
  const frets = [];
  for (let oct = 0; oct < octaves; oct++) {
    for (const n of base) {
      const cents = n.cents + 1200 * oct;
      if (cents === 0) continue;              // open string is not a fret
      frets.push({ note: n, octave: oct, cents });
    }
  }
  frets.sort((a, b) => a.cents - b.cents);
  const limited = (maxFrets && maxFrets > 0) ? frets.slice(0, maxFrets) : frets;

  let prev = 0;
  return limited.map((f, i) => {
    const dist = fretDistanceFromNut(scaleLength, f.cents);
    const row = {
      index: i + 1,
      noteId: f.note.id,
      cents: f.cents,
      octaveCents: f.cents % 1200,
      octave: f.octave,
      en: f.note.en + (f.octave > 0 ? `′${f.octave > 1 ? f.octave : ''}` : ''),
      fa: f.note.fa,
      solfege: f.note.solfege,
      kind: f.note.kind,
      distanceFromNut: dist,
      spacing: dist - prev,
    };
    prev = dist;
    return row;
  });
}

/* Neck cross-section at a fractional position p (0 = nut, 1 = scale end).
 * Linear taper from nut to neck/body join. Frets are tied all the way around,
 * so we need the full perimeter of an elliptical cross-section. */
function neckDimsAt(p, geom) {
  const width = geom.nutWidth + (geom.joinWidth - geom.nutWidth) * p;
  const thickness = geom.nutThickness + (geom.joinThickness - geom.nutThickness) * p;
  return { width, thickness };
}

/* Ramanujan's ellipse-perimeter approximation. a,b are semi-axes. */
function ellipsePerimeter(width, thickness) {
  const a = width / 2, b = thickness / 2;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/* Wrap-count convention (the Persian "how many times around the neck"):
 *  - diatonic (do re mi fa sol la si) and the octave: 2 wraps (taller, firmer,
 *    these are the structural frets you lean on);
 *  - koron / sori neutral frets and chromatic frets: 1 wrap;
 *  - the lowest two frets get +1 wrap because the gut must stand taller there
 *    to clear the string with a low action.
 * Fully overridable in the UI. */
function defaultWraps(row, totalFrets) {
  let w = (row.kind === 'natural') ? 2 : 1;
  if (row.index <= 2) w += 1;
  return w;
}

/* Length of Nylgut to cut for one fret tie. */
function cutLength(perimeter, wraps, knotAllowance) {
  return perimeter * wraps + knotAllowance;
}

/* Suggest a Nylgut gauge from the stock set based on fret position
 * (thicker low, thinner high). */
function suggestGauge(index, total, gauges) {
  if (!gauges || !gauges.length) return null;
  const frac = (index - 1) / Math.max(1, total - 1); // 0 low .. 1 high
  // invert: low index -> thick (last gauge), high index -> thin (first)
  const gi = Math.round((1 - frac) * (gauges.length - 1));
  return gauges[Math.min(gauges.length - 1, Math.max(0, gi))];
}

/* Existing metal frets on an already-fretted banjo sit at exact 12-TET
 * positions (multiples of 100 cents), numbered 1..count from the nut. */
function metalFretList(count, scaleLength) {
  const out = [];
  for (let k = 1; k <= count; k++) {
    const cents = 100 * k;
    out.push({ index: k, cents, distanceFromNut: fretDistanceFromNut(scaleLength, cents) });
  }
  return out;
}

/* Does a target pitch (cents above open) already land on a metal fret? */
function coincidesWithMetal(cents, metalCount, tol) {
  if (!metalCount) return false;
  const t = tol == null ? 2 : tol;
  const nearest = Math.round(cents / 100) * 100;
  return nearest > 0 && nearest <= 100 * metalCount && Math.abs(cents - nearest) <= t;
}

/* Removal plan: for each existing metal fret, decide whether its pitch is part
 * of the chosen Persian note set ('keep') or should be pulled to replicate
 * setar spacing ('remove'). Neutral koron/sori tones never sit at 12-TET
 * positions, so they can only be ADDED as ties — never produced by removal. */
function classifyMetalFrets(enabledNoteIds, metalCount, scaleLength) {
  const pcOf = c => (((c % 1200) + 1200) % 1200);
  const enabled = NOTES.filter(n => enabledNoteIds.includes(n.id));
  const enabledPC = new Map();          // pitch-class -> note (for labels)
  enabled.forEach(n => enabledPC.set(pcOf(n.cents), n));
  // the open string / tonic (do, pitch-class 0) recurs at every octave fret and
  // is always a scale tone — keep those metal frets.
  if (!enabledPC.has(0)) enabledPC.set(0, NOTE_BY_ID['do']);
  return metalFretList(metalCount, scaleLength).map(mf => {
    const pc = pcOf(mf.cents);
    const note = enabledPC.get(pc) || null;
    return {
      ...mf,
      pc,
      status: note ? 'keep' : 'remove',
      noteSolfege: note ? note.solfege : null,
      noteEn: note ? note.en : null,
    };
  });
}

/* Full build: combine fret geometry + tie lengths + wraps into one table.
 * In hybrid mode (existingMetalFrets > 0), any Persian pitch that already
 * lands on a metal fret is flagged 'metal' (no tie needed); the rest are
 * 'tie' frets you add in Nylgut. */
function computeBuild(params) {
  const {
    scaleLength, enabledNoteIds, octaves, maxFrets,
    geom, wrapMode, knotAllowance, gauges,
  } = params;
  const metalCount = params.existingMetalFrets || 0;

  const frets = buildFrets(enabledNoteIds, octaves, scaleLength, maxFrets);
  const total = frets.length;

  return frets.map(row => {
    const p = row.distanceFromNut / scaleLength;
    const dims = neckDimsAt(p, geom);
    const perim = ellipsePerimeter(dims.width, dims.thickness);
    const onMetal = coincidesWithMetal(row.cents, metalCount);
    const wraps = onMetal ? 0
                : wrapMode === 'single' ? 1
                : wrapMode === 'double' ? 2
                : defaultWraps(row, total);
    const tie = onMetal ? 0 : cutLength(perim, wraps, knotAllowance);
    return {
      ...row,
      fretType: onMetal ? 'metal' : 'tie',
      existing: onMetal,
      neckWidth: dims.width,
      neckThickness: dims.thickness,
      perimeter: perim,
      wraps,
      cutLength: tie,
      gauge: onMetal ? null : suggestGauge(row.index, total, gauges),
    };
  });
}

/* Highlight map: which fret rows belong to the selected dastgah, given which
 * open-string note is acting as the modal tonic. Returns a Set of cents
 * (mod 1200, relative to tonic) that are "in mode". */
function dastgahDegreeSet(dastgah, tonicCents) {
  const set = new Set();
  if (!dastgah) return set;
  for (const deg of dastgah.degrees) {
    set.add((deg + tonicCents) % 1200);
  }
  return set;
}

/* Total Nylgut needed (mm and m) plus tie/metal counts for the summary. */
function totalNylgut(build) {
  const mm = build.reduce((s, r) => s + r.cutLength, 0);
  const tieCount = build.filter(r => r.fretType !== 'metal').length;
  const metalCount = build.filter(r => r.fretType === 'metal').length;
  return { mm, m: mm / 1000, tieCount, metalCount };
}
