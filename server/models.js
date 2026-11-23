// Which service reads a picture or answers a question, in order: Claude, then Gemini, then Hugging Face.
// Each is used only when its key is on the server; when one fails or is busy the next is tried.
// The keys live in files next to the database (mode 600): claude.key, gemini.key (see keystore.js), hf.key.
// No endpoint or log ever returns a key or any part of one.
const fs = require('node:fs');
const path = require('node:path');

const dir = () => path.dirname(process.env.DB_PATH || path.join(__dirname, 'finance.db'));
const fileText = (name) => { try { return fs.readFileSync(path.join(dir(), name), 'utf8').trim() || null; } catch { return null; } };
const claudeKey = () => fileText('claude.key');
const hfToken = () => fileText('hf.key');
const geminiKey = () => require('./keystore').get();
const ready = () => !!(claudeKey() || geminiKey() || hfToken());

const err = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const skip = (why) => Object.assign(new Error(why), { skip: true });
const wantsJson = (body) => !!(body.generationConfig && body.generationConfig.responseMimeType === 'application/json');
const parts = (body) => (body.contents || []).flatMap((c) => c.parts || []);
// A reply that should be JSON, with anything written around the object removed.
const onlyJson = (text) => { const a = text.indexOf('{'), b = text.lastIndexOf('}'); return a >= 0 && b > a ? text.slice(a, b + 1) : text; };

// ---------- Claude ----------
const CLAUDE_MODEL = 'claude-opus-5-5';
const CLAUDE_IMAGES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
// What Claude has cost this calendar month, and the most it may cost (claude.cap in the data folder, or 50 dollars).
const month = () => new Date().toISOString().slice(0, 7);
const spent = () => { try { const j = JSON.parse(fileText('claude.spend') || '{}'); return j.month === month() ? Number(j.usd) || 0 : 0; } catch { return 0; } };
const cap = () => { const n = Number(fileText('claude.cap') || process.env.CLAUDE_CAP_USD); return Number.isFinite(n) && n >= 0 ? n : 50; };
const addSpend = (usd) => { try { fs.writeFileSync(path.join(dir(), 'claude.spend'), JSON.stringify({ month: month(), usd: Math.round((spent() + usd) * 10000) / 10000 }), { mode: 0o600 }); } catch { /* the count is a guard, not a record */ } };

// The request in Claude's shape: pictures and PDFs first, then the words. null when Claude cannot take a part.
function toClaude(body) {
  const files = [], words = [];
  for (const p of parts(body)) {
    if (p.text) words.push(p.text);
    else if (p.inline_data) {
      const { mime_type: mime, data } = p.inline_data;
      if (CLAUDE_IMAGES.has(mime)) files.push({ type: 'image', source: { type: 'base64', media_type: mime, data } });
      else if (mime === 'application/pdf') files.push({ type: 'document', source: { type: 'base64', media_type: mime, data } });
      else return null;
    }
  }
  const text = words.join('\n\n') + (wantsJson(body) ? '\n\nReply with the JSON object only, with no other text before or after it.' : '');
  return [...files, { type: 'text', text }];
}

let claudeSend = async (key, content) => {
  const sdk = require('@anthropic-ai/sdk');
  const Anthropic = sdk.default || sdk;
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 180000 });
  try {
    // Streamed so a long statement is not cut off by a timeout. A request Claude's safeguards decline is passed to
    // the fallback model on Anthropic's side.
    return await client.beta.messages.stream({
      model: CLAUDE_MODEL, max_tokens: 32000, output_config: { effort: 'high' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      messages: [{ role: 'user', content }],
    }).finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw err(503, 'Claude did not accept its key.', { why: 'key refused' });
    if (e instanceof Anthropic.RateLimitError) throw err(503, 'Claude is busy.', { why: 'rate limited' });
    if (e instanceof Anthropic.BadRequestError) throw err(502, 'Claude could not take this file.', { why: `bad request: ${String(e.message).slice(0, 160)}` });
    if (e instanceof Anthropic.APIError) throw err(502, 'Claude did not answer.', { why: `status ${e.status || 'none'}` });
    throw err(502, 'Claude could not be reached.', { why: e.name || 'network' });
  }
};
async function claude(body) {
  const key = claudeKey();
  if (!key) throw skip('no key');
  if (spent() >= cap()) throw skip(`this month's limit of $${cap()} is used`);
  const content = toClaude(body);
  if (!content) throw skip('a file type Claude does not read');
  const msg = await claudeSend(key, content);
  const u = msg.usage || {};
  const tokensIn = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  addSpend((tokensIn * 4 + (u.output_tokens || 0) * 20) / 1e6);
  if (msg.stop_reason === 'refusal') throw err(502, 'Claude declined this file.', { why: 'declined' });
  if (msg.stop_reason === 'max_tokens') throw err(502, 'The reply was too long.', { why: 'reply cut off' });
  const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text.trim()) throw err(502, 'Claude returned nothing.', { why: 'empty reply' });
  return wantsJson(body) ? onlyJson(text) : text;
}

// ---------- Gemini ----------
async function gemini(body, opts) {
  const key = geminiKey();
  if (!key) throw skip('no key');
  return require('./gemini').generate(key, body, opts);
}

// ---------- Hugging Face (its router, the same models the work app uses) ----------
const HF_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_ROUTES = {
  vision: ['Qwen/Qwen3.5-397B-A17B:deepinfra', 'Qwen/Qwen3.5-397B-A17B:novita', 'Qwen/Qwen3.5-397B-A17B:featherless-ai'],
  text: ['deepseek-ai/DeepSeek-V4-Pro:deepinfra', 'deepseek-ai/DeepSeek-V4-Pro:novita', 'deepseek-ai/DeepSeek-V4-Pro:featherless-ai'],
};
async function hf(body) {
  const token = hfToken();
  if (!token) throw skip('no key');
  const content = [];
  let pictures = 0;
  for (const p of parts(body)) {
    if (p.text) content.push({ type: 'text', text: p.text });
    else if (p.inline_data) {
      if (!/^image\//.test(p.inline_data.mime_type)) throw skip('a file type it does not read');
      pictures += 1;
      content.push({ type: 'image_url', image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` } });
    }
  }
  let last = 'no model answered';
  for (const model of HF_ROUTES[pictures ? 'vision' : 'text']) {
    const req = { model, messages: [{ role: 'user', content }], max_tokens: 16000, temperature: 0 };
    if (model.startsWith('Qwen/Qwen3')) req.chat_template_kwargs = { enable_thinking: false };
    if (wantsJson(body)) req.response_format = { type: 'json_object' };
    for (let attempt = 0; attempt < 2; attempt++) {
      let r;
      try { r = await fetch(HF_URL, { method: 'POST', signal: AbortSignal.timeout(180000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req) }); }
      catch (e) { last = e.name === 'TimeoutError' ? 'took too long' : 'could not be reached'; break; }
      if (r.status === 400 && req.response_format) { delete req.response_format; continue; }
      if (r.status === 429 && attempt === 0) { await new Promise((ok) => setTimeout(ok, 3000)); continue; }
      if (!r.ok) { last = `status ${r.status}`; break; }
      const j = await r.json().catch(() => ({}));
      const text = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
      if (text.trim()) return wantsJson(body) ? onlyJson(text) : text;
      last = 'empty reply'; break;
    }
  }
  throw err(502, 'Hugging Face did not answer.', { why: last });
}

let chain = [['claude', claude], ['gemini', gemini], ['huggingface', hf]];

// body: a request in Gemini's generateContent shape (what the callers already build). Returns the reply's text.
// The first argument is unused; it is kept so callers read the same as before.
async function generate(_ready, body, opts = {}) {
  const what = opts.what || 'read this';
  let shown = null;
  for (const [name, fn] of chain) {
    const began = Date.now();
    try {
      const text = await fn(body, opts);
      console.log(`model ${what}: ${name} answered in ${Date.now() - began}ms`);
      return text;
    } catch (e) {
      if (e.skip) { if (e.message !== 'no key') console.log(`model ${what}: ${name} skipped (${e.message})`); continue; }
      console.error(`model ${what}: ${name} failed after ${Date.now() - began}ms (${e.why || e.status || e.name})`);
      // Gemini's messages are written for the person; the others are told plainly.
      if (name === 'gemini' || !shown) shown = e;
    }
  }
  if (shown && shown.status && /^Could not/.test(shown.message)) throw shown;
  throw err(shown ? 503 : 503, shown ? `Could not ${what}: none of the reading services answered. Try again in a few minutes.` : `Could not ${what}: reading is not set up yet.`);
}

module.exports = { generate, ready, toClaude, onlyJson, _setChain: (c) => { chain = c; }, _setClaudeSend: (f) => { claudeSend = f; }, _parts: { claude, gemini, hf } };
