// Audio input: microphone (or a demo signal) → AnalyserNode → level worklet.
//
// The analyser passes the signal through unchanged, so a single chain feeds
// both the FFT and the level computation, and the worklet's (silent) output
// to the destination keeps the whole graph running in every browser.

import { designWeighting, WEIGHTINGS } from './dsp/weighting.js';
import { ANALYSER_TO_RMS_DB } from './dsp/bands.js';

export const REPORT_INTERVAL = 0.1;

export class AudioEngineError extends Error {
  constructor(code, cause) {
    super(code);
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Parse the demo parameters from the URL, e.g. ?demo=1000&level=-20 or
 * ?demo=noise. Returns null when no demo signal was requested.
 */
export function demoFromUrl(search = location.search) {
  const params = new URLSearchParams(search);
  if (!params.has('demo')) return null;
  const raw = params.get('demo');
  const level = Number.parseFloat(params.get('level'));
  const frequency = Number.parseFloat(raw);
  return {
    type: raw === 'noise' ? 'noise' : 'tone',
    frequency: Number.isFinite(frequency) && frequency > 0 ? frequency : 1000,
    level: Number.isFinite(level) ? Math.min(0, level) : -30,
  };
}

export class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.worklet = null;
    this.source = null;
    this.fftSize = 8192;
    this.demo = null;
  }

  get running() {
    return this.ctx !== null;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  /**
   * Start measuring. Must be called from a user gesture (iOS only allows
   * audio to start inside a tap handler).
   */
  async start(demo = null) {
    if (this.running) return;
    if (!window.AudioContext && !window.webkitAudioContext) throw new AudioEngineError('no-audio');
    if (!demo && !window.isSecureContext) throw new AudioEngineError('insecure');
    if (!demo && !navigator.mediaDevices?.getUserMedia) throw new AudioEngineError('no-mic');

    // Create the context synchronously inside the gesture, before any await.
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.demo = demo;
    const resumed = ctx.resume();

    try {
      if (!ctx.audioWorklet) throw new AudioEngineError('no-worklet');
      await ctx.audioWorklet.addModule(new URL('./worklet/level-processor.js', import.meta.url));

      let input;
      if (demo) {
        input = this.createDemoSource(ctx, demo);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
          video: false,
        });
        if (this.ctx !== ctx) {
          // Stopped while the permission prompt was open.
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        this.stream = stream;
        input = ctx.createMediaStreamSource(stream);
      }
      await resumed;
      if (this.ctx !== ctx) return; // stopped while starting

      const filters = {};
      for (const w of WEIGHTINGS) filters[w] = designWeighting(w, ctx.sampleRate);

      this.analyser = new AnalyserNode(ctx, {
        fftSize: this.fftSize,
        smoothingTimeConstant: 0.5,
        channelCount: 1,
        channelCountMode: 'explicit',
      });
      this.worklet = new AudioWorkletNode(ctx, 'level-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: { filters, reportInterval: REPORT_INTERVAL },
      });
      this.worklet.port.onmessage = (e) => {
        this.dispatchEvent(new CustomEvent('report', { detail: e.data }));
      };
      input.connect(this.analyser);
      this.analyser.connect(this.worklet);
      this.worklet.connect(ctx.destination);
      this.source = input;

      ctx.onstatechange = () => this.dispatchEvent(new CustomEvent('statechange', { detail: ctx.state }));
      this.dispatchEvent(new CustomEvent('statechange', { detail: ctx.state }));
    } catch (err) {
      this.stop();
      if (err instanceof AudioEngineError) throw err;
      if (err && err.name === 'NotAllowedError') throw new AudioEngineError('denied', err);
      if (err && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
        throw new AudioEngineError('no-mic', err);
      }
      throw new AudioEngineError('failed', err);
    }
  }

  createDemoSource(ctx, demo) {
    const gain = new GainNode(ctx);
    if (demo.type === 'noise') {
      const length = ctx.sampleRate * 4;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // Uniform white noise in [-a, a] has an RMS of a / sqrt(3).
      const a = Math.sqrt(3) * Math.pow(10, demo.level / 20);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * a;
      const src = new AudioBufferSourceNode(ctx, { buffer, loop: true });
      src.connect(gain);
      src.start();
      this.demoNode = src;
    } else {
      gain.gain.value = Math.SQRT2 * Math.pow(10, demo.level / 20);
      const osc = new OscillatorNode(ctx, { frequency: demo.frequency });
      osc.connect(gain);
      osc.start();
      this.demoNode = osc;
    }
    return gain;
  }

  /** Try to resume after an interruption (phone call, app switch on iOS). */
  async resume() {
    if (this.ctx && this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* ignored, user can restart */ }
    }
  }

  stop() {
    const ctx = this.ctx;
    this.ctx = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    try { this.demoNode?.stop(); } catch { /* not started */ }
    this.demoNode = null;
    if (this.worklet) this.worklet.port.onmessage = null;
    this.worklet = null;
    this.analyser = null;
    this.source = null;
    if (ctx) {
      ctx.onstatechange = null;
      ctx.close().catch(() => {});
    }
    this.dispatchEvent(new CustomEvent('statechange', { detail: 'closed' }));
  }

  setFftSize(size) {
    this.fftSize = size;
    if (this.analyser) this.analyser.fftSize = size;
  }

  /** Fill `out` with sine-calibrated bin levels (dBFS). Returns false if idle. */
  getSpectrum(out) {
    if (!this.analyser || out.length !== this.analyser.frequencyBinCount) return false;
    this.analyser.getFloatFrequencyData(out);
    for (let k = 0; k < out.length; k++) out[k] += ANALYSER_TO_RMS_DB;
    return true;
  }

  get binCount() {
    return this.analyser ? this.analyser.frequencyBinCount : this.fftSize / 2;
  }
}
