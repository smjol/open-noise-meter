// Open Noise Meter – UI wiring and state.

import { AudioEngine, demoFromUrl } from './audio-engine.js';
import { Calibration, measureLevel } from './calibration.js';
import {
  Session, rowsToCsv, csvFilename, loadHistory, saveToHistory, deleteFromHistory,
} from './session.js';
import { msToDb } from './dsp/levels.js';
import { bandLevels, dominantFrequency } from './dsp/bands.js';
import {
  t, setLanguage, resolveLanguage, applyTranslations, getLanguage,
  fmtNum, fmtDuration, fmtDateTime, fmtFrequency,
} from './i18n.js';
import { loadJson, saveJson } from './storage.js';
import { LevelBar, zoneFor } from './ui/meter.js';
import { HistoryChart } from './ui/history-chart.js';
import { SpectrumView, weightingCurve } from './ui/spectrum.js';
import { Spectrogram } from './ui/spectrogram.js';
import { invalidateThemeColors } from './ui/canvas.js';

const VERSION = '1.0.0';
const REPO_URL = 'https://github.com/smjol/open-noise-meter';

const W = ['A', 'C', 'Z'];
const T = ['F', 'S', 'I'];

const DEFAULT_SETTINGS = {
  lang: 'auto',
  theme: 'auto',
  warn: 70,
  danger: 85,
  fftSize: 8192,
  wakeLock: true,
  weighting: 'A',
  time: 'F',
  range: '60',
  specMode: 'fft',
  specWeight: false,
  peakHold: false,
  tab: 'meter',
};

const settings = { ...DEFAULT_SETTINGS, ...loadJson('settings', {}) };
const saveSettings = () => saveJson('settings', settings);

const $ = (id) => document.getElementById(id);
const engine = new AudioEngine();
const calibration = new Calibration();
const session = new Session();
const demo = demoFromUrl();

let currentTab = 'meter';
let lastReport = null;
let dirty = true;
let rafId = 0;

// ------------------------------------------------------------ recent levels
// Ring buffer with all 9 combinations (A/C/Z × F/S/I) in dBFS, 10 per second.

const RING_SIZE = 3000; // 5 minutes
const ring = { data: new Float32Array(RING_SIZE * 9), head: 0, count: 0 };

function ringPush(r) {
  const base = ring.head * 9;
  let i = 0;
  for (const w of W) for (const tw of T) ring.data[base + i++] = msToDb(r[w][tw]);
  ring.head = (ring.head + 1) % RING_SIZE;
  ring.count = Math.min(ring.count + 1, RING_SIZE);
}

function ringSeries(w, tw, n, offset) {
  const out = new Float32Array(Math.min(n, ring.count));
  const col = W.indexOf(w) * 3 + T.indexOf(tw);
  for (let i = 0; i < out.length; i++) {
    const idx = (ring.head - out.length + i + RING_SIZE) % RING_SIZE;
    out[i] = ring.data[idx * 9 + col] + offset;
  }
  return out;
}

// ------------------------------------------------------------ UI elements

const ui = {
  start: $('btn-start'),
  startLabel: $('btn-start-label'),
  badge: $('calib-badge'),
  banner: $('banner'),
  bannerText: $('banner-text'),
  toast: $('toast'),
  lvlName: $('lvl-name'),
  lvlValue: $('lvl-value'),
  lvlUnit: $('lvl-unit'),
  stateHint: $('state-hint'),
  demoBadge: $('demo-badge'),
  readoutCard: document.querySelector('.readout-card'),
  stLeqLabel: $('st-leq-label'),
  stLeq: $('st-leq'),
  stMaxLabel: $('st-max-label'),
  stMax: $('st-max'),
  stMinLabel: $('st-min-label'),
  stMin: $('st-min'),
  stPeak: $('st-peak'),
  stDuration: $('st-duration'),
  specDom: $('spec-dom'),
  specWeightLabel: $('opt-specweight-label'),
  peakHoldWrap: $('opt-peakhold-wrap'),
  peakReset: $('btn-peak-reset'),
  sessStatus: $('sess-status'),
  sessSummary: $('sess-summary'),
  savedList: $('saved-list'),
  savedEmpty: $('saved-empty'),
  calOffset: $('cal-offset'),
  calRef: $('cal-ref'),
  calRefUnit: $('cal-ref-unit'),
  calRun: $('cal-run'),
  calProgress: $('cal-progress'),
  calStatus: $('cal-status'),
};

const levelBar = new LevelBar($('levelbar'));
const historyChart = new HistoryChart($('history-canvas'));
const spectrumView = new SpectrumView($('spectrum-canvas'));
const spectrogram = new Spectrogram($('spectrum-canvas'));

// ------------------------------------------------------------ helpers

let toastTimer = 0;
function toast(message) {
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 2600);
}

let bannerKey = null;
function showBanner(key) {
  bannerKey = key;
  ui.bannerText.textContent = t(key);
  ui.banner.hidden = false;
}
function hideBanner(key) {
  if (key && key !== bannerKey) return;
  bannerKey = null;
  ui.banner.hidden = true;
}

function bindSeg(el, value, onChange) {
  const buttons = [...el.querySelectorAll('button')];
  const mark = (v) => {
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.value === v));
  };
  mark(String(value));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mark(b.dataset.value);
    onChange(b.dataset.value);
  });
  return mark;
}

const offset = () => calibration.offset;
const spl = (dbfs) => (Number.isFinite(dbfs) ? dbfs + offset() : NaN);
const dbText = (v) => (Number.isFinite(v) ? fmtNum(v) : '–');

function deliverFile(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare && typeof File === 'function') {
    const file = new File([blob], filename, { type: 'text/csv' });
    if (navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: filename }).catch(() => {});
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ------------------------------------------------------------ start / stop

function renderStartButton(state = engine.running ? 'running' : 'idle') {
  ui.start.dataset.state = state;
  ui.start.disabled = state === 'starting';
  ui.startLabel.textContent = t(state === 'running' ? 'stop' : 'start');
  ui.stateHint.hidden = state !== 'idle' || session.hasData;
  ui.readoutCard.classList.toggle('stale', state !== 'running');
}

async function start() {
  if (engine.running) return;
  hideBanner();
  renderStartButton('starting');
  try {
    await engine.start(demo);
  } catch (err) {
    showBanner(`err_${err.code || 'failed'}`);
    console.error(err.cause || err);
  }
  renderStartButton();
  if (engine.running) {
    requestWakeLock();
    loop();
  }
}

function stop() {
  engine.stop();
  releaseWakeLock();
  renderStartButton();
  dirty = true;
  renderAll();
}

engine.addEventListener('report', (e) => {
  lastReport = e.detail;
  session.add(lastReport, engine.sampleRate);
  ringPush(lastReport);
  dirty = true;
});

engine.addEventListener('statechange', (e) => {
  const state = e.detail;
  if (!engine.running) return;
  if (state === 'running') hideBanner('interrupted');
  else if (state === 'suspended' || state === 'interrupted') showBanner('interrupted');
});

// iOS suspends audio on interruptions; a tap may resume it.
document.addEventListener('pointerdown', () => {
  if (engine.running && engine.ctx?.state !== 'running') engine.resume();
});

let wakeLock = null;
async function requestWakeLock() {
  if (!settings.wakeLock || !engine.running || wakeLock || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null;
  }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && engine.running) {
    engine.resume();
    requestWakeLock();
  }
});

// ------------------------------------------------------------ rendering

function renderReadout() {
  const w = settings.weighting;
  const tw = settings.time;
  ui.lvlName.textContent = `L${w}${tw}`;
  ui.lvlUnit.textContent = w;
  const level = lastReport ? spl(msToDb(lastReport[w][tw])) : NaN;
  ui.lvlValue.textContent = Number.isFinite(level) ? fmtNum(level) : fmtNum(10).replace(/\d/g, '-');
  ui.readoutCard.dataset.zone = zoneFor(level, settings);
  levelBar.update(level, spl(session.max(w, tw)));
}

function renderStats() {
  const w = settings.weighting;
  const tw = settings.time;
  ui.stLeqLabel.textContent = `L${w}eq`;
  ui.stMaxLabel.textContent = `L${w}${tw}max`;
  ui.stMinLabel.textContent = `L${w}${tw}min`;
  ui.stLeq.textContent = dbText(spl(session.leq(w)));
  ui.stMax.textContent = dbText(spl(session.max(w, tw)));
  ui.stMin.textContent = dbText(spl(session.min(w, tw)));
  ui.stPeak.textContent = dbText(spl(session.peak('C')));
  ui.stDuration.textContent = fmtDuration(session.seconds);
}

const LEQ_COLUMN = { A: 4, C: 5, Z: 6 };

function renderHistory() {
  const w = settings.weighting;
  const common = {
    leq: spl(session.leq(w)),
    leqLabel: `L${w}eq`,
    warn: settings.warn,
    danger: settings.danger,
  };
  if (settings.range === 'all') {
    const col = LEQ_COLUMN[w];
    const values = session.rows.map((row) => row[col] + offset());
    historyChart.draw({ ...common, values, step: 1, span: Math.max(60, values.length), mode: 'all' });
  } else {
    const span = Number(settings.range);
    const values = ringSeries(w, settings.time, span * 10, offset());
    historyChart.draw({ ...common, values, step: 0.1, span, mode: 'recent' });
  }
}

function renderSession() {
  const s = session.summary(offset());
  const unit = (w) => ` dB(${w})`;
  const items = [
    ['LAeq', dbText(s.LAeq) + unit('A')],
    ['LCeq', dbText(s.LCeq) + unit('C')],
    ['LAFmax', dbText(s.LAFmax) + unit('A')],
    ['LAFmin', dbText(s.LAFmin) + unit('A')],
    ['LCpeak', dbText(s.LCpeak) + unit('C')],
    ['LA10', dbText(s.LA10) + unit('A')],
    ['LA50', dbText(s.LA50) + unit('A')],
    ['LA90', dbText(s.LA90) + unit('A')],
    [t('sumDose'), `${fmtNum(s.dose, s.dose < 10 ? 2 : 1)} %`],
    [t('sumDose8h'), `${fmtNum(s.dose8h, s.dose8h < 10 ? 2 : 0)} %`],
    [t('sumStart'), fmtDateTime(s.startedAt)],
    [t('sumDuration'), fmtDuration(s.seconds)],
    [t('sumCalibration'), `${fmtNum(offset())} dB · ${t(calibration.calibrated ? 'calibrated' : 'uncalibrated')}`],
  ];
  const frag = document.createDocumentFragment();
  for (const [label, value] of items) {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    div.append(dt, dd);
    frag.append(div);
  }
  ui.sessSummary.replaceChildren(frag);
  ui.sessStatus.textContent = !session.hasData
    ? t('sessEmpty')
    : t(engine.running ? 'sessRunning' : 'sessStopped');
}

function renderSaved() {
  const list = loadHistory();
  ui.savedEmpty.hidden = list.length > 0;
  const frag = document.createDocumentFragment();
  for (const entry of list) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'saved-info';
    const title = document.createElement('strong');
    title.textContent = fmtDateTime(entry.startedAt);
    const meta = document.createElement('span');
    meta.className = 'muted small';
    const s = entry.summary || {};
    meta.textContent = `${fmtDuration(s.seconds || 0)} · LAeq ${dbText(s.LAeq)} dB · LAFmax ${dbText(s.LAFmax)} dB` +
      (entry.calibrated ? '' : ` · ${t('uncalibrated')}`);
    info.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'saved-actions';
    const csv = document.createElement('button');
    csv.type = 'button';
    csv.className = 'btn btn-small';
    csv.textContent = t('csv');
    csv.addEventListener('click', () => {
      if (!entry.rows?.length) { toast(t('toastNoRows')); return; }
      deliverFile(rowsToCsv(entry.rows, getLanguage()), csvFilename(entry.startedAt));
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-small btn-ghost';
    del.textContent = t('delete');
    del.addEventListener('click', () => {
      if (!confirm(t('deleteConfirm'))) return;
      deleteFromHistory(entry.id);
      renderSaved();
    });
    actions.append(csv, del);
    li.append(info, actions);
    frag.append(li);
  }
  ui.savedList.replaceChildren(frag);
}

function renderCalibration() {
  const calibrated = calibration.calibrated;
  ui.badge.textContent = demo ? t('demo', { signal: '' }).replace(/:\s*$/, '') : t(calibrated ? 'calibrated' : 'uncalibrated');
  ui.badge.dataset.state = demo ? 'demo' : calibrated ? 'ok' : 'warn';
  ui.calOffset.textContent = `${fmtNum(calibration.offset)} dB`;
  ui.calRefUnit.textContent = `dB(${settings.weighting})`;
  if (!ui.calRun.disabled) {
    ui.calStatus.textContent = calibrated && calibration.date
      ? t('calStatusSaved', { date: fmtDateTime(Date.parse(calibration.date)) })
      : t('calStatusDefault');
  }
}

function renderDemoBadge() {
  if (!demo) return;
  ui.demoBadge.hidden = false;
  const signal = demo.type === 'noise' ? t('whiteNoise') : fmtFrequency(demo.frequency);
  ui.demoBadge.textContent = `${t('demo', { signal })}, ${fmtNum(demo.level)} dBFS`;
}

function renderSpectrumOptions() {
  ui.specWeightLabel.textContent = t('applyWeighting', { w: settings.weighting });
  const spectro = settings.specMode === 'spectrogram';
  ui.peakHoldWrap.hidden = spectro;
  ui.peakReset.hidden = spectro;
}

// Spectrum buffers, re-allocated when the FFT size changes.
let bins = null;
let binsSpl = null;
let bandsSpl = null;
let lastDomUpdate = 0;

function renderSpectrum(now) {
  const yMax = Math.ceil(offset() / 10) * 10;
  const sr = engine.sampleRate;
  const count = engine.binCount;
  let have = false;
  if (engine.running) {
    if (!bins || bins.length !== count) {
      bins = new Float32Array(count);
      binsSpl = new Float32Array(count);
    }
    have = engine.getSpectrum(bins);
  }
  if (have) {
    const curve = settings.specWeight && settings.weighting !== 'Z' ? weightingCurve(settings.weighting, count, sr) : null;
    const o = offset();
    for (let k = 0; k < count; k++) binsSpl[k] = bins[k] + o + (curve ? curve[k] : 0);
  }
  const data = have ? binsSpl : null;
  if (settings.specMode === 'fft') {
    spectrumView.drawFft(data, sr, { yMax, peakHold: settings.peakHold });
  } else if (settings.specMode === 'bands') {
    bandsSpl = data ? bandLevels(data, sr, bandsSpl || undefined) : null;
    spectrumView.drawBands(bandsSpl, { yMax, peakHold: settings.peakHold });
  } else {
    spectrogram.render(data, count, sr, yMax);
  }
  if (data && now - lastDomUpdate > 250) {
    lastDomUpdate = now;
    const dom = dominantFrequency(data, sr);
    ui.specDom.textContent = dom ? `${fmtFrequency(dom.frequency)} · ${fmtNum(dom.level)} dB` : '–';
  } else if (!engine.running) {
    ui.specDom.textContent = '–';
  }
}

function renderAll() {
  renderReadout();
  renderStats();
  if (currentTab === 'meter') renderHistory();
  if (currentTab === 'session') renderSession();
  if (currentTab === 'spectrum') renderSpectrum(performance.now());
}

let lastSessionRender = 0;
function loop(now = performance.now()) {
  cancelAnimationFrame(rafId);
  if (!engine.running) return;
  if (dirty) {
    dirty = false;
    renderReadout();
    renderStats();
    if (currentTab === 'meter') renderHistory();
    if (currentTab === 'session' && now - lastSessionRender > 1000) {
      lastSessionRender = now;
      renderSession();
    }
  }
  if (currentTab === 'spectrum') renderSpectrum(now);
  rafId = requestAnimationFrame(loop);
}

// ------------------------------------------------------------ tabs

function switchTab(name) {
  currentTab = name;
  settings.tab = name;
  saveSettings();
  for (const view of document.querySelectorAll('.view')) view.hidden = view.dataset.view !== name;
  for (const tab of document.querySelectorAll('.tabbar [role=tab]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  }
  if (name === 'session') renderSaved();
  // The analyser's smoothing still holds old data; let it settle before
  // showing the dominant frequency.
  if (name === 'spectrum') lastDomUpdate = performance.now();
  renderAll();
}

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) switchTab(tab.dataset.tab);
});

// ------------------------------------------------------------ meter controls

ui.start.addEventListener('click', () => (engine.running ? stop() : start()));
$('banner-close').addEventListener('click', () => hideBanner());

bindSeg($('seg-weighting'), settings.weighting, (v) => {
  settings.weighting = v;
  saveSettings();
  renderSpectrumOptions();
  renderCalibration();
  renderAll();
});
bindSeg($('seg-time'), settings.time, (v) => {
  settings.time = v;
  saveSettings();
  renderAll();
});
bindSeg($('seg-range'), settings.range, (v) => {
  settings.range = v;
  saveSettings();
  renderHistory();
});

function newMeasurement() {
  session.reset();
  if (!engine.running) lastReport = null;
  renderAll();
  renderStartButton();
}
$('btn-reset').addEventListener('click', newMeasurement);

// ------------------------------------------------------------ spectrum controls

bindSeg($('seg-spec'), settings.specMode, (v) => {
  settings.specMode = v;
  saveSettings();
  renderSpectrumOptions();
  renderSpectrum(performance.now());
});
$('opt-specweight').checked = settings.specWeight;
$('opt-specweight').addEventListener('change', (e) => {
  settings.specWeight = e.target.checked;
  saveSettings();
  spectrumView.resetPeak();
  renderSpectrum(performance.now());
});
$('opt-peakhold').checked = settings.peakHold;
$('opt-peakhold').addEventListener('change', (e) => {
  settings.peakHold = e.target.checked;
  saveSettings();
  spectrumView.resetPeak();
  renderSpectrum(performance.now());
});
ui.peakReset.addEventListener('click', () => {
  spectrumView.resetPeak();
  renderSpectrum(performance.now());
});

// ------------------------------------------------------------ session controls

function summaryText() {
  const s = session.summary(offset());
  const lines = [
    `Open Noise Meter – ${fmtDateTime(s.startedAt)}`,
    `${t('sumDuration')}: ${fmtDuration(s.seconds)}`,
    `LAeq: ${dbText(s.LAeq)} dB(A)`,
    `LCeq: ${dbText(s.LCeq)} dB(C)`,
    `LAFmax: ${dbText(s.LAFmax)} dB(A)`,
    `LAFmin: ${dbText(s.LAFmin)} dB(A)`,
    `LCpeak: ${dbText(s.LCpeak)} dB(C)`,
    `LA10 / LA50 / LA90: ${dbText(s.LA10)} / ${dbText(s.LA50)} / ${dbText(s.LA90)} dB(A)`,
    `${t('sumDose')}: ${fmtNum(s.dose, 2)} % (${t('sumDose8h')}: ${fmtNum(s.dose8h, 0)} %)`,
    `${t('sumCalibration')}: ${fmtNum(offset())} dB, ${t(calibration.calibrated ? 'calibrated' : 'uncalibrated')}`,
  ];
  return lines.join('\n');
}

$('btn-export').addEventListener('click', () => {
  if (!session.rows.length) { toast(t('toastNoData')); return; }
  deliverFile(rowsToCsv(session.rowsSpl(offset()), getLanguage()), csvFilename(session.startedAt));
});

$('btn-copy').addEventListener('click', async () => {
  if (!session.hasData) { toast(t('toastNoData')); return; }
  try {
    await navigator.clipboard.writeText(summaryText());
    toast(t('toastCopied'));
  } catch {
    toast(t('toastCopyFailed'));
  }
});

$('btn-save').addEventListener('click', () => {
  if (!session.hasData) { toast(t('toastNoData')); return; }
  const result = saveToHistory(session, calibration);
  toast(t(result === 'ok' ? 'toastSaved' : result === 'summary-only' ? 'toastSummaryOnly' : 'toastSaveFailed'));
  renderSaved();
});

$('btn-new').addEventListener('click', () => {
  if (session.hasData && !confirm(t('newConfirm'))) return;
  newMeasurement();
});

// ------------------------------------------------------------ calibration

ui.badge.addEventListener('click', () => {
  switchTab('settings');
  $('view-settings').scrollIntoView({ block: 'start' });
});
$('cal-minus').addEventListener('click', () => calibration.adjust(-0.5));
$('cal-plus').addEventListener('click', () => calibration.adjust(0.5));
$('cal-reset').addEventListener('click', () => calibration.reset());
calibration.addEventListener('change', () => {
  renderCalibration();
  dirty = true;
  renderAll();
});

ui.calRun.addEventListener('click', async () => {
  const ref = Number.parseFloat(String(ui.calRef.value).replace(',', '.'));
  if (!Number.isFinite(ref) || ref < 20 || ref > 140) {
    ui.calStatus.textContent = t('calInvalidRef');
    return;
  }
  if (!engine.running) await start();
  if (!engine.running) return;
  ui.calRun.disabled = true;
  ui.calProgress.hidden = false;
  const fill = ui.calProgress.firstElementChild;
  try {
    const dbfs = await measureLevel(engine, settings.weighting, 5, (p) => {
      fill.style.width = `${Math.round(p * 100)}%`;
      ui.calStatus.textContent = t('calMeasuring', { p: Math.round(p * 100) });
    });
    if (!Number.isFinite(dbfs) || dbfs < -110) {
      ui.calStatus.textContent = t('calTooQuiet');
    } else {
      calibration.set(ref - dbfs, true);
      ui.calStatus.textContent = t('calDone', { o: fmtNum(calibration.offset) });
    }
  } catch {
    ui.calStatus.textContent = t('calFailed');
  } finally {
    ui.calRun.disabled = false;
    ui.calProgress.hidden = true;
    fill.style.width = '0';
  }
});

// ------------------------------------------------------------ settings

function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  invalidateThemeColors();
}

function applyLanguage() {
  setLanguage(resolveLanguage(settings.lang));
  applyTranslations();
  renderStartButton();
  renderCalibration();
  renderDemoBadge();
  renderSpectrumOptions();
  renderSaved();
  renderAll();
}

const langSelect = $('set-lang');
langSelect.value = settings.lang;
langSelect.addEventListener('change', () => {
  settings.lang = langSelect.value;
  saveSettings();
  applyLanguage();
});

const themeSelect = $('set-theme');
themeSelect.value = settings.theme;
themeSelect.addEventListener('change', () => {
  settings.theme = themeSelect.value;
  saveSettings();
  applyTheme();
  renderAll();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  invalidateThemeColors();
  renderAll();
});

const warnInput = $('set-warn');
const dangerInput = $('set-danger');
warnInput.value = settings.warn;
dangerInput.value = settings.danger;
function updateThresholds() {
  const warn = Math.round(Number(warnInput.value));
  const danger = Math.round(Number(dangerInput.value));
  if (Number.isFinite(warn) && warn >= 30 && warn <= 130) settings.warn = warn;
  if (Number.isFinite(danger) && danger >= 30 && danger <= 140) settings.danger = danger;
  if (settings.danger <= settings.warn) settings.danger = settings.warn + 1;
  warnInput.value = settings.warn;
  dangerInput.value = settings.danger;
  saveSettings();
  levelBar.setThresholds(settings);
  renderAll();
}
warnInput.addEventListener('change', updateThresholds);
dangerInput.addEventListener('change', updateThresholds);

const fftSelect = $('set-fft');
fftSelect.value = String(settings.fftSize);
fftSelect.addEventListener('change', () => {
  settings.fftSize = Number(fftSelect.value);
  saveSettings();
  engine.setFftSize(settings.fftSize);
  spectrumView.resetPeak();
});

const wakeInput = $('set-wakelock');
wakeInput.checked = settings.wakeLock;
wakeInput.addEventListener('change', () => {
  settings.wakeLock = wakeInput.checked;
  saveSettings();
  if (settings.wakeLock) requestWakeLock(); else releaseWakeLock();
});

// ------------------------------------------------------------ misc

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderAll, 100);
});

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
  e.preventDefault();
  if (engine.running) stop(); else start();
});

$('app-version').textContent = VERSION;
$('repo-link').href = REPO_URL;

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ------------------------------------------------------------ init

engine.setFftSize(settings.fftSize);
levelBar.setThresholds(settings);
applyTheme();
applyLanguage();
switchTab(['meter', 'spectrum', 'session', 'settings'].includes(settings.tab) ? settings.tab : 'meter');
