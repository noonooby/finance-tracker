// The Gemini key, set once from the app by the owner and kept on the server only.
// It lives in its own file next to the database (mode 600), so it survives restarts and redeploys,
// and is not inside finance.db, which the nightly backup copies unencrypted.
// GEMINI_API_KEY in .env counts as set too. No endpoint or log ever returns the key or any part of it.
// To clear it (for example after revoking the key): delete gemini.key in the data folder and restart the app.
const fs = require('node:fs');
const path = require('node:path');

const file = () => path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, 'finance.db')), 'gemini.key');

function get() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try { return fs.readFileSync(file(), 'utf8').trim() || null; } catch { return null; }
}
const isSet = () => !!get();

// Who may set it: everyone in ALLOWED_EMAILS when that is set; otherwise only the first account that signed in.
function mayManage(db, user) {
  const allowed = String(process.env.ALLOWED_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length) return allowed.includes(String(user.email).toLowerCase());
  const first = db.prepare('SELECT id FROM users ORDER BY created_at, rowid LIMIT 1').get();
  return !!first && first.id === user.id;
}

// One cheap call (list one model) to check the key works before it is kept.
async function check(key) {
  if (process.env.GEMINI_CHECK_STUB) return key === process.env.GEMINI_CHECK_STUB;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
    return r.ok;
  } catch { return false; }
}

// -> throws { status, message } on refusal; never echoes the key.
async function set(db, user, key, fail) {
  if (!mayManage(db, user)) fail(403, 'Only the owner of this app can set the Gemini key.');
  if (isSet()) fail(409, 'The Gemini key is already set. It can only be changed on the server.');
  const k = String(key || '').trim();
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(k)) fail(400, 'That does not look like a Gemini key.');
  if (!(await check(k))) fail(400, 'Google did not accept that key. Check it and try again.');
  if (isSet()) fail(409, 'The Gemini key is already set. It can only be changed on the server.');
  try { fs.writeFileSync(file(), k, { mode: 0o600, flag: 'wx' }); } catch { fail(409, 'The Gemini key is already set. It can only be changed on the server.'); }
  return { ok: true };
}

module.exports = { get, isSet, mayManage, set };
