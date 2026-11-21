// A small key/value store in this browser (IndexedDB), for things kept on the device only:
// the scan in progress and the last figures loaded (so the app opens without a connection).
// Every call fails quietly: when the browser keeps nothing, the app still works, it just keeps nothing.
const DB = 'finance-local', STORE = 'kv';

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

export const getLocal = (key) => run('readonly', (s) => s.get(key)).catch(() => null);
export const setLocal = (key, value) => run('readwrite', (s) => s.put(value, key)).catch(() => {});
export const removeLocal = (key) => run('readwrite', (s) => s.delete(key)).catch(() => {});
