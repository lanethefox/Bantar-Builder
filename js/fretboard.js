/* =============================================================================
 * Bantar Builder — SVG fretboard visualizer
 * Draws a to-scale neck (nut at top, body at bottom) with every tied fret,
 * Persian note labels, dastgah highlighting, and a live tuner overlay marker.
 * ========================================================================== */

const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, children) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in (attrs || {})) n.setAttribute(k, attrs[k]);
  for (const c of (children || [])) n.appendChild(c);
  return n;
}

const KIND_COLOR = {
  natural:   '#e9c46a',  // gold — structural diatonic frets
  koron:     '#2a9d8f',  // teal — neutral (lowered)
  sori:      '#e76f51',  // coral — neutral (raised)
  chromatic: '#8d99ae',  // grey — Western chromatic infill
};

class Fretboard {
  constructor(svg) {
    this.svg = svg;
  }

  render(build, opts) {
    const o = opts || {};
    const scaleLength = o.scaleLength || 660;
    const degreeSet = o.degreeSet || new Set();
    const geom = o.geom;
    const strings = o.strings || [];

    const PAD_TOP = 60, PAD_BOTTOM = 40, PAD_X = 90;
    const NECK_LEN = 720;                      // px the neck occupies vertically
    const pxPerMm = NECK_LEN / scaleLength;

    const maxFret = build.length ? build[build.length - 1].distanceFromNut : scaleLength;
    const usableMm = Math.max(maxFret * 1.05, 1);
    const neckPx = usableMm * pxPerMm;

    const nutW = (geom ? geom.nutWidth : 30);
    const joinW = (geom ? geom.joinWidth : 45);
    const wScale = 2.6;                         // px per mm of neck width (visual)
    const topW = nutW * wScale, botW = joinW * wScale;
    const cx = PAD_X + Math.max(topW, botW) / 2;

    const W = cx * 2;
    const H = PAD_TOP + neckPx + PAD_BOTTOM;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.setAttribute('width', '100%');
    this.svg.innerHTML = '';

    const widthAt = mm => topW + (botW - topW) * (mm / usableMm);

    // --- neck body (tapered) ---
    const yNut = PAD_TOP, yEnd = PAD_TOP + neckPx;
    const halfTop = topW / 2, halfBot = botW / 2;
    this.svg.appendChild(el('polygon', {
      points: `${cx-halfTop},${yNut} ${cx+halfTop},${yNut} ${cx+halfBot},${yEnd} ${cx-halfBot},${yEnd}`,
      fill: '#1c1f26', stroke: '#3a3f4b', 'stroke-width': 2, rx: 6,
    }));

    // --- nut ---
    this.svg.appendChild(el('rect', {
      x: cx - halfTop, y: yNut - 8, width: topW, height: 8, rx: 2, fill: '#d9c8a0',
    }));
    this.svg.appendChild(el('text', {
      x: cx, y: yNut - 16, 'text-anchor': 'middle', fill: '#9aa0ac', 'font-size': 12,
    }, [document.createTextNode('NUT (open string)')]));

    // --- strings (vertical lines, melody on the right per Persian playing view) ---
    const nStr = strings.length || 4;
    for (let s = 0; s < nStr; s++) {
      const frac = nStr === 1 ? 0.5 : s / (nStr - 1);
      const xTop = cx - halfTop + (0.18 + 0.64 * frac) * topW;
      const xEnd = cx - halfBot + (0.18 + 0.64 * frac) * botW;
      this.svg.appendChild(el('line', {
        x1: xTop, y1: yNut, x2: xEnd, y2: yEnd,
        stroke: '#5a6072', 'stroke-width': 1 + s * 0.4, opacity: 0.7,
      }));
    }

    // --- frets ---
    build.forEach(row => {
      const y = yNut + row.distanceFromNut * pxPerMm;
      const hw = widthAt(row.distanceFromNut) / 2;
      const inMode = degreeSet.size === 0 || degreeSet.has(row.octaveCents);
      const color = KIND_COLOR[row.kind] || '#8d99ae';

      const g = el('g', { class: 'fret', opacity: inMode ? 1 : 0.28 });

      // the tied fret bar
      g.appendChild(el('line', {
        x1: cx - hw, y1: y, x2: cx + hw, y2: y,
        stroke: color, 'stroke-width': inMode ? 3 + row.wraps : 2,
        'stroke-linecap': 'round',
      }));
      // wrap pips on the bass edge (how many times around)
      for (let w = 0; w < row.wraps; w++) {
        g.appendChild(el('circle', {
          cx: cx - hw - 6 - w * 6, cy: y, r: 2.4, fill: color,
        }));
      }
      // index number (left gutter)
      g.appendChild(el('text', {
        x: cx - hw - 14 - row.wraps * 6, y: y + 4, 'text-anchor': 'end',
        fill: '#6b7280', 'font-size': 11,
      }, [document.createTextNode(String(row.index))]));
      // note label (right gutter) — solfège + western
      const label = el('text', {
        x: cx + hw + 10, y: y + 4, 'text-anchor': 'start',
        fill: inMode ? '#e6e6e6' : '#6b7280', 'font-size': 12,
        'font-weight': row.kind === 'natural' ? 700 : 400,
      });
      label.appendChild(document.createTextNode(`${row.solfege} · ${row.en}`));
      g.appendChild(label);
      // persian script
      g.appendChild(el('text', {
        x: cx + hw + 10, y: y + 18, 'text-anchor': 'start',
        fill: '#7d8694', 'font-size': 11, direction: 'rtl',
      }, [document.createTextNode(row.fa)]));

      this.svg.appendChild(g);
    });

    this._overlay = { cx, yNut, pxPerMm, scaleLength, W, H };
    return this._overlay;
  }

  /* Live tuner overlay: draw a moving marker at the neck position that matches
   * the heard pitch relative to the active open string, plus an adjustment hint.
   * heardCentsFromOpen may be null to clear. */
  showTunerMarker(heardCentsFromOpen, label, sharpness) {
    // remove old
    const old = this.svg.querySelector('#tuner-overlay');
    if (old) old.remove();
    if (heardCentsFromOpen == null || !this._overlay) return;

    const { cx, yNut, scaleLength, pxPerMm, W } = this._overlay;
    const dist = fretDistanceFromNut(scaleLength, Math.max(0, heardCentsFromOpen));
    const y = yNut + dist * pxPerMm;
    const g = el('g', { id: 'tuner-overlay' });

    const col = Math.abs(sharpness) <= 5 ? '#3ddc97'
              : sharpness > 0 ? '#e76f51' : '#4cc9f0';
    g.appendChild(el('line', {
      x1: 8, y1: y, x2: W - 8, y2: y, stroke: col, 'stroke-width': 2,
      'stroke-dasharray': '6 4', opacity: 0.9,
    }));
    g.appendChild(el('polygon', {
      points: `8,${y-6} 20,${y} 8,${y+6}`, fill: col,
    }));
    const t = el('text', {
      x: 24, y: y - 8, fill: col, 'font-size': 12, 'font-weight': 700,
    });
    t.appendChild(document.createTextNode(label || ''));
    g.appendChild(t);
    this.svg.appendChild(g);
  }
}
