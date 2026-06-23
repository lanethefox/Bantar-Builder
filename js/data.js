/* =============================================================================
 * Bantar Builder — Persian music + lutherie data layer
 * -----------------------------------------------------------------------------
 * All music-theory constants live here so the rest of the app stays generic.
 *
 * IMPORTANT, READ THIS:
 *   Persian art music does NOT use 12-tone equal temperament, and the exact
 *   cents of the "neutral" intervals (koron / sori) vary by region, master,
 *   and dastgah. The values below are a *practical, internally consistent*
 *   compromise widely used by setar/tar makers who build "Americanized" or
 *   travel instruments: a 12-tone equal-tempered skeleton (so the instrument
 *   plays nicely with Western instruments) PLUS the principal Persian neutral
 *   tones placed at sensible neutral-interval cents. Everything here is meant
 *   to be edited — treat it as a sane default, not gospel.
 * ========================================================================== */

/* ---- Pitch classes (one octave, cents measured from the open string) ------ */
/* koron  (k) = lowered ~quarter tone  — symbol shown as a down-flat          */
/* sori   (s) = raised  ~quarter tone  — symbol shown as a half-sharp         */

const NOTES = [
  { id: 'do',        cents: 0,    en: 'C',            fa: 'دو',            solfege: 'do',        kind: 'natural'  },
  { id: 'do_sori',   cents: 50,   en: 'C sori',       fa: 'دو سری',        solfege: 'do sori',   kind: 'sori'     },
  { id: 'do_sharp',  cents: 100,  en: 'C♯ / D♭',      fa: 'دو دیز',        solfege: 'do diez',   kind: 'chromatic'},
  { id: 're_koron',  cents: 150,  en: 'D koron',      fa: 'ر کرن',         solfege: 're koron',  kind: 'koron'    },
  { id: 're',        cents: 200,  en: 'D',            fa: 'ر',             solfege: 're',        kind: 'natural'  },
  { id: 're_sharp',  cents: 300,  en: 'D♯ / E♭',      fa: 'ر دیز',         solfege: 're diez',   kind: 'chromatic'},
  { id: 'mi_koron',  cents: 350,  en: 'E koron',      fa: 'می کرن',        solfege: 'mi koron',  kind: 'koron'    },
  { id: 'mi',        cents: 400,  en: 'E',            fa: 'می',            solfege: 'mi',        kind: 'natural'  },
  { id: 'fa',        cents: 500,  en: 'F',            fa: 'فا',            solfege: 'fa',        kind: 'natural'  },
  { id: 'fa_sori',   cents: 550,  en: 'F sori',       fa: 'فا سری',        solfege: 'fa sori',   kind: 'sori'     },
  { id: 'fa_sharp',  cents: 600,  en: 'F♯ / G♭',      fa: 'فا دیز',        solfege: 'fa diez',   kind: 'chromatic'},
  { id: 'sol_koron', cents: 650,  en: 'G koron',      fa: 'سل کرن',        solfege: 'sol koron', kind: 'koron'    },
  { id: 'sol',       cents: 700,  en: 'G',            fa: 'سل',            solfege: 'sol',       kind: 'natural'  },
  { id: 'sol_sharp', cents: 800,  en: 'G♯ / A♭',      fa: 'سل دیز',        solfege: 'sol diez',  kind: 'chromatic'},
  { id: 'la_koron',  cents: 850,  en: 'A koron',      fa: 'لا کرن',        solfege: 'la koron',  kind: 'koron'    },
  { id: 'la',        cents: 900,  en: 'A',            fa: 'لا',            solfege: 'la',        kind: 'natural'  },
  { id: 'la_sharp',  cents: 1000, en: 'A♯ / B♭',      fa: 'لا دیز',        solfege: 'la diez',   kind: 'chromatic'},
  { id: 'si_koron',  cents: 1050, en: 'B koron',      fa: 'سی کرن',        solfege: 'si koron',  kind: 'koron'    },
  { id: 'si',        cents: 1100, en: 'B',            fa: 'سی',            solfege: 'si',        kind: 'natural'  },
];

const NOTE_BY_ID = Object.fromEntries(NOTES.map(n => [n.id, n]));

/* The "core" diatonic frets every build starts with. The koron/sori frets are
 * opt-in (per dastgah, or manually) because not every neck has room for ~17
 * frets per octave and many players add neutral frets only where a dastgah
 * actually needs them. */
const DEFAULT_FRET_SET = ['do','re','mi','fa','sol','la','si'];

/* ---- The 12 traditional modal systems ------------------------------------ *
 * Degrees are cents from the modal tonic (finger placement, ascending). These
 * are *representative* skeleton scales used to highlight which frets a given
 * dastgah needs — Persian modes are melody-type families (gushe), not fixed
 * scales, so treat these as "the frets you must have tied to play in this
 * dastgah," not a complete theory of the mode. */
const DASTGAHS = [
  { id: 'mahur',      name: 'Māhur',          fa: 'ماهور',          family: 'dastgah', degrees: [0,200,400,500,700,900,1100], note: 'Brightest, closest to a Western major scale — the natural "Americanized" starting point.' },
  { id: 'shur',       name: 'Shur',           fa: 'شور',            family: 'dastgah', degrees: [0,150,300,500,700,800,1000], note: 'The most central Persian mode. Koron 2nd degree is its signature.' },
  { id: 'homayun',    name: 'Homāyun',        fa: 'همایون',         family: 'dastgah', degrees: [0,150,400,500,700,800,1100], note: 'Solemn / majestic. Koron 2nd with a major 3rd gives the augmented step.' },
  { id: 'segah',      name: 'Segāh',          fa: 'سه‌گاه',          family: 'dastgah', degrees: [0,150,350,500,700,850,1050], note: 'Built on a koron degree; neutral 3rd is its identity. Very "in-between" sounding.' },
  { id: 'chahargah',  name: 'Chahārgāh',      fa: 'چهارگاه',        family: 'dastgah', degrees: [0,150,400,500,700,850,1100], note: 'Dramatic, heroic. Two koron degrees framing major 3rd / major 7th.' },
  { id: 'nava',       name: 'Navā',           fa: 'نوا',            family: 'dastgah', degrees: [0,200,300,500,700,800,1000], note: 'Calm, balanced relative of Shur, starting a 4th higher in feel.' },
  { id: 'rastpanjgah',name: 'Rāst-Panjgāh',   fa: 'راست‌پنجگاه',     family: 'dastgah', degrees: [0,200,350,500,700,900,1050], note: 'Grand and wide-ranging; neutral 3rd and 7th over a major frame.' },
  /* The five āvāz (satellite modes) */
  { id: 'abuata',     name: 'Abu‘atā',        fa: 'ابوعطا',         family: 'avaz',    degrees: [0,150,300,500,700,800,1000], note: 'Āvāz of Shur. Emphasizes the 4th as a resting tone.' },
  { id: 'bayatetork', name: 'Bayāt-e Tork',   fa: 'بیات ترک',       family: 'avaz',    degrees: [0,200,350,500,700,800,1000], note: 'Āvāz of Shur. Folk-bright; popular and accessible.' },
  { id: 'afshari',    name: 'Afshāri',        fa: 'افشاری',         family: 'avaz',    degrees: [0,200,300,500,700,850,1000], note: 'Āvāz of Shur. Plaintive, with a koron 6th high point.' },
  { id: 'dashti',     name: 'Dashti',         fa: 'دشتی',           family: 'avaz',    degrees: [0,200,300,500,700,850,1000], note: 'Āvāz of Shur. Pastoral, longing; the koron 6th is the emotional peak.' },
  { id: 'esfahan',    name: 'Bayāt-e Esfahān',fa: 'بیات اصفهان',    family: 'avaz',    degrees: [0,200,300,500,700,800,1100], note: 'Āvāz of Homāyun. The closest Persian mode to a Western minor.' },
];

const DASTGAH_BY_ID = Object.fromEntries(DASTGAHS.map(d => [d.id, d]));

/* ---- Persian string names ------------------------------------------------- *
 * Strings on tar/setar are named by color/role, not pitch. We provide the
 * canonical names so the converted banjo's strings read the Persian way. */
const STRING_ROLES = [
  { id: 'sefid', en: 'White (melody)',        fa: 'سیم سفید',    note: 'Highest course; carries the melody. Plucked most.' },
  { id: 'zard',  en: 'Yellow (second)',       fa: 'سیم زرد',     note: 'A 4th/5th below white; doubles and answers the melody.' },
  { id: 'bam',   en: 'Bam (bass)',            fa: 'سیم بم',      note: 'The low drone/octave reference.' },
  { id: 'vakh',  en: 'Vākhān (sympathetic/drone)', fa: 'سیم واخوان', note: 'Drone string, often tuned to the tonic. (Tar calls its high octave pair zang-e shotor / "camel bell.")' },
  { id: 'zang',  en: 'Zang (high drone)',     fa: 'زنگ',         note: 'High octave drone — the banjo 5th string maps here perfectly.' },
];
const ROLE_BY_ID = Object.fromEntries(STRING_ROLES.map(r => [r.id, r]));

/* ---- Tuning presets ------------------------------------------------------- *
 * scientific pitch names; 'course' lets a banjo string be single or paired.
 * These map a 4- or 5-string banjo onto Persian roles. "Americanized" presets
 * keep the Persian layout but choose pitches that sit comfortably with guitar
 * / mandolin friends. */
const TUNING_PRESETS = [
  {
    id: 'setar4', label: 'Setar-style (4-string)', strings: 4,
    desc: 'Classic setar layout: do / sol / do / do (the 4th is the added bass-drone).',
    strings_cfg: [
      { role: 'sefid', pitch: 'C4' },
      { role: 'zard',  pitch: 'G3' },
      { role: 'bam',   pitch: 'C3' },
      { role: 'vakh',  pitch: 'C2' },
    ],
  },
  {
    id: 'setar4_amer', label: 'Setar-style · Americanized (4-string)', strings: 4,
    desc: 'Same roles, pitched to G so it sits in a guitar/old-time jam (G / D / G / G).',
    strings_cfg: [
      { role: 'sefid', pitch: 'G3' },
      { role: 'zard',  pitch: 'D3' },
      { role: 'bam',   pitch: 'G2' },
      { role: 'vakh',  pitch: 'G2' },
    ],
  },
  {
    id: 'tar5', label: 'Tar-flavored (5-string)', strings: 5,
    desc: 'Tar courses mapped to 5 banjo strings: white, yellow, bam, plus a zang high-drone (banjo 5th).',
    strings_cfg: [
      { role: 'sefid', pitch: 'C4' },
      { role: 'zard',  pitch: 'G3' },
      { role: 'bam',   pitch: 'C3' },
      { role: 'vakh',  pitch: 'C2' },
      { role: 'zang',  pitch: 'C4' },
    ],
  },
  {
    id: 'banjo5_amer', label: 'Persian-tuned 5-string · Americanized', strings: 5,
    desc: 'Drone-forward, like a clawhammer banjo reimagined as a setar (G / D / G / G + high G drone).',
    strings_cfg: [
      { role: 'sefid', pitch: 'G3' },
      { role: 'zard',  pitch: 'D3' },
      { role: 'bam',   pitch: 'G2' },
      { role: 'vakh',  pitch: 'D3' },
      { role: 'zang',  pitch: 'G4' },
    ],
  },
];
const PRESET_BY_ID = Object.fromEntries(TUNING_PRESETS.map(p => [p.id, p]));

/* ---- Material reference (informational chips in the UI) ------------------- */
const MATERIALS = {
  neck:   ['Maple', 'Walnut', 'Mahogany', 'Mulberry (traditional)', 'Cherry'],
  head:   ['Calfskin (traditional)', 'Goatskin', 'Fish skin (traditional setar soundboard analog)', 'Mylar/Synthetic', 'Remo Renaissance'],
  bridge: ['Floating wood (banjo-style)', 'Bone-topped wood', 'Traditional tar khar (deer-antler/bone)'],
  nut:    ['Bone', 'Brass', 'Ebony', 'Camel bone (traditional)'],
};

/* ---- Aquila Nylgut "tenor" reference (the fret-tie stock the user uses) ---- *
 * Nylgut tied frets: gauge affects fret height and feel. Tenor banjo Nylgut
 * sets run roughly these diameters. We use this only to suggest a knot
 * allowance and to sanity-check wrap thickness. */
const NYLGUT_TENOR = {
  label: 'Aquila Nylgut — tenor banjo gauge stock (used here as fret-tie material)',
  gauges_mm: [0.66, 0.80, 0.92, 1.02],   // typical tenor set, thin→thick
  knot_allowance_mm: 45,                  // extra length per fret for the tie/knot tails
  note: 'Thicker stock → taller fret → more clearance but more intonation pull. Use thicker gauge for the low frets, thinner for the high frets.',
};
