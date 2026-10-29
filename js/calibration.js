// Calibration: the offset that converts dBFS (RMS 1.0 = 0 dB) into dB SPL.
//
// Phone microphones differ by several dB, so the offset is stored per device.
// Until the user calibrates, the default offset is only a rough guess and the
// UI marks all values as uncalibrated.

import { loadJson, saveJson } from './storage.js';
import { msToDb } from './dsp/levels.js';

export const DEFAULT_OFFSET = 100;
const KEY = 'calibration';

export class Calibration extends EventTarget {
  constructor() {
    super();
    const saved = loadJson(KEY, null);
    this.offset = Number.isFinite(saved?.offset) ? saved.offset : DEFAULT_OFFSET;
    this.calibrated = Boolean(saved?.calibrated);
    this.date = saved?.date ?? null;
  }

  set(offset, calibrated = true) {
    this.offset = Math.round(offset * 10) / 10;
    this.calibrated = calibrated;
    this.date = calibrated ? new Date().toISOString() : null;
    saveJson(KEY, { offset: this.offset, calibrated: this.calibrated, date: this.date });
    this.dispatchEvent(new Event('change'));
  }

  adjust(delta) {
    this.set(this.offset + delta, true);
  }

  reset() {
    this.set(DEFAULT_OFFSET, false);
  }
}

/**
 * Average the level of one weighting over `seconds` of engine reports.
 * Resolves with the level in dBFS; rejects if the engine stops meanwhile.
 */
export function measureLevel(engine, weighting, seconds, onProgress) {
  return new Promise((resolve, reject) => {
    let energy = 0, n = 0;
    const target = seconds * engine.sampleRate;
    const onReport = (e) => {
      const r = e.detail;
      if (!r.settled) return; // skip the first second after start
      energy += r[weighting].sumSq;
      n += r.n;
      onProgress?.(Math.min(1, n / target));
      if (n >= target) {
        cleanup();
        resolve(msToDb(energy / n));
      }
    };
    const onState = (e) => {
      if (e.detail === 'closed') {
        cleanup();
        reject(new Error('stopped'));
      }
    };
    const cleanup = () => {
      engine.removeEventListener('report', onReport);
      engine.removeEventListener('statechange', onState);
    };
    engine.addEventListener('report', onReport);
    engine.addEventListener('statechange', onState);
  });
}
