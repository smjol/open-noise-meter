import { designWeighting, sosMagnitudeDb, weightingDb } from '../js/dsp/weighting.js';
import {
  msToDb, ampToDb, energyAverage, LevelHistogram, exceededLevel, noiseDose, projectedDose,
} from '../js/dsp/levels.js';
import {
  THIRD_OCTAVE_BANDS, bandLevels, dominantFrequency, ANALYSER_TO_RMS_DB, BLACKMAN_ENBW,
} from '../js/dsp/bands.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assertClose(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${label} expected ${expected} ± ${tol}, got ${Number(actual).toFixed(3)}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------- weighting

// IEC 61672-1 nominal values and class 1 tolerances (+/-) in dB.
const A_TABLE = [
  [31.5, -39.4, 1.5, 1.5], [63, -26.2, 1.0, 1.0], [100, -19.1, 1.0, 1.0],
  [125, -16.1, 1.0, 1.0], [250, -8.6, 1.0, 1.0], [500, -3.2, 1.0, 1.0],
  [1000, 0, 0.7, 0.7], [2000, 1.2, 1.0, 1.0], [4000, 1.0, 1.0, 1.0],
  [8000, -1.1, 1.5, 2.5], [10000, -2.5, 2.0, 3.0], [12500, -4.3, 2.0, 5.0],
  [16000, -6.6, 2.5, 16.0],
];
const C_TABLE = [
  [31.5, -3.0, 1.5, 1.5], [63, -0.8, 1.0, 1.0], [1000, 0, 0.7, 0.7],
  [4000, -0.8, 1.0, 1.0], [8000, -3.0, 1.5, 2.5], [10000, -4.4, 2.0, 3.0],
];

for (const fs of [44100, 48000]) {
  for (const [type, table] of [['A', A_TABLE], ['C', C_TABLE]]) {
    test(`${type}-weighting @ ${fs} Hz within IEC 61672 class 1 tolerances`, () => {
      const sos = designWeighting(type, fs);
      for (const [f, nominal, plus, minus] of table) {
        const db = sosMagnitudeDb(sos, f, fs);
        assert(db <= nominal + plus && db >= nominal - minus,
          `${f} Hz: ${db.toFixed(2)} dB not within ${nominal} +${plus}/-${minus}`);
      }
    });
    test(`${type}-weighting @ ${fs} Hz matches analog curve within 0.4 dB up to 10 kHz`, () => {
      const sos = designWeighting(type, fs);
      for (const f of [20, 31.5, 50, 100, 200, 500, 1000, 2000, 4000, 6300, 8000, 10000]) {
        assertClose(sosMagnitudeDb(sos, f, fs), weightingDb(type, f), 0.4, `${f} Hz`);
      }
    });
  }
}

test('Analog curves are 0 dB at 1 kHz', () => {
  assertClose(weightingDb('A', 1000), 0, 0.01, 'A');
  assertClose(weightingDb('C', 1000), 0, 0.01, 'C');
  assertClose(weightingDb('Z', 1000), 0, 0, 'Z');
});

test('Z-weighting is flat from 20 Hz to 20 kHz', () => {
  const sos = designWeighting('Z', 48000);
  for (const f of [20, 50, 1000, 10000, 20000]) assertClose(sosMagnitudeDb(sos, f, 48000), 0, 0.3, `${f} Hz`);
});

// ---------------------------------------------------------------- level core

const FS = 48000;
const filters = { A: designWeighting('A', FS), C: designWeighting('C', FS), Z: designWeighting('Z', FS) };

function sine(freq, rmsDb, seconds, phase = 0) {
  const amp = Math.SQRT2 * Math.pow(10, rmsDb / 20);
  const out = new Float32Array(Math.round(seconds * FS));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / FS + phase);
  return out;
}

/** Feed signal through a LevelCore and return all reports. */
function run(core, signal) {
  const reports = [];
  for (let i = 0; i < signal.length; i += 128) {
    core.process(signal.subarray(i, i + 128), (r) => reports.push(r));
  }
  return reports;
}

function leqOf(reports, w) {
  let s = 0, n = 0;
  for (const r of reports) { s += r[w].sumSq; n += r.n; }
  return msToDb(s / n);
}

test('LevelCore reports every 100 ms', () => {
  const core = new LevelCore(FS, filters, 0.1);
  const reports = run(core, sine(1000, -20, 1.0));
  assert(reports.length === 10, `expected 10 reports, got ${reports.length}`);
  assert(reports[0].n === 4800, `block size ${reports[0].n}`);
});

test('1 kHz sine at -20 dBFS reads -20 dB in A, C and Z', () => {
  const core = new LevelCore(FS, filters);
  // Slow needs > 6 time constants to settle within 0.01 dB.
  const reports = run(core, sine(1000, -20, 8));
  const last = reports[reports.length - 1];
  for (const w of ['A', 'C', 'Z']) {
    assertClose(msToDb(last[w].F), -20, 0.1, `${w}F`);
    assertClose(msToDb(last[w].S), -20, 0.1, `${w}S`);
    assertClose(msToDb(last[w].I), -20, 0.1, `${w}I`);
    assertClose(leqOf(reports.slice(10), w), -20, 0.05, `${w}eq`);
  }
});

test('100 Hz sine: A is ~19.1 dB below Z, C ~0.3 dB below Z', () => {
  const core = new LevelCore(FS, filters);
  const reports = run(core, sine(100, -20, 3)).slice(10);
  assertClose(leqOf(reports, 'Z'), -20, 0.05, 'Z');
  assertClose(leqOf(reports, 'A'), -20 - 19.15, 0.2, 'A');
  assertClose(leqOf(reports, 'C'), -20 - 0.3, 0.2, 'C');
});

test('Peak of a sine is 3 dB above its RMS level', () => {
  const core = new LevelCore(FS, filters);
  const reports = run(core, sine(1000, -20, 1));
  const peak = Math.max(...reports.map((r) => r.Z.peak));
  assertClose(ampToDb(peak), -20 + 3.01, 0.05, 'Zpeak');
});

test('Fast time weighting: tone onset reaches -2 dB after 125 ms', () => {
  const core = new LevelCore(FS, filters, 0.125);
  const reports = run(core, sine(1000, -20, 0.125));
  // 10*log10(1 - e^-1) = -1.99 dB
  assertClose(msToDb(reports[0].Z.F), -21.99, 0.15, 'ZF');
});

test('Slow time weighting: tone onset reaches -2 dB after 1 s', () => {
  const core = new LevelCore(FS, filters, 1.0);
  const reports = run(core, sine(1000, -20, 1.0));
  assertClose(msToDb(reports[0].Z.S), -21.99, 0.1, 'ZS');
});

test('Impulse time weighting: decays 4.34 dB in 1.5 s', () => {
  const core = new LevelCore(FS, filters, 0.5);
  run(core, sine(1000, -20, 2));
  const reports = run(core, new Float32Array(1.5 * FS));
  assertClose(msToDb(reports[reports.length - 1].Z.I), -24.34, 0.2, 'ZI');
});

test('Min values are only tracked after the settling time', () => {
  const core = new LevelCore(FS, filters);
  const reports = run(core, sine(1000, -20, 2));
  assert(reports[0].Z.minF === Infinity, 'min tracked during settling');
  assertClose(msToDb(reports[reports.length - 1].Z.minF), -20, 0.2, 'ZFmin');
});

// ---------------------------------------------------------------- level math

test('Energy average of 60 and 70 dB is 67.4 dB', () => {
  assertClose(energyAverage([60, 70]), 67.40, 0.01);
  assertClose(energyAverage([60, 70], [3, 1]), 65.12, 0.01, 'weighted');
});

test('Statistical levels L10/L50/L90', () => {
  const values = Array.from({ length: 100 }, (_, i) => 40 + i * 0.5); // 40 … 89.5
  const hist = new LevelHistogram(0, 120);
  values.forEach((v) => hist.add(v));
  assertClose(hist.exceeded(10), 85, 0.11, 'L10');
  assertClose(hist.exceeded(50), 65, 0.11, 'L50');
  assertClose(hist.exceeded(90), 45, 0.11, 'L90');
  assertClose(exceededLevel(values, 10), 85, 0.01, 'array L10');
});

test('Noise dose: 85 dB(A) for 8 h = 100 %, 88 dB(A) for 4 h = 100 %', () => {
  assertClose(noiseDose(85, 8 * 3600), 100, 0.01, '85/8h');
  assertClose(noiseDose(88, 4 * 3600), 99.76, 0.1, '88/4h');
  assertClose(projectedDose(82), 50.12, 0.1, 'projected 82');
});

// ---------------------------------------------------------------- spectrum

test('Third-octave bands: 30 bands, 1 kHz centre exact', () => {
  assert(THIRD_OCTAVE_BANDS.length === 30, 'band count');
  assertClose(THIRD_OCTAVE_BANDS[16].center, 1000, 1e-9, '1k');
  assertClose(THIRD_OCTAVE_BANDS[0].center, 25.12, 0.01, '25');
});

test('Blackman constants', () => {
  assertClose(ANALYSER_TO_RMS_DB, 10.545, 0.01, 'sine correction');
  assertClose(BLACKMAN_ENBW, 1.727, 0.001, 'ENBW');
});

/** Render a signal through an AnalyserNode offline and return calibrated bins. */
async function analyse(makeSource, fftSize = 8192) {
  const ctx = new OfflineAudioContext(1, FS, FS);
  const analyser = new AnalyserNode(ctx, { fftSize, smoothingTimeConstant: 0 });
  makeSource(ctx).connect(analyser);
  analyser.connect(ctx.destination);
  const bins = new Float32Array(analyser.frequencyBinCount);
  ctx.suspend(0.5).then(() => {
    analyser.getFloatFrequencyData(bins);
    ctx.resume();
  });
  await ctx.startRendering();
  for (let k = 0; k < bins.length; k++) bins[k] += ANALYSER_TO_RMS_DB;
  return bins;
}

test('AnalyserNode: 1 kHz sine at -20 dBFS → bin -20 dB, band -20 dB, dominant 1000 Hz', async () => {
  const bins = await analyse((ctx) => {
    const osc = new OscillatorNode(ctx, { frequency: 1000 });
    const gain = new GainNode(ctx, { gain: Math.SQRT2 * 0.1 });
    osc.connect(gain);
    osc.start();
    return gain;
  });
  const dom = dominantFrequency(bins, FS);
  assertClose(dom.frequency, 1000, 1, 'frequency');
  assertClose(dom.level, -20, 0.5, 'peak level');
  const bands = bandLevels(bins, FS);
  assertClose(bands[16], -20, 0.3, '1 kHz band');
});

test('AnalyserNode: white noise bands sum to total RMS', async () => {
  const rms = 0.05;
  const bins = await analyse((ctx) => {
    const buffer = ctx.createBuffer(1, FS, FS);
    const data = buffer.getChannelData(0);
    // Uniform noise in [-a, a] has RMS a/sqrt(3)
    const a = rms * Math.sqrt(3);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * a;
    const src = new AudioBufferSourceNode(ctx, { buffer });
    src.start();
    return src;
  }, 32768);
  let p = 0;
  for (let k = 1; k < bins.length; k++) p += Math.pow(10, bins[k] / 10);
  const total = 10 * Math.log10(p / BLACKMAN_ENBW);
  assertClose(total, 20 * Math.log10(rms), 0.5, 'total');
});

// ---------------------------------------------------------------- runner

const list = document.getElementById('results');
const summary = document.getElementById('summary');
let passed = 0;
for (const t of tests) {
  const li = document.createElement('li');
  li.textContent = t.name;
  try {
    await t.fn();
    li.className = 'pass';
    passed++;
  } catch (err) {
    li.className = 'fail';
    const d = document.createElement('span');
    d.className = 'detail';
    d.textContent = err.message;
    li.append(d);
  }
  list.append(li);
}
const ok = passed === tests.length;
summary.textContent = `${passed} / ${tests.length} passed`;
summary.className = ok ? 'ok' : 'bad';
document.title = `${ok ? 'PASS' : 'FAIL'} ${passed}/${tests.length}`;
