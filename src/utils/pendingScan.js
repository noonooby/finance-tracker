// Keeps the scan in progress on this device (the compressed picture, the note and the reading),
// so an error, a reload or leaving the page never means choosing the picture again.
// Kept in this browser only; cleared once the lines are saved or the picture is removed, and dropped after 14 days.
import { getLocal, setLocal, removeLocal } from './localStore';

const KEY = 'scan', MAX_AGE = 14 * 864e5;

// A scan kept by the earlier version of this file (its own database), read once so it is not lost.
function legacy() {
  return new Promise((ok) => {
    try {
      const r = indexedDB.open('finance-scan', 1);
      r.onupgradeneeded = () => { r.transaction.abort(); ok(null); };
      r.onerror = () => ok(null);
      r.onsuccess = () => { const db = r.result; try { const g = db.transaction('pending').objectStore('pending').get('current'); g.onsuccess = () => { db.close(); ok(g.result || null); }; g.onerror = () => { db.close(); ok(null); }; } catch { db.close(); ok(null); } };
    } catch { ok(null); }
  });
}

export async function loadPending() {
  const v = (await getLocal(KEY)) || (await legacy());
  return v && v.image && Date.now() - (v.savedAt || 0) <= MAX_AGE ? v : null;
}
export const savePending = (value) => setLocal(KEY, { ...value, savedAt: Date.now() });
export const clearPending = () => removeLocal(KEY);
