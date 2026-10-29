// Time history of the level: line chart with Leq and threshold lines.

import { fitCanvas, themeColors, niceRange } from './canvas.js';
import { fmtDuration, fmtNum } from '../i18n.js';

const PAD = { left: 30, right: 8, top: 10, bottom: 20 };
const ALL_TICKS = [10, 30, 60, 120, 300, 600, 1800, 3600, 7200];

export class HistoryChart {
  constructor(canvas) {
    this.canvas = canvas;
  }

  /**
   * values: dB SPL, oldest first, `step` seconds apart, newest at the right.
   * mode 'recent' labels the x axis relative to now (-60 s … 0), mode 'all'
   * labels elapsed time since the start of the measurement.
   */
  draw({ values, step, span, mode, leq, leqLabel, warn, danger }) {
    const { ctx, width, height } = fitCanvas(this.canvas);
    const c = themeColors();
    ctx.clearRect(0, 0, width, height);
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    if (plotW <= 0 || plotH <= 0) return;

    let min = Infinity, max = -Infinity;
    for (const v of values) {
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (Number.isFinite(leq)) { min = Math.min(min, leq); max = Math.max(max, leq); }
    const [lo, hi] = niceRange(min, max);
    const y = (db) => PAD.top + (1 - (db - lo) / (hi - lo)) * plotH;
    const x = (t) => PAD.left + (t / span) * plotW; // t: seconds from left edge

    ctx.font = c.font;
    ctx.lineWidth = 1;

    // Horizontal grid
    const gridStep = hi - lo > 60 ? 20 : 10;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let db = lo; db <= hi; db += gridStep) {
      const yy = Math.round(y(db)) + 0.5;
      ctx.strokeStyle = c.grid;
      ctx.beginPath();
      ctx.moveTo(PAD.left, yy);
      ctx.lineTo(PAD.left + plotW, yy);
      ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.fillText(String(db), PAD.left - 5, yy);
    }

    // Vertical ticks
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (mode === 'recent') {
      const narrow = plotW < 400;
      const tickStep = span <= 60 ? (narrow ? 20 : 10) : (narrow ? 120 : 60);
      for (let t = 0; t <= span; t += tickStep) {
        const xx = Math.round(x(span - t)) + 0.5;
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(xx, PAD.top);
        ctx.lineTo(xx, PAD.top + plotH);
        ctx.stroke();
        ctx.fillStyle = c.muted;
        const label = t === 0 ? '0' : span <= 60 ? `−${t} s` : `−${t / 60} min`;
        ctx.fillText(label, Math.min(Math.max(xx, PAD.left + 12), PAD.left + plotW - 8), PAD.top + plotH + 5);
      }
    } else {
      const tickStep = ALL_TICKS.find((s) => span / s <= 6) ?? 7200;
      for (let t = 0; t <= span; t += tickStep) {
        const xx = Math.round(x(t)) + 0.5;
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(xx, PAD.top);
        ctx.lineTo(xx, PAD.top + plotH);
        ctx.stroke();
        ctx.fillStyle = c.muted;
        ctx.fillText(fmtDuration(t), Math.min(Math.max(xx, PAD.left + 12), PAD.left + plotW - 14), PAD.top + plotH + 5);
      }
    }

    // Threshold lines
    ctx.setLineDash([4, 4]);
    for (const [level, color] of [[warn, c.warn], [danger, c.bad]]) {
      if (level > lo && level < hi) {
        const yy = Math.round(y(level)) + 0.5;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(PAD.left, yy);
        ctx.lineTo(PAD.left + plotW, yy);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.setLineDash([]);

    // Level line with fill below, starting at the right edge
    const n = values.length;
    const offset = mode === 'recent' ? span - n * step : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, plotW, plotH);
    ctx.clip();
    let open = false, startX = 0, lastX = 0;
    const path = new Path2D();
    const fill = new Path2D();
    const closeFill = () => {
      fill.lineTo(lastX, PAD.top + plotH);
      fill.lineTo(startX, PAD.top + plotH);
      fill.closePath();
    };
    for (let i = 0; i < n; i++) {
      const v = values[i];
      const xx = x(offset + (i + 1) * step);
      if (!Number.isFinite(v)) {
        if (open) closeFill();
        open = false;
        continue;
      }
      const yy = y(Math.max(lo, Math.min(hi, v)));
      if (!open) {
        path.moveTo(xx, yy);
        fill.moveTo(xx, yy);
        startX = xx;
        open = true;
      } else {
        path.lineTo(xx, yy);
        fill.lineTo(xx, yy);
      }
      lastX = xx;
    }
    if (open) closeFill();
    ctx.fillStyle = c.accentFill;
    ctx.fill(fill);
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke(path);

    // Leq line
    if (Number.isFinite(leq)) {
      const yy = Math.round(y(leq)) + 0.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeStyle = c.text;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, yy);
      ctx.lineTo(PAD.left + plotW, yy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${leqLabel} ${fmtNum(leq)}`, PAD.left + 4, yy - 2);
    }
    ctx.restore();
  }
}
