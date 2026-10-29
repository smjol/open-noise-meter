// localStorage wrapper. Storage can be unavailable (private mode, blocked
// site data) or full, so every access is guarded and failures are reported
// to the caller instead of throwing.

const PREFIX = 'onm.';

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Returns true on success, false if the data could not be stored. */
export function saveJson(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
