/* =============================================================================
 * Bantar Builder — chromatic tuner
 * Mic -> autocorrelation pitch detection. Reports frequency + nearest note.
 * No external libraries; works in any modern browser over https or localhost.
 * ========================================================================== */

class Tuner {
  constructor(onPitch, onError) {
    this.onPitch = onPitch;       // (freqHz | null) => void
    this.onError = onError || (() => {});
    this.audioCtx = null;
    this.analyser = null;
    this.stream = null;
    this.raf = null;
    this.buf = new Float32Array(2048);
    this.running = false;
  }

  async start() {
    if (this.running) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      src.connect(this.analyser);
      this.running = true;
      this._loop();
    } catch (e) {
      this.onError(e);
    }
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.audioCtx) this.audioCtx.close();
    this.stream = this.audioCtx = this.analyser = null;
  }

  _loop() {
    if (!this.running) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const freq = this._autoCorrelate(this.buf, this.audioCtx.sampleRate);
    this.onPitch(freq > 0 ? freq : null);
    this.raf = requestAnimationFrame(() => this._loop());
  }

  /* Normalized autocorrelation (ACF2+). Returns Hz or -1 if too quiet/noisy. */
  _autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;                 // not enough signal

    let r1 = 0, r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }
    const b = buf.slice(r1, r2);
    const N = b.length;
    const c = new Array(N).fill(0);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N - i; j++)
        c[i] += b[j] * b[j + i];

    let d = 0;
    while (d < N - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < N; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    let T0 = maxpos;
    if (T0 <= 0) return -1;

    // parabolic interpolation around the peak for sub-sample accuracy
    const x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
    const a = (x1 + x3 - 2 * x2) / 2;
    const bb = (x3 - x1) / 2;
    if (a) T0 = T0 - bb / (2 * a);

    const f = sampleRate / T0;
    if (f < 50 || f > 1500) return -1;          // plausible instrument range
    return f;
  }
}
