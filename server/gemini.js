// One place that calls Gemini, for screenshot reading and rate lookup.
// Model: GEMINI_MODEL if set, else Google's moving "flash latest" alias. If Google says a model is gone (404),
// the newest numbered flash model this key can use is picked from the models list and remembered.
// Failures become plain messages that say what went wrong and what to do. The key is never logged or returned.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
let model = process.env.GEMINI_MODEL || 'gemini-flash-latest';

function err(status, message) { const e = new Error(message); e.status = status; return e; }

// Newest "gemini-X.Y-flash" (no lite, tts, image or preview) that supports generateContent.
async function newestFlash(key) {
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  const names = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name).replace(/^models\//, '')).filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
  const v = (n) => Number(n.match(/^gemini-(\d+(?:\.\d+)?)/)[1]);
  names.sort((a, b) => v(b) - v(a));
  return names[0] || null;
}

// What to tell the person, by what Google answered. `what` is "read the screenshot" or "look up rates".
function explain(status, gmsg, what) {
  const m = String(gmsg || '').toLowerCase();
  if (status === 400 && /api key|api_key/.test(m)) return err(503, `Could not ${what}: Google did not accept the Gemini key. The owner can clear it and set a new one.`);
  if (status === 401 || status === 403) return err(503, `Could not ${what}: Google refused the Gemini key (it may be restricted or turned off). The owner can check it in Google AI Studio.`);
  if (status === 429) return err(429, `Could not ${what}: the Gemini usage limit was reached. Try again in a few minutes.`);
  if (status === 400 && /image|mime|inline|unsupported|file/.test(m)) return err(400, `Could not ${what}: Google could not open this file. Try a PNG or JPEG screenshot.`);
  if (status === 400 && /too large|size|payload/.test(m)) return err(413, `Could not ${what}: the file is too large. Try a smaller screenshot.`);
  if (status >= 500) return err(502, `Could not ${what}: Google's service had a problem. Try again in a minute.`);
  return err(502, `Could not ${what} (Google answered ${status}). Try again in a minute.`);
}

// When the main model is busy (503), fails on Google's side, or is too slow, the read moves to the lighter model.
const LIGHT = process.env.GEMINI_LIGHT_MODEL || 'gemini-flash-lite-latest';

// body: a generateContent request body. Returns the reply's text.
async function generate(key, body, { what, timeoutMs = 45000 } = {}) {
  let switched = false, last = null;
  const queue = [model, LIGHT].filter((m, i, a) => a.indexOf(m) === i);
  for (let i = 0; i < queue.length; i++) {
    const m = queue[i];
    let r;
    try {
      r = await fetch(`${BASE}/models/${m}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
      });
    } catch (e) {
      const slow = e.name === 'TimeoutError';
      console.error(`gemini ${what}: ${m} ${slow ? 'timed out' : e.message}`);
      last = slow ? err(504, `Could not ${what}: Google took too long. Try again in a minute.`)
        : err(502, `Could not ${what}: the server could not reach Google. Try again in a minute.`);
      continue;
    }
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const parts = j?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p.text || '').join('');
      if (!text) {
        const why = j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason || 'empty reply';
        console.error(`gemini ${what}: ${m} gave no text (${why})`);
        throw err(502, `Could not ${what}: Google returned nothing for this picture (${String(why).toLowerCase()}). Try another screenshot.`);
      }
      return text;
    }
    const gmsg = j?.error?.message || '';
    console.error(`gemini ${what}: ${m} answered ${r.status} ${String(gmsg).slice(0, 200)}`);
    if (r.status === 404 && m === model && !switched) {
      switched = true;
      const next = await newestFlash(key).catch(() => null);
      if (next && next !== model) { console.error(`gemini: switching model ${model} -> ${next}`); model = next; queue.splice(i + 1, 0, next); continue; }
    }
    last = explain(r.status, gmsg, what);
    if (r.status >= 500 || r.status === 404) {
      if (r.status === 503) last = err(503, `Could not ${what}: Google's Gemini service is busy right now. Try again in a few minutes.`);
      continue;
    }
    throw last;
  }
  throw last || err(502, `Could not ${what}. Try again in a minute.`);
}

module.exports = { generate, explain, newestFlash, currentModel: () => model, _setModel: (m) => { model = m; } };
