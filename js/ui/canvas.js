// Shared canvas helpers: HiDPI sizing and theme colours from CSS variables.

export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height, dpr };
}

let cached = null;

export function themeColors() {
  if (cached) return cached;
  const style = getComputedStyle(document.documentElement);
  const v = (name) => style.getPropertyValue(name).trim();
  cached = {
    text: v('--text'),
    muted: v('--muted'),
    grid: v('--grid'),
    accent: v('--accent'),
    accentFill: v('--accent-fill'),
    ok: v('--ok'),
    warn: v('--warn'),
    bad: v('--bad'),
    surface: v('--surface'),
    font: `11px ${getComputedStyle(document.body).fontFamily}`,
  };
  return cached;
}

export function invalidateThemeColors() {
  cached = null;
}

/** Nice round axis range in 10 dB steps around the given values. */
export function niceRange(min, max, minSpan = 40) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [30, 100];
  let lo = Math.floor((min - 3) / 10) * 10;
  let hi = Math.ceil((max + 3) / 10) * 10;
  while (hi - lo < minSpan) {
    lo -= 5;
    hi += 5;
  }
  return [Math.floor(lo / 10) * 10, Math.ceil(hi / 10) * 10];
}

// Log frequency axis between 20 Hz and fMax.
export const F_MIN = 20;

export function freqToX(f, left, width, fMax) {
  return left + (Math.log(f / F_MIN) / Math.log(fMax / F_MIN)) * width;
}

export const FREQ_TICKS = [
  [50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1k'],
  [2000, '2k'], [5000, '5k'], [10000, '10k'], [20000, '20k'],
];
