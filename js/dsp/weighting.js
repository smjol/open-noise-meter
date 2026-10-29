// Frequency weightings (A, C, Z) as cascades of digital biquads.
//
// The analog prototypes follow IEC 61672-1. They are digitised with the
// bilinear transform at the actual sample rate. The highest pole (12.2 kHz)
// is moved halfway towards its pre-warped position, which keeps the digital
// response within ~0.25 dB of the analog one up to 10 kHz at 44.1/48 kHz.

const F1 = 20.598997;
const F2 = 107.65265;
const F3 = 737.86223;
const F4 = 12194.217;

export const WEIGHTINGS = ['A', 'C', 'Z'];

// Analog pole at -2*pi*f mapped to the z-plane.
function bilinearPole(f, fs) {
  const w = 2 * Math.PI * f;
  const k = 2 * fs;
  return (k - w) / (k + w);
}

function highPoleFrequency(fs) {
  const warped = (fs / Math.PI) * Math.tan((Math.PI * F4) / fs);
  return (F4 + warped) / 2;
}

// Biquad with zeros at z = zeroAt (double) and the two given real poles.
// Coefficients follow the convention y = b0 x + b1 x1 + b2 x2 - a1 y1 - a2 y2.
function section(zeroAt, p, q) {
  return {
    b0: 1,
    b1: -2 * zeroAt,
    b2: zeroAt * zeroAt,
    a1: -(p + q),
    a2: p * q,
  };
}

// First-order high-pass (DC blocker) written as a biquad.
function dcBlocker(fc, fs) {
  const p = bilinearPole(fc, fs);
  return { b0: 1, b1: -1, b2: 0, a1: -p, a2: 0 };
}

/** Complex response of a section cascade at frequency f. Returns [re, im]. */
export function sosResponse(sections, f, fs) {
  const w = (2 * Math.PI * f) / fs;
  // z^-1 and z^-2
  const c1 = Math.cos(w), s1 = -Math.sin(w);
  const c2 = Math.cos(2 * w), s2 = -Math.sin(2 * w);
  let re = 1, im = 0;
  for (const s of sections) {
    const nr = s.b0 + s.b1 * c1 + s.b2 * c2;
    const ni = s.b1 * s1 + s.b2 * s2;
    const dr = 1 + s.a1 * c1 + s.a2 * c2;
    const di = s.a1 * s1 + s.a2 * s2;
    const d = dr * dr + di * di;
    const hr = (nr * dr + ni * di) / d;
    const hi = (ni * dr - nr * di) / d;
    const r = re * hr - im * hi;
    im = re * hi + im * hr;
    re = r;
  }
  return [re, im];
}

/** Magnitude response of a section cascade in dB. */
export function sosMagnitudeDb(sections, f, fs) {
  const [re, im] = sosResponse(sections, f, fs);
  return 10 * Math.log10(re * re + im * im);
}

/**
 * Design the biquad cascade for a weighting at sample rate fs.
 * The cascade is normalised to 0 dB at 1 kHz.
 */
export function designWeighting(type, fs) {
  const p1 = bilinearPole(F1, fs);
  const p4 = bilinearPole(highPoleFrequency(fs), fs);
  let sections;
  if (type === 'A') {
    sections = [
      section(1, p1, p1),
      section(1, bilinearPole(F2, fs), bilinearPole(F3, fs)),
      section(-1, p4, p4),
    ];
  } else if (type === 'C') {
    sections = [section(1, p1, p1), section(-1, p4, p4)];
  } else if (type === 'Z') {
    // Flat, only removes DC offset of the microphone signal.
    sections = [dcBlocker(5, fs)];
  } else {
    throw new Error(`Unknown weighting ${type}`);
  }
  const gain = Math.pow(10, -sosMagnitudeDb(sections, 1000, fs) / 20);
  sections[0].b0 *= gain;
  sections[0].b1 *= gain;
  sections[0].b2 *= gain;
  return sections;
}

/** Analog weighting curve in dB (IEC 61672-1), used for display and tests. */
export function weightingDb(type, f) {
  if (type === 'Z') return 0;
  const f2 = f * f;
  if (type === 'A') {
    const r = (F4 * F4 * f2 * f2) /
      ((f2 + F1 * F1) * Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) * (f2 + F4 * F4));
    return 20 * Math.log10(r) + 2.0;
  }
  if (type === 'C') {
    const r = (F4 * F4 * f2) / ((f2 + F1 * F1) * (f2 + F4 * F4));
    return 20 * Math.log10(r) + 0.062;
  }
  throw new Error(`Unknown weighting ${type}`);
}
