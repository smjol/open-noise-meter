// Horizontal level bar with colour zones and a max marker.

export const BAR_MIN = 20;
export const BAR_MAX = 130;

export function zoneFor(level, thresholds) {
  if (!Number.isFinite(level)) return 'idle';
  if (level >= thresholds.danger) return 'bad';
  if (level >= thresholds.warn) return 'warn';
  return 'ok';
}

function toPercent(level) {
  return Math.max(0, Math.min(1, (level - BAR_MIN) / (BAR_MAX - BAR_MIN))) * 100;
}

export class LevelBar {
  constructor(root) {
    this.root = root;
    this.fill = root.querySelector('.levelbar-fill');
    this.maxMark = root.querySelector('.levelbar-max');
    const scale = root.querySelector('.levelbar-scale');
    for (let db = BAR_MIN; db <= BAR_MAX; db += 10) {
      const tick = document.createElement('span');
      tick.textContent = db;
      tick.style.left = `${toPercent(db)}%`;
      if ((db - BAR_MIN) % 20 !== 0) tick.className = 'minor';
      scale.append(tick);
    }
  }

  setThresholds({ warn, danger }) {
    this.root.style.setProperty('--warn-pos', `${toPercent(warn)}%`);
    this.root.style.setProperty('--bad-pos', `${toPercent(danger)}%`);
  }

  update(level, max) {
    this.root.style.setProperty('--level', `${Number.isFinite(level) ? toPercent(level) : 0}%`);
    if (Number.isFinite(max)) {
      this.maxMark.hidden = false;
      this.maxMark.style.left = `${toPercent(max)}%`;
    } else {
      this.maxMark.hidden = true;
    }
  }
}
