// FFT spectrum (log frequency axis) and third-octave bar chart.

import { fitCanvas, themeColors, freqToX, F_MIN, FREQ_TICKS } from './canvas.js';
import { THIRD_OCTAVE_BANDS } from '../dsp/bands.js';
import { weightingDb } from '../dsp/weighting.js';

const PAD = { left: 30, right: 10, top: 10, bottom: 22 };
export const SPECTRUM_RANGE = 120;

const curveCache = new Map();

/** Weighting in dB for every FFT bin, cached per configuration. */
export function weightingCurve(type, binCount, sampleRate) {
  const key = `${type}:${binCount}:${sampleRate}`;
  let curve = curveCache.get(key);
  if (!curve) {
    curve = new Float32Array(binCount);
    const binWidth = sampleRate / (2 * binCount);
    for (let k = 1; k < binCount; k++) curve[k] = weightingDb(type, k * binWidth);
    curve[0] = -Infinity;
    curveCache.set(key, curve);
  }
  return curve;
}

function drawFrame(ctx, c, width, height, yMax, drawXAxis) {
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const lo = yMax - SPECTRUM_RANGE;
  const y = (db) => PAD.top + (1 - (db - lo) / SPECTRUM_RANGE) * plotH;
  ctx.clearRect(0, 0, width, height);
  ctx.font = c.font;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let db = lo; db <= yMax; db += 20) {
    const yy = Math.round(y(db)) + 0.5;
    ctx.strokeStyle = c.grid;
    ctx.beginPath();
    ctx.moveTo(PAD.left, yy);
    ctx.lineTo(PAD.left + plotW, yy);
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.fillText(String(db), PAD.left - 5, yy);
  }
  drawXAxis(plotW, plotH);
  return { plotW, plotH, y, lo };
}

export class SpectrumView {
  constructor(canvas) {
    this.canvas = canvas;
    this.peak = null;
    this.bandPeak = null;
  }

  resetPeak() {
    this.peak = null;
    this.bandPeak = null;
  }

  /** binsSpl: per-bin levels in dB SPL (weighting already applied). */
  drawFft(binsSpl, sampleRate, { yMax, peakHold }) {
    const { ctx, width, height } = fitCanvas(this.canvas);
    const c = themeColors();
    const fMax = Math.min(20000, sampleRate / 2);
    const { plotW, plotH, y, lo } = drawFrame(ctx, c, width, height, yMax, (pw, ph) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const [f, label] of FREQ_TICKS) {
        if (f > fMax) continue;
        const xx = Math.round(freqToX(f, PAD.left, pw, fMax)) + 0.5;
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(xx, PAD.top);
        ctx.lineTo(xx, PAD.top + ph);
        ctx.stroke();
        ctx.fillStyle = c.muted;
        ctx.fillText(label, Math.min(xx, PAD.left + pw - 8), PAD.top + ph + 6);
      }
    });
    if (!binsSpl) return;

    // Strongest bin per pixel column; sparse low-frequency columns are interpolated.
    const cols = Math.max(1, Math.floor(plotW));
    const colDb = new Float32Array(cols).fill(-Infinity);
    const binWidth = sampleRate / (2 * binsSpl.length);
    const span = Math.log(fMax / F_MIN);
    for (let k = 1; k < binsSpl.length; k++) {
      const f = k * binWidth;
      if (f < F_MIN) continue;
      if (f > fMax) break;
      const col = Math.min(cols - 1, Math.floor((Math.log(f / F_MIN) / span) * cols));
      if (binsSpl[k] > colDb[col]) colDb[col] = binsSpl[k];
    }
    let prev = -1;
    for (let i = 0; i < cols; i++) {
      if (colDb[i] === -Infinity) continue;
      if (prev >= 0 && i - prev > 1) {
        for (let j = prev + 1; j < i; j++) {
          colDb[j] = colDb[prev] + ((colDb[i] - colDb[prev]) * (j - prev)) / (i - prev);
        }
      }
      prev = i;
    }

    if (peakHold) {
      if (!this.peak || this.peak.length !== cols) this.peak = new Float32Array(cols).fill(-Infinity);
      for (let i = 0; i < cols; i++) if (colDb[i] > this.peak[i]) this.peak[i] = colDb[i];
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, plotW, plotH);
    ctx.clip();
    const line = new Path2D();
    let started = false;
    for (let i = 0; i < cols; i++) {
      if (!Number.isFinite(colDb[i])) continue;
      const xx = PAD.left + i + 0.5;
      const yy = y(Math.max(lo - 1, colDb[i]));
      if (started) line.lineTo(xx, yy); else { line.moveTo(xx, yy); started = true; }
    }
    if (started) {
      const fill = new Path2D(line);
      fill.lineTo(PAD.left + plotW, PAD.top + plotH);
      fill.lineTo(PAD.left, PAD.top + plotH);
      fill.closePath();
      ctx.fillStyle = c.accentFill;
      ctx.fill(fill);
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 1.25;
      ctx.stroke(line);
    }
    if (peakHold && this.peak) {
      const pk = new Path2D();
      let s = false;
      for (let i = 0; i < cols; i++) {
        if (!Number.isFinite(this.peak[i])) continue;
        const xx = PAD.left + i + 0.5;
        const yy = y(Math.max(lo - 1, this.peak[i]));
        if (s) pk.lineTo(xx, yy); else { pk.moveTo(xx, yy); s = true; }
      }
      ctx.strokeStyle = c.warn;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.85;
      ctx.stroke(pk);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** bandsSpl: third-octave band levels in dB SPL. */
  drawBands(bandsSpl, { yMax, peakHold }) {
    const { ctx, width, height } = fitCanvas(this.canvas);
    const c = themeColors();
    const count = THIRD_OCTAVE_BANDS.length;
    const { plotW, plotH, y, lo } = drawFrame(ctx, c, width, height, yMax, (pw, ph) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = c.muted;
      for (let i = 0; i < count; i += 3) {
        const xx = PAD.left + (i + 0.5) * (pw / count);
        ctx.fillText(THIRD_OCTAVE_BANDS[i].label, xx, PAD.top + ph + 6);
      }
    });
    if (!bandsSpl) return;

    if (peakHold) {
      if (!this.bandPeak) this.bandPeak = new Float32Array(count).fill(-Infinity);
      for (let i = 0; i < count; i++) if (bandsSpl[i] > this.bandPeak[i]) this.bandPeak[i] = bandsSpl[i];
    }

    const slot = plotW / count;
    const barW = Math.max(2, slot * 0.72);
    for (let i = 0; i < count; i++) {
      const v = bandsSpl[i];
      const xx = PAD.left + i * slot + (slot - barW) / 2;
      if (Number.isFinite(v) && v > lo) {
        const top = y(Math.min(v, yMax));
        ctx.fillStyle = c.accent;
        ctx.fillRect(xx, top, barW, PAD.top + plotH - top);
      }
      if (peakHold && this.bandPeak && Number.isFinite(this.bandPeak[i]) && this.bandPeak[i] > lo) {
        ctx.fillStyle = c.warn;
        ctx.fillRect(xx, Math.round(y(Math.min(this.bandPeak[i], yMax))) - 1, barW, 2);
      }
    }
  }
}
