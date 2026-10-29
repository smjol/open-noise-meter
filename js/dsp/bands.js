// Third-octave bands (base 10, IEC 61260) and FFT spectrum helpers.

const NOMINAL = [
  '25', '31.5', '40', '50', '63', '80', '100', '125', '160', '200',
  '250', '315', '400', '500', '630', '800', '1k', '1.25k', '1.6k', '2k',
  '2.5k', '3.15k', '4k', '5k', '6.3k', '8k', '10k', '12.5k', '16k', '20k',
];

/** Band list from 25 Hz to 20 kHz: { center, lower, upper, label }. */
export const THIRD_OCTAVE_BANDS = NOMINAL.map((label, i) => {
  const center = 1000 * Math.pow(10, (i - 16) / 10);
  return {
    center,
    lower: center * Math.pow(10, -1 / 20),
    upper: center * Math.pow(10, 1 / 20),
    label,
  };
});

// The AnalyserNode applies a Blackman window and scales by 1/N, so a sine of
// amplitude 1 at a bin centre reads 20*log10(0.42 / 2). This offset turns a
// bin value into the RMS level (dBFS) of a sine in that bin.
const BLACKMAN_COHERENT_GAIN = 0.42;
export const ANALYSER_TO_RMS_DB = 20 * Math.log10(2 / (BLACKMAN_COHERENT_GAIN * Math.SQRT2));
// Equivalent noise bandwidth of the Blackman window in bins.
export const BLACKMAN_ENBW = (0.42 ** 2 + 0.5 ** 2 / 2 + 0.08 ** 2 / 2) / 0.42 ** 2;

/**
 * Sum FFT bins into third-octave bands.
 * `binDb` holds sine-calibrated bin levels (dBFS RMS). Bins are split
 * proportionally where they straddle a band edge. Returns band levels in
 * dBFS; bands above Nyquist are NaN.
 */
export function bandLevels(binDb, sampleRate, out = new Float32Array(THIRD_OCTAVE_BANDS.length)) {
  const binWidth = sampleRate / (2 * binDb.length);
  const nyquist = sampleRate / 2;
  for (let b = 0; b < THIRD_OCTAVE_BANDS.length; b++) {
    const { lower, upper } = THIRD_OCTAVE_BANDS[b];
    if (upper > nyquist) { out[b] = NaN; continue; }
    const first = Math.max(1, Math.floor(lower / binWidth - 0.5));
    const last = Math.min(binDb.length - 1, Math.ceil(upper / binWidth + 0.5));
    let power = 0;
    for (let k = first; k <= last; k++) {
      const lo = (k - 0.5) * binWidth;
      const hi = (k + 0.5) * binWidth;
      const overlap = Math.min(hi, upper) - Math.max(lo, lower);
      if (overlap <= 0) continue;
      power += Math.pow(10, binDb[k] / 10) * (overlap / binWidth);
    }
    out[b] = power > 0 ? 10 * Math.log10(power / BLACKMAN_ENBW) : -Infinity;
  }
  return out;
}

/**
 * Strongest bin between fMin and fMax with parabolic interpolation.
 * Returns { frequency, level } or null.
 */
export function dominantFrequency(binDb, sampleRate, fMin = 20, fMax = 20000) {
  const binWidth = sampleRate / (2 * binDb.length);
  const kMin = Math.max(1, Math.ceil(fMin / binWidth));
  const kMax = Math.min(binDb.length - 2, Math.floor(fMax / binWidth));
  let best = -1, bestDb = -Infinity;
  for (let k = kMin; k <= kMax; k++) {
    if (binDb[k] > bestDb) { bestDb = binDb[k]; best = k; }
  }
  if (best < 0 || !Number.isFinite(bestDb)) return null;
  const a = binDb[best - 1], b = binDb[best], c = binDb[best + 1];
  const denom = a - 2 * b + c;
  const delta = Number.isFinite(denom) && denom !== 0 ? 0.5 * (a - c) / denom : 0;
  return {
    frequency: (best + delta) * binWidth,
    level: b - 0.25 * (a - c) * delta,
  };
}
