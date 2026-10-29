// Sound level computation on the audio thread.
//
// LevelCore is plain JavaScript without imports, so the same code runs in the
// AudioWorklet and in the browser test page. For every weighting (A, C, Z) it
// filters the signal, applies the exponential time weightings Fast (125 ms),
// Slow (1 s) and Impulse (35 ms average followed by a peak detector with
// 1.5 s decay) to the squared signal and collects energy, peak and min/max
// values. Every `reportInterval` seconds it emits one report with linear
// values (mean squares relative to full scale).

class LevelCore {
  constructor(sampleRate, filters, reportInterval = 0.1) {
    this.fs = sampleRate;
    this.kFast = 1 - Math.exp(-1 / (0.125 * sampleRate));
    this.kSlow = 1 - Math.exp(-1 / (1.0 * sampleRate));
    this.kImp = 1 - Math.exp(-1 / (0.035 * sampleRate));
    this.kImpDecay = 1 - Math.exp(-1 / (1.5 * sampleRate));
    this.blockSize = Math.max(1, Math.round(reportInterval * sampleRate));
    // Peak and max values skip the filters' start-up transient; min values
    // are only meaningful once the slow detector has settled.
    this.warmupSamples = Math.round(0.25 * sampleRate);
    this.settleSamples = Math.round(1.5 * sampleRate);
    this.samplesSeen = 0;
    this.blockCount = 0;
    this.channels = Object.keys(filters).map((name) => ({
      name,
      sections: filters[name].map((s) => ({ ...s, z1: 0, z2: 0 })),
      fast: 0, slow: 0, impAvg: 0, imp: 0,
    }));
    this.resetBlock();
  }

  resetBlock() {
    this.blockCount = 0;
    for (const ch of this.channels) {
      ch.sumSq = 0;
      ch.peak = 0;
      ch.maxF = 0; ch.maxS = 0; ch.maxI = 0;
      ch.minF = Infinity; ch.minS = Infinity; ch.minI = Infinity;
    }
  }

  /** Process one buffer. Calls onReport(report) for each finished block. */
  process(input, onReport) {
    const { kFast, kSlow, kImp, kImpDecay } = this;
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      const warm = this.samplesSeen >= this.warmupSamples;
      const settled = this.samplesSeen >= this.settleSamples;
      for (const ch of this.channels) {
        let y = x;
        for (const s of ch.sections) {
          // Transposed direct form II
          const out = s.b0 * y + s.z1;
          s.z1 = s.b1 * y - s.a1 * out + s.z2;
          s.z2 = s.b2 * y - s.a2 * out;
          y = out;
        }
        const sq = y * y;
        ch.fast += kFast * (sq - ch.fast);
        ch.slow += kSlow * (sq - ch.slow);
        ch.impAvg += kImp * (sq - ch.impAvg);
        if (ch.impAvg > ch.imp) ch.imp = ch.impAvg;
        else ch.imp += kImpDecay * (ch.impAvg - ch.imp);
        ch.sumSq += sq;
        if (warm) {
          const a = y < 0 ? -y : y;
          if (a > ch.peak) ch.peak = a;
          if (ch.fast > ch.maxF) ch.maxF = ch.fast;
          if (ch.slow > ch.maxS) ch.maxS = ch.slow;
          if (ch.imp > ch.maxI) ch.maxI = ch.imp;
        }
        if (settled) {
          if (ch.fast < ch.minF) ch.minF = ch.fast;
          if (ch.slow < ch.minS) ch.minS = ch.slow;
          if (ch.imp < ch.minI) ch.minI = ch.imp;
        }
      }
      this.samplesSeen++;
      if (++this.blockCount >= this.blockSize) {
        onReport(this.report());
        this.resetBlock();
      }
    }
  }

  report() {
    const out = { n: this.blockCount, settled: this.samplesSeen >= this.settleSamples };
    for (const ch of this.channels) {
      out[ch.name] = {
        F: ch.fast, S: ch.slow, I: ch.imp,
        sumSq: ch.sumSq, peak: ch.peak,
        maxF: ch.maxF, maxS: ch.maxS, maxI: ch.maxI,
        minF: ch.minF, minS: ch.minS, minI: ch.minI,
      };
    }
    return out;
  }
}

globalThis.LevelCore = LevelCore;

if (typeof AudioWorkletProcessor !== 'undefined') {
  class LevelProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      const { filters, reportInterval } = options.processorOptions;
      this.core = new LevelCore(sampleRate, filters, reportInterval);
      this.post = (report) => this.port.postMessage(report);
    }

    process(inputs) {
      const channel = inputs[0] && inputs[0][0];
      if (channel) this.core.process(channel, this.post);
      return true;
    }
  }
  registerProcessor('level-processor', LevelProcessor);
}
