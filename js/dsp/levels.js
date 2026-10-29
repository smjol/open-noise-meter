// Level arithmetic: dB conversions, energy averaging, percentiles, noise dose.

/** Mean square (linear) to dB. Returns -Infinity for silence. */
export function msToDb(ms) {
  return ms > 0 ? 10 * Math.log10(ms) : -Infinity;
}

/** Amplitude (linear) to dB. */
export function ampToDb(a) {
  return a > 0 ? 20 * Math.log10(a) : -Infinity;
}

export function dbToMs(db) {
  return Math.pow(10, db / 10);
}

/** Energy average of dB values, optionally weighted by durations. */
export function energyAverage(levels, durations) {
  let sum = 0, total = 0;
  for (let i = 0; i < levels.length; i++) {
    const d = durations ? durations[i] : 1;
    sum += dbToMs(levels[i]) * d;
    total += d;
  }
  return total > 0 ? msToDb(sum / total) : -Infinity;
}

/**
 * Histogram of dB values with fixed resolution, used for statistical
 * levels (L10, L50, L90) over long measurements without storing samples.
 */
export class LevelHistogram {
  constructor(minDb = -160, maxDb = 40, step = 0.1) {
    this.minDb = minDb;
    this.step = step;
    this.bins = new Uint32Array(Math.ceil((maxDb - minDb) / step) + 1);
    this.count = 0;
  }

  add(db) {
    if (!Number.isFinite(db)) return;
    let i = Math.round((db - this.minDb) / this.step);
    i = Math.max(0, Math.min(this.bins.length - 1, i));
    this.bins[i]++;
    this.count++;
  }

  clear() {
    this.bins.fill(0);
    this.count = 0;
  }

  /** Level exceeded during `percent` % of the time (L10 = exceeded 10 %). */
  exceeded(percent) {
    if (this.count === 0) return NaN;
    const target = this.count * (percent / 100);
    let acc = 0;
    for (let i = this.bins.length - 1; i >= 0; i--) {
      acc += this.bins[i];
      if (acc >= target) return this.minDb + i * this.step;
    }
    return this.minDb;
  }
}

/** Exceeded level from a plain array (for tests and small data sets). */
export function exceededLevel(values, percent) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => b - a);
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percent / 100) - 1));
  return sorted[idx];
}

// Noise dose with 85 dB(A) criterion over 8 h and 3 dB exchange rate
// (EU directive 2003/10/EC, NIOSH).
export const DOSE_CRITERION_DB = 85;
const EIGHT_HOURS = 8 * 3600;

/** Dose in percent for a measured LAeq over `seconds`. */
export function noiseDose(laeq, seconds) {
  if (!Number.isFinite(laeq) || seconds <= 0) return 0;
  return 100 * (seconds / EIGHT_HOURS) * Math.pow(10, (laeq - DOSE_CRITERION_DB) / 10);
}

/** Dose in percent if the same LAeq lasted a full 8 h shift. */
export function projectedDose(laeq) {
  return noiseDose(laeq, EIGHT_HOURS);
}
