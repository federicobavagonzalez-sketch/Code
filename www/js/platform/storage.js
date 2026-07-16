// storage.js — persistencia. Capacitor Preferences con fallback a localStorage (browser).
// Cero red. Todo local.

const KEY = 'cage_save_v1';

function capPreferences() {
  const cap = globalThis.Capacitor;
  if (cap && cap.Plugins && cap.Plugins.Preferences) return cap.Plugins.Preferences;
  return null;
}

export async function saveGame(obj) {
  const json = JSON.stringify(obj);
  const pref = capPreferences();
  if (pref) { await pref.set({ key: KEY, value: json }); return; }
  try { localStorage.setItem(KEY, json); } catch (e) { /* almacenamiento lleno o no disponible */ }
}

export async function loadGame() {
  const pref = capPreferences();
  try {
    if (pref) { const { value } = await pref.get({ key: KEY }); return value ? JSON.parse(value) : null; }
    const v = localStorage.getItem(KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

export async function hasSave() {
  const pref = capPreferences();
  try {
    if (pref) { const { value } = await pref.get({ key: KEY }); return !!value; }
    return !!localStorage.getItem(KEY);
  } catch (e) { return false; }
}

export async function clearGame() {
  const pref = capPreferences();
  if (pref) { await pref.remove({ key: KEY }); return; }
  try { localStorage.removeItem(KEY); } catch (e) {}
}
