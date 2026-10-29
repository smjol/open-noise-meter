// German and English UI texts. Static elements carry data-i18n (text),
// data-i18n-html (markup) or data-i18n-aria (aria-label) attributes.

const STRINGS = {
  de: {
    start: 'Start',
    stop: 'Stopp',
    close: 'Schließen',
    tapStart: 'Tippe auf Start, um zu messen',
    frequencyWeighting: 'Frequenzbewertung',
    timeWeighting: 'Zeitbewertung',
    fast: 'Fast',
    slow: 'Slow',
    impulse: 'Impulse',
    duration: 'Dauer',
    reset: 'Zurücksetzen',
    history: 'Verlauf',
    rangeAll: 'Messung',
    historyAria: 'Pegelverlauf',
    thirdOctave: 'Terz',
    spectrogram: 'Spektrogramm',
    dominant: 'Dominante Frequenz',
    spectrumAria: 'Frequenzspektrum',
    peakHold: 'Peak-Hold',
    resetPeak: 'Peak zurücksetzen',
    applyWeighting: 'dB({w}) anwenden',
    spectrumNote: 'Pegel pro Frequenzlinie bzw. Terzband. Tiefe Terzbänder sind durch die FFT-Auflösung nur grob.',
    currentMeasurement: 'Aktuelle Messung',
    exportCsv: 'CSV exportieren',
    copySummary: 'Zusammenfassung kopieren',
    save: 'Speichern',
    newMeasurement: 'Neue Messung',
    savedMeasurements: 'Gespeicherte Messungen',
    noSaved: 'Noch keine gespeicherten Messungen.',
    savedNote: 'Gespeichert wird nur in diesem Browser auf diesem Gerät.',
    calibration: 'Kalibrierung',
    calibrationIntro: 'Handy-Mikrofone unterscheiden sich um mehrere dB. Vergleiche einmal mit einem Referenz-Messgerät (oder einer kalibrierten App auf demselben Gerät) bei einem gleichmäßigen Geräusch und übernimm den Wert.',
    offset: 'Offset',
    referenceLevel: 'Referenzpegel',
    calibrateNow: '5 s messen & übernehmen',
    calibrationReset: 'Auf Standard zurücksetzen',
    display: 'Anzeige',
    language: 'Sprache',
    auto: 'Automatisch',
    theme: 'Design',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    thresholds: 'Farbschwellen',
    warnFrom: 'gelb ab',
    dangerFrom: 'rot ab',
    fftSize: 'FFT-Größe',
    keepAwake: 'Bildschirm während der Messung anlassen',
    about: 'Über diese App',
    version: 'Version',
    license: 'MIT-Lizenz',
    tabMeter: 'Pegel',
    tabSpectrum: 'Spektrum',
    tabSession: 'Messung',
    tabSettings: 'Einstellungen',

    uncalibrated: 'unkalibriert',
    calibrated: 'kalibriert',
    demo: 'Demo: {signal}',
    whiteNoise: 'Rauschen',
    sessRunning: 'läuft',
    sessStopped: 'gestoppt',
    sessEmpty: 'noch keine Daten',
    sumStart: 'Beginn',
    sumDuration: 'Dauer',
    sumDose: 'Lärmdosis',
    sumDose8h: 'Dosis bei 8 h',
    sumCalibration: 'Kalibrierung',
    csv: 'CSV',
    delete: 'Löschen',
    deleteConfirm: 'Diese Messung löschen?',
    newConfirm: 'Aktuelle Messung verwerfen und neu beginnen?',
    toastSaved: 'Messung gespeichert',
    toastSummaryOnly: 'Speicher voll – nur die Zusammenfassung wurde gespeichert',
    toastSaveFailed: 'Speichern nicht möglich (Browser-Speicher nicht verfügbar)',
    toastCopied: 'Zusammenfassung kopiert',
    toastCopyFailed: 'Kopieren nicht möglich',
    toastNoData: 'Noch keine Messdaten',
    toastNoRows: 'Für diese Messung gibt es keinen Sekundenverlauf',
    calMeasuring: 'Messe … {p} %',
    calDone: 'Offset auf {o} dB gesetzt',
    calFailed: 'Kalibrierung abgebrochen',
    calInvalidRef: 'Bitte einen Referenzpegel zwischen 20 und 140 dB eingeben',
    calStatusSaved: 'Kalibriert am {date}',
    calStatusDefault: 'Standardwert – noch nicht kalibriert',
    calTooQuiet: 'Signal zu leise für eine Kalibrierung',
    interrupted: 'Audio wurde unterbrochen. Tippe auf die Seite, um weiterzumessen.',
    err_denied: 'Kein Zugriff auf das Mikrofon. Bitte in den Browser-Einstellungen erlauben und erneut starten.',
    err_insecure: 'Das Mikrofon ist nur über HTTPS verfügbar.',
    'err_no-mic': 'Kein Mikrofon gefunden.',
    'err_no-audio': 'Dieser Browser unterstützt die Web Audio API nicht.',
    'err_no-worklet': 'Dieser Browser ist zu alt (AudioWorklet fehlt). Bitte aktualisieren.',
    err_failed: 'Audio konnte nicht gestartet werden.',
    infoBody: `
      <p>Open Noise Meter misst den Schalldruckpegel mit dem Mikrofon deines Geräts. Die Audiodaten werden nur lokal im Browser verarbeitet und nirgendwohin gesendet.</p>
      <dl class="glossary">
        <dt>dB(A), dB(C), dB(Z)</dt>
        <dd>Frequenzbewertung. A entspricht grob dem menschlichen Hörempfinden und ist Standard bei Lärmmessungen. C bezieht tiefe Frequenzen stärker ein und wird für Spitzenpegel genutzt. Z ist ungewichtet.</dd>
        <dt>Fast, Slow, Impulse</dt>
        <dd>Zeitbewertung, also wie schnell die Anzeige reagiert: 125 ms, 1 s bzw. 35 ms Anstieg mit 1,5 s Abfall.</dd>
        <dt>Leq</dt>
        <dd>Energieäquivalenter Dauerschallpegel: der konstante Pegel mit derselben Schallenergie wie die gesamte Messung.</dd>
        <dt>Lmax, Lmin</dt>
        <dd>Höchster bzw. niedrigster zeitbewerteter Pegel seit Beginn der Messung.</dd>
        <dt>LCpeak</dt>
        <dd>Höchster Spitzenwert, C-bewertet und ohne Zeitbewertung. Wichtig für Gehörschutz (Grenzwert 137 dB(C)).</dd>
        <dt>L10, L50, L90</dt>
        <dd>Pegel, die in 10 %, 50 % bzw. 90 % der Zeit überschritten wurden. L90 beschreibt das Hintergrundgeräusch.</dd>
        <dt>Lärmdosis</dt>
        <dd>Anteil der zulässigen Tagesdosis von 85 dB(A) über 8 Stunden (3-dB-Regel).</dd>
      </dl>
      <p><strong>Hinweis:</strong> Ein Smartphone ist kein geeichtes Messgerät. Ohne Kalibrierung können die Werte um 5–10 dB abweichen, und bei sehr hohen Pegeln stößt das Mikrofon an seine Grenzen. Für verbindliche Messungen ein Schallpegelmessgerät der Klasse 1 oder 2 verwenden.</p>
      <p>Testmodus ohne Mikrofon: die Adresse mit <code>?demo=1000&amp;level=-20</code> (Sinuston, Frequenz in Hz, Pegel in dBFS) oder <code>?demo=noise</code> öffnen.</p>`,
  },
  en: {
    start: 'Start',
    stop: 'Stop',
    close: 'Close',
    tapStart: 'Tap Start to measure',
    frequencyWeighting: 'Frequency weighting',
    timeWeighting: 'Time weighting',
    fast: 'Fast',
    slow: 'Slow',
    impulse: 'Impulse',
    duration: 'Duration',
    reset: 'Reset',
    history: 'History',
    rangeAll: 'Session',
    historyAria: 'Level history',
    thirdOctave: '1/3 oct',
    spectrogram: 'Spectrogram',
    dominant: 'Dominant frequency',
    spectrumAria: 'Frequency spectrum',
    peakHold: 'Peak hold',
    resetPeak: 'Reset peak',
    applyWeighting: 'Apply dB({w})',
    spectrumNote: 'Level per frequency line or third-octave band. Low bands are coarse because of the FFT resolution.',
    currentMeasurement: 'Current measurement',
    exportCsv: 'Export CSV',
    copySummary: 'Copy summary',
    save: 'Save',
    newMeasurement: 'New measurement',
    savedMeasurements: 'Saved measurements',
    noSaved: 'No saved measurements yet.',
    savedNote: 'Measurements are stored only in this browser on this device.',
    calibration: 'Calibration',
    calibrationIntro: 'Phone microphones differ by several dB. Compare once against a reference meter (or a calibrated app on the same device) with a steady sound and apply the value.',
    offset: 'Offset',
    referenceLevel: 'Reference level',
    calibrateNow: 'Measure 5 s & apply',
    calibrationReset: 'Reset to default',
    display: 'Display',
    language: 'Language',
    auto: 'Automatic',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    thresholds: 'Colour thresholds',
    warnFrom: 'yellow from',
    dangerFrom: 'red from',
    fftSize: 'FFT size',
    keepAwake: 'Keep screen on while measuring',
    about: 'About',
    version: 'Version',
    license: 'MIT licence',
    tabMeter: 'Level',
    tabSpectrum: 'Spectrum',
    tabSession: 'Session',
    tabSettings: 'Settings',

    uncalibrated: 'uncalibrated',
    calibrated: 'calibrated',
    demo: 'Demo: {signal}',
    whiteNoise: 'noise',
    sessRunning: 'running',
    sessStopped: 'stopped',
    sessEmpty: 'no data yet',
    sumStart: 'Start',
    sumDuration: 'Duration',
    sumDose: 'Noise dose',
    sumDose8h: 'Dose over 8 h',
    sumCalibration: 'Calibration',
    csv: 'CSV',
    delete: 'Delete',
    deleteConfirm: 'Delete this measurement?',
    newConfirm: 'Discard the current measurement and start a new one?',
    toastSaved: 'Measurement saved',
    toastSummaryOnly: 'Storage full – only the summary was saved',
    toastSaveFailed: 'Could not save (browser storage unavailable)',
    toastCopied: 'Summary copied',
    toastCopyFailed: 'Could not copy',
    toastNoData: 'No measurement data yet',
    toastNoRows: 'This measurement has no per-second log',
    calMeasuring: 'Measuring … {p} %',
    calDone: 'Offset set to {o} dB',
    calFailed: 'Calibration cancelled',
    calInvalidRef: 'Please enter a reference level between 20 and 140 dB',
    calStatusSaved: 'Calibrated on {date}',
    calStatusDefault: 'Default value – not calibrated yet',
    calTooQuiet: 'Signal too quiet to calibrate',
    interrupted: 'Audio was interrupted. Tap the page to continue measuring.',
    err_denied: 'Microphone access was denied. Allow it in the browser settings and start again.',
    err_insecure: 'The microphone is only available over HTTPS.',
    'err_no-mic': 'No microphone found.',
    'err_no-audio': 'This browser does not support the Web Audio API.',
    'err_no-worklet': 'This browser is too old (AudioWorklet missing). Please update it.',
    err_failed: 'Audio could not be started.',
    infoBody: `
      <p>Open Noise Meter measures sound pressure level with your device's microphone. Audio is processed locally in the browser and never sent anywhere.</p>
      <dl class="glossary">
        <dt>dB(A), dB(C), dB(Z)</dt>
        <dd>Frequency weighting. A roughly follows human hearing and is the standard for noise measurements. C includes more of the low frequencies and is used for peak levels. Z is unweighted.</dd>
        <dt>Fast, Slow, Impulse</dt>
        <dd>Time weighting, i.e. how quickly the reading reacts: 125 ms, 1 s, or 35 ms rise with 1.5 s decay.</dd>
        <dt>Leq</dt>
        <dd>Equivalent continuous sound level: the steady level with the same sound energy as the whole measurement.</dd>
        <dt>Lmax, Lmin</dt>
        <dd>Highest and lowest time-weighted level since the measurement started.</dd>
        <dt>LCpeak</dt>
        <dd>Highest peak value, C-weighted and without time weighting. Relevant for hearing protection (limit 137 dB(C)).</dd>
        <dt>L10, L50, L90</dt>
        <dd>Levels exceeded during 10 %, 50 % and 90 % of the time. L90 describes the background noise.</dd>
        <dt>Noise dose</dt>
        <dd>Share of the permitted daily dose of 85 dB(A) over 8 hours (3 dB exchange rate).</dd>
      </dl>
      <p><strong>Note:</strong> A smartphone is not a certified sound level meter. Without calibration, readings can be off by 5–10 dB, and the microphone saturates at very high levels. Use a class 1 or class 2 sound level meter for binding measurements.</p>
      <p>Test mode without a microphone: open the address with <code>?demo=1000&amp;level=-20</code> (sine tone, frequency in Hz, level in dBFS) or <code>?demo=noise</code>.</p>`,
  },
};

let lang = 'de';

export function resolveLanguage(setting) {
  if (setting === 'de' || setting === 'en') return setting;
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return preferred.some((l) => l.toLowerCase().startsWith('de')) ? 'de' : 'en';
}

export function setLanguage(value) {
  lang = STRINGS[value] ? value : 'en';
  document.documentElement.lang = lang;
  numberFormats.clear();
}

export function getLanguage() {
  return lang;
}

export function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  return s;
}

export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

const numberFormats = new Map();

export function fmtNum(value, digits = 1) {
  if (!Number.isFinite(value)) return '–';
  let f = numberFormats.get(digits);
  if (!f) {
    f = new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(digits, f);
  }
  return f.format(value);
}

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function fmtDateTime(ms) {
  if (!ms) return '–';
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
}

export function fmtFrequency(hz) {
  if (!Number.isFinite(hz)) return '–';
  return hz >= 1000 ? `${fmtNum(hz / 1000, 2)} kHz` : `${fmtNum(hz, hz < 100 ? 1 : 0)} Hz`;
}
