/* =============================================================================
 * Bantar Builder — application controller
 * Reads the form, runs the engine, renders fret table + fretboard + assembly
 * guide, and drives the live tuner.
 * ========================================================================== */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const state = {
  enabledNoteIds: [...DEFAULT_FRET_SET],
  build: [],
  fretboard: null,
  tuner: null,
  tonicCents: 0,        // open-string note that acts as modal tonic (cents class)
};

/* ---------- form helpers ---------- */
function num(id, fallback) {
  const v = parseFloat($('#' + id).value);
  return isFinite(v) ? v : fallback;
}

function readParams() {
  const geom = {
    nutWidth: num('nutWidth', 30),
    joinWidth: num('joinWidth', 42),
    nutThickness: num('nutThickness', 18),
    joinThickness: num('joinThickness', 24),
  };
  return {
    scaleLength: num('scaleLength', 660),
    octaves: parseInt($('#octaves').value, 10) || 2,
    maxFrets: num('maxFrets', 0) || 0,
    enabledNoteIds: state.enabledNoteIds,
    geom,
    wrapMode: $('#wrapMode').value,
    knotAllowance: num('knotAllowance', NYLGUT_TENOR.knot_allowance_mm),
    gauges: NYLGUT_TENOR.gauges_mm,
  };
}

/* ---------- tuning / strings ---------- */
function currentStrings() {
  const presetId = $('#tuningPreset').value;
  const preset = PRESET_BY_ID[presetId];
  return preset.strings_cfg.map(s => ({
    role: ROLE_BY_ID[s.role],
    pitch: s.pitch,
    freq: noteNameToFreq(s.pitch),
  }));
}

function renderStrings() {
  const strings = currentStrings();
  const wrap = $('#stringsTable tbody');
  wrap.innerHTML = '';
  strings.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><strong>${s.role.en}</strong><br><span class="fa">${s.role.fa}</span></td>
      <td>${s.pitch}</td>
      <td>${s.freq ? s.freq.toFixed(1) + ' Hz' : '—'}</td>
      <td class="muted">${s.role.note}</td>`;
    wrap.appendChild(tr);
  });
  // populate tonic selector from open strings
  const sel = $('#tonicString');
  sel.innerHTML = '';
  strings.forEach((s, i) => {
    const note = freqToNoteName(s.freq);
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `String ${i + 1} — ${s.role.en} (${s.pitch})`;
    sel.appendChild(opt);
  });
}

/* ---------- fret note-set chips ---------- */
function renderNoteChips() {
  const wrap = $('#noteChips');
  wrap.innerHTML = '';
  NOTES.filter(n => n.id !== 'do' || true).forEach(n => {
    if (n.cents === 0) return; // open string, always present implicitly
    const on = state.enabledNoteIds.includes(n.id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip ' + n.kind + (on ? ' on' : '');
    chip.textContent = `${n.solfege} (${n.en})`;
    chip.onclick = () => {
      if (state.enabledNoteIds.includes(n.id))
        state.enabledNoteIds = state.enabledNoteIds.filter(x => x !== n.id);
      else
        state.enabledNoteIds.push(n.id);
      renderNoteChips();
      recompute();
    };
    wrap.appendChild(chip);
  });
}

/* Apply a dastgah's required degrees to the enabled fret set (relative to the
 * chosen tonic), so "select a mode" actually changes which frets you tie. */
function applyDastgahToFrets() {
  const d = DASTGAH_BY_ID[$('#dastgah').value];
  if (!d || $('#autoFrets').checked === false) return;
  const tonic = state.tonicCents;
  const needed = new Set();
  d.degrees.forEach(deg => {
    const c = (deg + tonic) % 1200;
    // find the closest note id to this cents value
    let best = null, bestd = 1e9;
    NOTES.forEach(n => {
      const dd = Math.abs(n.cents - c);
      if (dd < bestd) { bestd = dd; best = n; }
    });
    if (best && best.cents !== 0) needed.add(best.id);
  });
  // union with existing core diatonic so the neck stays playable
  const merged = new Set([...DEFAULT_FRET_SET, ...needed]);
  state.enabledNoteIds = [...merged];
  renderNoteChips();
}

/* ---------- fret table ---------- */
function renderTable(build) {
  const tb = $('#fretTable tbody');
  tb.innerHTML = '';
  build.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'kind-' + r.kind;
    tr.innerHTML = `
      <td>${r.index}</td>
      <td><strong>${r.solfege}</strong> · ${r.en}<br><span class="fa">${r.fa}</span></td>
      <td>${r.distanceFromNut.toFixed(2)}</td>
      <td>${r.spacing.toFixed(2)}</td>
      <td>${r.neckWidth.toFixed(1)}×${r.neckThickness.toFixed(1)}</td>
      <td><strong>${r.wraps}</strong></td>
      <td>${r.cutLength.toFixed(0)}</td>
      <td>${r.gauge ? r.gauge.toFixed(2) : '—'}</td>`;
    tb.appendChild(tr);
  });
  const tot = totalNylgut(build);
  $('#nylgutTotal').textContent =
    `${build.length} frets · total Nylgut to cut: ${tot.mm.toFixed(0)} mm (${tot.m.toFixed(2)} m)`;
}

/* ---------- assembly guide ---------- */
function renderAssembly(build, params) {
  const steps = [];
  const sl = params.scaleLength;
  const octaveFret = build.find(r => Math.abs(r.octaveCents) < 1 && r.octave === 1)
                  || build.find(r => r.cents === 1200);
  const fifth = build.find(r => r.octaveCents === 700);
  const fourth = build.find(r => r.octaveCents === 500);

  steps.push(`Cut your Nylgut tie stock to the lengths in the fret table (the “Cut” column already includes a ${params.knotAllowance} mm allowance for the knot tails). Label each piece with its fret number — they are not interchangeable once the neck tapers.`);
  steps.push(`Work the reference frets first, not in number order. Tie and slide these into place and tune them precisely before filling in the rest, because everything else is checked against them:`);
  const refs = [];
  if (octaveFret) refs.push(`Octave fret #${octaveFret.index} at ${octaveFret.distanceFromNut.toFixed(1)} mm (exactly half the speaking length — it is your truth-check for the whole neck).`);
  if (fifth)  refs.push(`Fifth (sol) fret #${fifth.index} at ${fifth.distanceFromNut.toFixed(1)} mm.`);
  if (fourth) refs.push(`Fourth (fa) fret #${fourth.index} at ${fourth.distanceFromNut.toFixed(1)} mm.`);
  steps.push({ list: refs.length ? refs : ['(Enable diatonic frets to get reference points.)'] });

  steps.push(`Tie direction: pass the gut around the neck from the treble (white-string) side, bring both tails to the BASS side, and finish the knot there. Keeping every knot on the bass edge means the knots never sit under the melody string and your right hand never catches them. The wrap pips in the diagram are drawn on that bass edge for the same reason.`);
  steps.push(`Wrap count = how many full turns around the neck before knotting. This app assigns ${params.wrapMode === 'auto' ? 'more turns to the structural diatonic frets and the low frets (taller, firmer), fewer to the neutral/koron and chromatic frets' : params.wrapMode + ' wraps to every fret'}. A taller fret (more wraps / thicker gauge) gives clearance but pulls the note slightly sharp when you press — that is why you tune AFTER tying, by sliding.`);
  steps.push(`Slide-to-tune: each tied fret can move a millimetre or two. Fret the string at the fret, compare to the integrated tuner, and slide the gut toward the nut to lower the pitch or toward the bridge to raise it. The tuner’s on-neck marker shows where the note currently lands versus where the fret sits.`);
  steps.push(`Fill in the remaining frets from the octave downward toward the nut, checking each new fret against the open string and the octave as you go. Low frets are tightest — seat them snug so they do not creep under string tension.`);
  steps.push(`Once all frets read in tune, put on light string tension overnight, then re-check. Nylgut relaxes; a second tuning pass the next day is normal and expected. A tiny drop of thin shellac or hide glue on each finished knot (not the playing surface) locks it without making it permanent.`);

  const ol = $('#assemblySteps');
  ol.innerHTML = '';
  steps.forEach(s => {
    if (typeof s === 'string') {
      const li = document.createElement('li');
      li.innerHTML = s;
      ol.appendChild(li);
    } else if (s.list) {
      const li = document.createElement('li');
      const ul = document.createElement('ul');
      s.list.forEach(x => { const u = document.createElement('li'); u.textContent = x; ul.appendChild(u); });
      li.appendChild(ul);
      ol.appendChild(li);
    }
  });
}

/* ---------- dastgah info ---------- */
function renderDastgahInfo() {
  const d = DASTGAH_BY_ID[$('#dastgah').value];
  $('#dastgahInfo').innerHTML = d
    ? `<strong>${d.name}</strong> <span class="fa">${d.fa}</span> <em>(${d.family})</em> — ${d.note}`
    : '';
}

/* ---------- master recompute ---------- */
function recompute() {
  // Frets are drawn as intervals above the melody (first) string's open pitch.
  // The modal tonic may sit on any open string, so express it as an interval
  // ABOVE that melody open, folded into one octave. tonic == melody → 0.
  const strings = currentStrings();
  const melodyFreq = strings[0].freq;
  state.openFreq = melodyFreq;
  const ti = parseInt($('#tonicString').value, 10) || 0;
  const tstr = strings[ti] || strings[0];
  let off = 1200 * Math.log2(tstr.freq / melodyFreq);
  off = ((off % 1200) + 1200) % 1200;
  state.tonicCents = Math.round(off);
  state.tonicFreq = tstr.freq;

  if ($('#autoFrets').checked) applyDastgahToFrets();

  const params = readParams();
  state.params = params;
  const build = computeBuild(params);
  state.build = build;

  const d = DASTGAH_BY_ID[$('#dastgah').value];
  const degreeSet = $('#highlightMode').checked ? dastgahDegreeSet(d, state.tonicCents) : new Set();

  renderTable(build);
  renderAssembly(build, params);
  renderDastgahInfo();

  if (!state.fretboard) state.fretboard = new Fretboard($('#fretboardSvg'));
  state.fretboard.render(build, {
    scaleLength: params.scaleLength,
    degreeSet,
    geom: params.geom,
    strings,
  });
}

/* ---------- tuner ---------- */
function setupTuner() {
  const readout = $('#tunerReadout');
  const needle = $('#tunerNeedle');
  const btn = $('#tunerToggle');

  const onPitch = (freq) => {
    if (!freq) {
      readout.textContent = '— listening —';
      needle.style.transform = 'translateX(0)';
      if (state.fretboard) state.fretboard.showTunerMarker(null);
      return;
    }
    const nn = freqToNoteName(freq);
    // nearest target string
    const strings = currentStrings();
    let best = null, bestCents = 1e9;
    strings.forEach((s, i) => {
      const c = 1200 * Math.log2(freq / s.freq);
      // fold into +-600 of each octave to find nearest pitch class match to a string
      const folded = c - 1200 * Math.round(c / 1200);
      if (Math.abs(folded) < Math.abs(bestCents)) { bestCents = folded; best = { i, s, c }; }
    });

    const dev = nn.cents; // cents off nearest 12-TET note
    const dir = dev > 4 ? 'lower (♭) — loosen / tune down'
              : dev < -4 ? 'raise (♯) — tighten / tune up'
              : 'in tune ✓';
    readout.innerHTML =
      `<span class="big">${freq.toFixed(1)} Hz</span> → nearest <strong>${nn.name}</strong> ` +
      `<span class="${Math.abs(dev)<=5?'good':'off'}">(${dev>0?'+':''}${dev}¢)</span><br>` +
      `<span class="muted">${dir}</span>`;
    const clamp = Math.max(-50, Math.min(50, dev));
    needle.style.transform = `translateX(${clamp * 1.6}px)`;
    needle.style.background = Math.abs(dev) <= 5 ? '#3ddc97' : (dev > 0 ? '#e76f51' : '#4cc9f0');

    // on-neck overlay: where does this pitch land above the melody open string?
    // (the drawn frets are intervals above that open, so this aligns the marker)
    if (state.fretboard && state.openFreq) {
      let centsAboveOpen = 1200 * Math.log2(freq / state.openFreq);
      while (centsAboveOpen < 0) centsAboveOpen += 1200;
      const label = `${nn.name} ${dev>0?'+':''}${dev}¢`;
      state.fretboard.showTunerMarker(centsAboveOpen, label, dev);
    }
  };

  state.tuner = new Tuner(onPitch, (e) => {
    readout.textContent = 'Mic unavailable: ' + (e.message || e.name || e);
  });

  btn.onclick = async () => {
    if (state.tuner.running) {
      state.tuner.stop();
      btn.textContent = '🎤 Start tuner';
      btn.classList.remove('live');
      readout.textContent = 'Tuner stopped.';
      if (state.fretboard) state.fretboard.showTunerMarker(null);
    } else {
      btn.textContent = '■ Stop tuner';
      btn.classList.add('live');
      readout.textContent = 'Requesting microphone…';
      await state.tuner.start();
    }
  };
}

/* ---------- presets / dastgah list population ---------- */
function populateSelects() {
  const tp = $('#tuningPreset');
  TUNING_PRESETS.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.label; tp.appendChild(o);
  });
  const dg = $('#dastgah');
  DASTGAHS.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = `${d.name} (${d.fa})` + (d.family === 'avaz' ? ' · āvāz' : '');
    dg.appendChild(o);
  });
}

/* ---------- export ---------- */
function exportCSV() {
  const rows = [['#','note(solfege)','western','persian','dist_from_nut_mm','spacing_mm','neck_w_mm','neck_t_mm','wraps','cut_len_mm','gauge_mm']];
  state.build.forEach(r => rows.push([
    r.index, r.solfege, r.en, r.fa, r.distanceFromNut.toFixed(2), r.spacing.toFixed(2),
    r.neckWidth.toFixed(1), r.neckThickness.toFixed(1), r.wraps, r.cutLength.toFixed(0),
    r.gauge ? r.gauge.toFixed(2) : '',
  ]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bantar-fret-chart.csv';
  a.click();
}

/* ---------- init ---------- */
function init() {
  populateSelects();
  renderNoteChips();
  renderStrings();
  setupTuner();

  // wire inputs
  $$('.recompute').forEach(elm => {
    elm.addEventListener('input', recompute);
    elm.addEventListener('change', recompute);
  });
  $('#tuningPreset').addEventListener('change', () => { renderStrings(); recompute(); });
  $('#tonicString').addEventListener('change', recompute);
  $('#dastgah').addEventListener('change', recompute);
  $('#exportCsv').addEventListener('click', exportCSV);
  $('#printBtn').addEventListener('click', () => window.print());

  recompute();
}

document.addEventListener('DOMContentLoaded', init);
