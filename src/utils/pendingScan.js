// Keeps the scan in progress on this device (the compressed picture, the note and the reading),
// so an error, a reload or leaving the page never means choosing the picture again.
// Stored in IndexedDB in this browser only; cleared once the lines are saved or the picture is removed.
const DB = 'finance-scan', STORE = 'pending', KEY = 'current', MAX_AGE = 14 * 864e5;

function open() {
  return new Promise((ok, no) => {
    if (typeof indexedDB === 'undefined') return no(new Error('no storage'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((ok, no) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = () => no(tx.error);
    });
  } finally { db.close(); }
}

export async function loadPending() {
  try {
    const v = await run('readonly', (s) => s.get(KEY));
    if (!v || !v.image || Date.now() - (v.savedAt || 0) > MAX_AGE) return null;
    return v;
  } catch { return null; }
}

export async function savePending(value) {
  try { await run('readwrite', (s) => s.put({ ...value, savedAt: Date.now() }, KEY)); } catch { /* storage off: the scan still works, it just is not kept */ }
}

export async function clearPending() {
  try { await run('readwrite', (s) => s.delete(KEY)); } catch { /* nothing to clear */ }
}
