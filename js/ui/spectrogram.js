// Scrolling spectrogram: time runs right to left, log frequency bottom to top.

import { fitCanvas, themeColors, freqToX, F_MIN, FREQ_TICKS } from './canvas.js';

const PAD = { left: 30, right: 10, top: 10, bottom: 10 };
// Colour range relative to the spectrum's top value.
const RANGE_TOP = -25;
const RANGE_SPAN = 85;

// Dark blue → teal → yellow → near white
const STOPS = [
  [0.0, [10, 14, 26]],
  [0.25, [32, 52, 120]],
  [0.5, [22, 150, 140]],
  [0.75, [235, 196, 70]],
  [1.0, [255, 246, 224]],
];

const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < STOPS.length - 2 && t > STOPS[j + 1][0]) j++;
    const [t0, c0] = STOPS[j];
    const [t1, c1] = STOPS[j + 1];
    const u = (t - t0) / (t1 - t0);
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = c0[k] + (c1[k] - c0[k]) * u;
  }
  return lut;
})();

export class Spectrogram {
  constructor(canvas) {
    this.canvas = canvas;
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d');
    this.rows = null;
    this.key = '';
  }

  clear() {
    this.bctx.fillStyle = `rgb(${LUT[0]},${LUT[1]},${LUT[2]})`;
    this.bctx.fillRect(0, 0, this.buffer.width, this.buffer.height);
  }

  /** Bin range [k0, k1] for every pixel row of the buffer. */
  layout(binCount, sampleRate, plotW, plotH, dpr) {
    const w = Math.max(1, Math.round(plotW * dpr));
    const h = Math.max(1, Math.round(plotH * dpr));
    const key = `${binCount}:${sampleRate}:${w}:${h}`;
    if (key === this.key) return;
    this.key = key;
    this.buffer.width = w;
    this.buffer.height = h;
    this.clear();
    this.column = this.bctx.createImageData(1, h);
    const fMax = Math.min(20000, sampleRate / 2);
    const binWidth = sampleRate / (2 * binCount);
    this.rows = new Int32Array(h * 2);
    for (let r = 0; r < h; r++) {
      // Row r = 0 is the top (highest frequency).
      const fHi = F_MIN * Math.pow(fMax / F_MIN, (h - r) / h);
      const fLo = F_MIN * Math.pow(fMax / F_MIN, (h - r - 1) / h);
      let k0 = Math.round(fLo / binWidth);
      let k1 = Math.round(fHi / binWidth);
      k0 = Math.max(1, Math.min(binCount - 1, k0));
      k1 = Math.max(k0, Math.min(binCount - 1, k1));
      this.rows[r * 2] = k0;
      this.rows[r * 2 + 1] = k1;
    }
  }

  /** Add one time slice. binsSpl: per-bin levels in dB SPL. */
  push(binsSpl, sampleRate, yMax) {
    if (!this.rows) return;
    const { buffer, bctx, column, rows } = this;
    const h = buffer.height;
    bctx.drawImage(buffer, -1, 0);
    const lo = yMax + RANGE_TOP - RANGE_SPAN;
    const data = column.data;
    for (let r = 0; r < h; r++) {
      let v = -Infinity;
      for (let k = rows[r * 2], end = rows[r * 2 + 1]; k <= end; k++) if (binsSpl[k] > v) v = binsSpl[k];
      const idx = Math.max(0, Math.min(255, Math.round(((v - lo) / RANGE_SPAN) * 255))) * 3;
      const o = r * 4;
      data[o] = LUT[idx];
      data[o + 1] = LUT[idx + 1];
      data[o + 2] = LUT[idx + 2];
      data[o + 3] = 255;
    }
    bctx.putImageData(column, buffer.width - 1, 0);
  }

  /**
   * Add a slice (if binsSpl is given) and draw the buffer plus frequency
   * axis. Call once per animation frame while the view is visible.
   */
  render(binsSpl, binCount, sampleRate, yMax) {
    const { ctx, width, height, dpr } = fitCanvas(this.canvas);
    const c = themeColors();
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    if (plotW <= 0 || plotH <= 0) return;
    this.layout(binCount, sampleRate, plotW, plotH, dpr);
    if (binsSpl) this.push(binsSpl, sampleRate, yMax);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer, PAD.left, PAD.top, plotW, plotH);

    const fMax = Math.min(20000, sampleRate / 2);
    ctx.font = c.font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.muted;
    for (const [f, label] of FREQ_TICKS) {
      if (f > fMax) continue;
      // Same log mapping as the x axis of the spectrum, turned vertical.
      const frac = (freqToX(f, 0, 1, fMax));
      const yy = PAD.top + (1 - frac) * plotH;
      ctx.fillText(label, PAD.left - 5, yy);
    }
  }
}
