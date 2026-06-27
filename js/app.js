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
  unit: 'mm',           // display/entry unit for all lengths
};

/* ---------- measurement units ----------
 * Everything is computed internally in millimetres; units only affect display
 * and form entry. 1 in = 25.4 mm. */
const UNITS = {
  mm: { label: 'mm', perMm: 1,        dp: 1, cutDp: 0 },
  in: { label: 'in', perMm: 1 / 25.4, dp: 3, cutDp: 2 },
};
const LENGTH_FIELDS = ['scaleLength','nutWidth','joinWidth','nutThickness','joinThickness','knotAllowance'];
function U() { return UNITS[state.unit]; }
function mmToDisp(mm, dp) { const u = U(); return (mm * u.perMm).toFixed(dp == null ? u.dp : dp); }
function dispToMm(v) { return v / U().perMm; }
function uLabel() { return U().label; }

/* ---------- form helpers ---------- */
function num(id, fallback) {
  const v = parseFloat($('#' + id).value);
  return isFinite(v) ? v : fallback;
}
/* a length field's value, converted from the current display unit to mm */
function lenMm(id, fallbackMm) {
  const v = parseFloat($('#' + id).value);
  return isFinite(v) ? dispToMm(v) : fallbackMm;
}

function readParams() {
  const geom = {
    nutWidth: lenMm('nutWidth', 30),
    joinWidth: lenMm('joinWidth', 42),
    nutThickness: lenMm('nutThickness', 18),
    joinThickness: lenMm('joinThickness', 24),
  };
  return {
    scaleLength: lenMm('scaleLength', 660),
    octaves: parseInt($('#octaves').value, 10) || 2,
    maxFrets: num('maxFrets', 0) || 0,
    existingMetalFrets: parseInt($('#existingMetalFrets').value, 10) || 0,
    enabledNoteIds: state.enabledNoteIds,
    geom,
    wrapMode: $('#wrapMode').value,
    knotAllowance: lenMm('knotAllowance', NYLGUT_TENOR.knot_allowance_mm),
    gauges: NYLGUT_TENOR.gauges_mm,
  };
}

/* Switch units: convert the numbers currently shown in the length fields so the
 * physical value is preserved, refresh column labels, then recompute. */
function changeUnit(newUnit) {
  if (newUnit === state.unit || !UNITS[newUnit]) return;
  LENGTH_FIELDS.forEach(id => {
    const elm = $('#' + id);
    const cur = parseFloat(elm.value);
    if (!isFinite(cur)) return;
    const mm = cur / UNITS[state.unit].perMm;          // old unit -> mm
    elm.value = (mm * UNITS[newUnit].perMm).toFixed(UNITS[newUnit].dp);
  });
  state.unit = newUnit;
  updateUnitLabels();
  recompute();
}

/* Update the unit suffix shown in table headers and field hints. */
function updateUnitLabels() {
  $$('.unit-label').forEach(s => s.textContent = uLabel());
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
    tr.className = 'kind-' + r.kind + (r.fretType === 'metal' ? ' is-metal' : '');
    const typeCell = r.fretType === 'metal'
      ? '<span class="tag metal">metal ✓</span>'
      : '<span class="tag tie">tie</span>';
    tr.innerHTML = `
      <td>${r.index}</td>
      <td><strong>${r.solfege}</strong> · ${r.en}<br><span class="fa">${r.fa}</span></td>
      <td>${typeCell}</td>
      <td>${mmToDisp(r.distanceFromNut)}</td>
      <td>${mmToDisp(r.spacing)}</td>
      <td>${mmToDisp(r.neckWidth)}×${mmToDisp(r.neckThickness)}</td>
      <td>${r.fretType === 'metal' ? '—' : '<strong>' + r.wraps + '</strong>'}</td>
      <td>${r.fretType === 'metal' ? '—' : mmToDisp(r.cutLength, U().cutDp)}</td>
      <td>${r.gauge ? r.gauge.toFixed(2) : '—'}</td>`;
    tb.appendChild(tr);
  });
  const tot = totalNylgut(build);
  const metalNote = tot.metalCount
    ? ` (${tot.metalCount} of these already sit on existing metal frets — no tie needed)`
    : '';
  const totalDisp = state.unit === 'in'
    ? `${mmToDisp(tot.mm, 1)} in (${(tot.mm / 25.4 / 12).toFixed(2)} ft)`
    : `${tot.mm.toFixed(0)} mm (${tot.m.toFixed(2)} m)`;
  $('#nylgutTotal').textContent =
    `${tot.tieCount} string frets to tie${metalNote} · total Nylgut to cut: ${totalDisp}`;
}

/* ---------- assembly guide ---------- */
function renderAssembly(build, params) {
  const steps = [];
  const sl = params.scaleLength;
  const metalCount = params.existingMetalFrets || 0;
  const tieFrets = build.filter(r => r.fretType !== 'metal');
  const octaveFret = build.find(r => Math.abs(r.octaveCents) < 1 && r.octave === 1)
                  || build.find(r => r.cents === 1200);
  const fifth = build.find(r => r.octaveCents === 700);
  const fourth = build.find(r => r.octaveCents === 500);

  if (metalCount > 0) {
    steps.push(`<strong>Hybrid build.</strong> Your banjo keeps its ${metalCount} metal frets — those are already at exact equal-tempered positions and need nothing done to them. You are only adding the <strong>${tieFrets.length} tied Nylgut frets</strong> that fall <em>between</em> the metal ones (the koron/sori neutral tones the metal frets can’t reach). Only the “tie” rows in the chart get cut.`);
    steps.push(`Your metal frets are the reference grid — they are dead-on 12-TET, so you never re-tune them. Tie each new gut fret <em>between</em> its two neighbouring metal frets and tune it by ear/tuner against them. The metal octave fret (#${metalCount >= 12 ? 12 : 'n/a'}) and the metal fifth (#7) are your truth-checks.`);
    steps.push(`Cut only the “tie” pieces to the lengths in the fret table (the “Cut” column already includes a ${mmToDisp(params.knotAllowance, U().cutDp)} ${uLabel()} allowance for the knot tails). Label each piece with its fret number — they are not interchangeable once the neck tapers.`);
    steps.push(`Tie direction: pass the gut around the neck from the treble (white-string) side and finish the knot on the BASS edge, so knots never sit under the melody string. Because a tied fret is taller than a metal fret, set your action with that in mind — the gut fret must clear the metal frets on either side when you fret elsewhere.`);
    steps.push(`Slide-to-tune: each gut fret can move a millimetre or two. Fret the string at the new gut fret, compare to the integrated tuner, and slide toward the nut to lower or toward the bridge to raise. The tuner’s on-neck marker shows where the note currently lands versus where the fret sits, with the silver metal bars drawn for reference.`);
    steps.push(`Wrap count = full turns around the neck before knotting. This app uses ${params.wrapMode === 'auto' ? 'more turns on low frets (taller, firmer) and fewer up high' : params.wrapMode + ' wraps on every tie'}. A taller fret pulls the pressed note slightly sharp — which is exactly why you tune the gut frets AFTER tying, by sliding.`);
    steps.push(`Put light string tension on overnight, then re-check. Nylgut relaxes; a second tuning pass the next day is normal. A drop of thin shellac on each finished knot (never the playing surface) locks it without making removal impossible.`);

    const ol = $('#assemblySteps');
    ol.innerHTML = '';
    steps.forEach(s => { const li = document.createElement('li'); li.innerHTML = s; ol.appendChild(li); });
    return;
  }

  steps.push(`Cut your Nylgut tie stock to the lengths in the fret table (the “Cut” column already includes a ${mmToDisp(params.knotAllowance, U().cutDp)} ${uLabel()} allowance for the knot tails). Label each piece with its fret number — they are not interchangeable once the neck tapers.`);
  steps.push(`Work the reference frets first, not in number order. Tie and slide these into place and tune them precisely before filling in the rest, because everything else is checked against them:`);
  const refs = [];
  if (octaveFret) refs.push(`Octave fret #${octaveFret.index} at ${mmToDisp(octaveFret.distanceFromNut)} ${uLabel()} (exactly half the speaking length — it is your truth-check for the whole neck).`);
  if (fifth)  refs.push(`Fifth (sol) fret #${fifth.index} at ${mmToDisp(fifth.distanceFromNut)} ${uLabel()}.`);
  if (fourth) refs.push(`Fourth (fa) fret #${fourth.index} at ${mmToDisp(fourth.distanceFromNut)} ${uLabel()}.`);
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

/* ---------- fret removal plan (hybrid / setar-spacing on a fretted banjo) ---------- */
function renderRemovalPlan(params) {
  const box = $('#removalPlan');
  const M = params.existingMetalFrets || 0;
  if (!M) { box.style.display = 'none'; return; }
  box.style.display = 'block';

  const cls = classifyMetalFrets(params.enabledNoteIds, M, params.scaleLength);
  const remove = cls.filter(c => c.status === 'remove');
  const keep = cls.filter(c => c.status === 'keep');
  const ties = state.build.filter(r => r.fretType === 'tie');

  const fmt = arr => arr.map(c => c.index).join(', ') || '—';
  box.innerHTML = `
    <h3>Setar-spacing conversion plan for your ${M} metal frets</h3>
    <p class="rm-line"><span class="tag remove">remove ${remove.length}</span>
      metal frets <strong>${fmt(remove)}</strong> — their pitches aren’t in your chosen layout.</p>
    <p class="rm-line"><span class="tag metal">keep ${keep.length}</span>
      metal frets <strong>${fmt(keep)}</strong> — these already land on setar notes.</p>
    <p class="rm-line"><span class="tag tie">add ${ties.length}</span>
      tied Nylgut frets for the neutral koron/sori tones that no metal fret can reach (see chart).</p>
    <p class="hint">Removing frets only yields the equal-tempered notes of the layout; the
      “in-between” Persian tones must be <em>added</em> as ties — pure removal can’t produce them.</p>`;
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
  renderRemovalPlan(params);

  if (!state.fretboard) state.fretboard = new Fretboard($('#fretboardSvg'));
  state.fretboard.render(build, {
    scaleLength: params.scaleLength,
    degreeSet,
    geom: params.geom,
    strings,
    metalFrets: classifyMetalFrets(params.enabledNoteIds, params.existingMetalFrets, params.scaleLength),
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
  const rows = [['#','note(solfege)','western','persian','type','dist_from_nut_mm','spacing_mm','neck_w_mm','neck_t_mm','wraps','cut_len_mm','gauge_mm']];
  state.build.forEach(r => rows.push([
    r.index, r.solfege, r.en, r.fa, r.fretType, r.distanceFromNut.toFixed(2), r.spacing.toFixed(2),
    r.neckWidth.toFixed(1), r.neckThickness.toFixed(1),
    r.fretType === 'metal' ? '' : r.wraps,
    r.fretType === 'metal' ? '' : r.cutLength.toFixed(0),
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
  $('#unit').addEventListener('change', e => changeUnit(e.target.value));

  updateUnitLabels();
  recompute();
}

document.addEventListener('DOMContentLoaded', init);
