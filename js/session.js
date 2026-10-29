// A measurement: accumulates worklet reports into overall statistics and a
// 1-second log. Everything is kept in dBFS so the calibration offset can
// change during a measurement; offsets are applied when values are shown,
// exported or saved.

import {
  msToDb, ampToDb, LevelHistogram, noiseDose, projectedDose,
} from './dsp/levels.js';
import { loadJson, saveJson } from './storage.js';

const W = ['A', 'C', 'Z'];
const T = ['F', 'S', 'I'];
const HISTORY_KEY = 'history';
const HISTORY_LIMIT = 50;

export const ROW_FIELDS = ['LAF', 'LAS', 'LAeq_1s', 'LCeq_1s', 'LZeq_1s', 'LAFmax_1s', 'LCpeak_1s'];

function emptySecond() {
  return { duration: 0, energy: { A: 0, C: 0, Z: 0 }, maxAF: 0, peakC: 0, lastAF: 0, lastAS: 0 };
}

export class Session {
  constructor() {
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.seconds = 0;
    this.totals = {};
    for (const w of W) {
      this.totals[w] = {
        energy: 0,
        peak: 0,
        max: { F: 0, S: 0, I: 0 },
        min: { F: Infinity, S: Infinity, I: Infinity },
      };
    }
    this.histAF = new LevelHistogram();
    // Each row: [epoch ms, elapsed s, LAF, LAS, LAeq, LCeq, LZeq, LAFmax, LCpeak] in dBFS
    this.rows = [];
    this.sec = emptySecond();
  }

  get hasData() {
    return this.seconds > 0;
  }

  add(r, sampleRate, now = Date.now()) {
    if (this.startedAt === null) this.startedAt = now;
    const dt = r.n / sampleRate;
    this.seconds += dt;
    for (const w of W) {
      const src = r[w];
      const tot = this.totals[w];
      tot.energy += src.sumSq / sampleRate;
      if (src.peak > tot.peak) tot.peak = src.peak;
      for (const t of T) {
        const max = src['max' + t];
        const min = src['min' + t];
        if (max > tot.max[t]) tot.max[t] = max;
        if (Number.isFinite(min) && min < tot.min[t]) tot.min[t] = min;
      }
      this.sec.energy[w] += src.sumSq / sampleRate;
    }
    if (r.settled) this.histAF.add(msToDb(r.A.F));

    const sec = this.sec;
    sec.duration += dt;
    if (r.A.maxF > sec.maxAF) sec.maxAF = r.A.maxF;
    if (r.C.peak > sec.peakC) sec.peakC = r.C.peak;
    sec.lastAF = r.A.F;
    sec.lastAS = r.A.S;
    if (sec.duration >= 0.999) {
      this.rows.push([
        now,
        Math.round(this.seconds),
        msToDb(sec.lastAF),
        msToDb(sec.lastAS),
        msToDb(sec.energy.A / sec.duration),
        msToDb(sec.energy.C / sec.duration),
        msToDb(sec.energy.Z / sec.duration),
        msToDb(sec.maxAF),
        ampToDb(sec.peakC),
      ]);
      this.sec = emptySecond();
    }
  }

  leq(w) {
    return this.seconds > 0 ? msToDb(this.totals[w].energy / this.seconds) : NaN;
  }

  max(w, t) {
    return this.seconds > 0 ? msToDb(this.totals[w].max[t]) : NaN;
  }

  min(w, t) {
    const v = this.totals[w].min[t];
    return Number.isFinite(v) ? msToDb(v) : NaN;
  }

  peak(w) {
    return this.seconds > 0 ? ampToDb(this.totals[w].peak) : NaN;
  }

  /** All key figures in dB SPL for the given calibration offset. */
  summary(offset) {
    const o = (v) => (Number.isFinite(v) ? v + offset : NaN);
    const laeq = o(this.leq('A'));
    return {
      LAeq: laeq,
      LCeq: o(this.leq('C')),
      LZeq: o(this.leq('Z')),
      LAFmax: o(this.max('A', 'F')),
      LAFmin: o(this.min('A', 'F')),
      LCpeak: o(this.peak('C')),
      LA10: o(this.histAF.exceeded(10)),
      LA50: o(this.histAF.exceeded(50)),
      LA90: o(this.histAF.exceeded(90)),
      dose: noiseDose(laeq, this.seconds),
      dose8h: projectedDose(laeq),
      seconds: this.seconds,
      startedAt: this.startedAt,
    };
  }

  /** 1-second rows with the offset applied, rounded to 0.1 dB. */
  rowsSpl(offset) {
    return this.rows.map((row) => [
      row[0], row[1],
      ...row.slice(2).map((v) => (Number.isFinite(v) ? Math.round((v + offset) * 10) / 10 : null)),
    ]);
  }
}

// ------------------------------------------------------------------ export

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatTimestamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * CSV for spreadsheets. German Excel expects `;` and a decimal comma,
 * English locales `,` and a decimal point.
 */
export function rowsToCsv(rows, lang) {
  const sep = lang === 'de' ? ';' : ',';
  const num = (v) => {
    if (v === null || v === undefined) return '';
    const s = Number(v).toFixed(1);
    return lang === 'de' ? s.replace('.', ',') : s;
  };
  const header = [lang === 'de' ? 'Zeit' : 'Time', lang === 'de' ? 'Sekunde' : 'Second', ...ROW_FIELDS];
  const lines = [header.join(sep)];
  for (const row of rows) {
    lines.push([formatTimestamp(row[0]), row[1], ...row.slice(2).map(num)].join(sep));
  }
  // BOM so Excel detects UTF-8
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvFilename(startedAt) {
  const d = new Date(startedAt ?? Date.now());
  return `noise-meter_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.csv`;
}

// ------------------------------------------------------------------ history

export function loadHistory() {
  const list = loadJson(HISTORY_KEY, []);
  return Array.isArray(list) ? list : [];
}

/**
 * Save a finished measurement. If storage is full, the 1-second log is
 * dropped and only the summary is kept. Returns 'ok', 'summary-only' or 'failed'.
 */
export function saveToHistory(session, calibration) {
  const summary = session.summary(calibration.offset);
  const entry = {
    id: `${session.startedAt}-${Math.round(session.seconds)}`,
    startedAt: session.startedAt,
    savedAt: Date.now(),
    offset: calibration.offset,
    calibrated: calibration.calibrated,
    summary: Object.fromEntries(Object.entries(summary).map(([k, v]) => {
      if (!Number.isFinite(v)) return [k, null];
      const scale = k.startsWith('dose') ? 100 : 10;
      return [k, k === 'startedAt' ? v : Math.round(v * scale) / scale];
    })),
    rows: session.rowsSpl(calibration.offset),
  };
  const list = loadHistory().filter((e) => e.id !== entry.id);
  list.unshift(entry);
  list.length = Math.min(list.length, HISTORY_LIMIT);
  if (saveJson(HISTORY_KEY, list)) return 'ok';
  entry.rows = [];
  return saveJson(HISTORY_KEY, list) ? 'summary-only' : 'failed';
}

export function deleteFromHistory(id) {
  saveJson(HISTORY_KEY, loadHistory().filter((e) => e.id !== id));
}
