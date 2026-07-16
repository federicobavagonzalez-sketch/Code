// haptics.js — Capacitor Haptics con fallback (vibrate del browser, o no-op).
// Se usa en golpes conectados y en el KO.

function capHaptics() {
  const cap = globalThis.Capacitor;
  if (cap && cap.Plugins && cap.Plugins.Haptics) return cap.Plugins.Haptics;
  return null;
}

export function hitLight() {
  const h = capHaptics();
  if (h) { h.impact({ style: 'LIGHT' }).catch(() => {}); return; }
  if (navigator.vibrate) navigator.vibrate(12);
}

export function hitHeavy() {
  const h = capHaptics();
  if (h) { h.impact({ style: 'MEDIUM' }).catch(() => {}); return; }
  if (navigator.vibrate) navigator.vibrate(28);
}

export function ko() {
  const h = capHaptics();
  if (h) { h.impact({ style: 'HEAVY' }).catch(() => {}); return; }
  if (navigator.vibrate) navigator.vibrate([40, 30, 90]);
}
