// Data client for the app's own server (Supabase is no longer used).
// It keeps the small part of the Supabase query style the screens use: supabase.from('table').select().eq(...).order(...)
// so the screens did not need rewriting. The server limits every query to the signed-in user.
// Money changes do not go through this: they use moveMoney / reverseTransaction below, which the server applies all at once.

const TOKEN = 'finance_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN); } catch { return null; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); } catch {} };

export async function api(path, body, method = 'POST') {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  let out = {};
  try { out = await res.json(); } catch {}
  if (res.status === 401 && getToken()) { setToken(null); notify(null); }
  if (!res.ok) { const e = new Error(out.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return out;
}

// Parses the Supabase "or" text the screens use, e.g. "user_id.eq.x,is_system.eq.true".
function parseOr(text) {
  return String(text).split(',').map((p) => {
    const [c, op, ...rest] = p.split('.');
    let v = rest.join('.');
    if (v === 'null') v = null; else if (v === 'true') v = true; else if (v === 'false') v = false;
    return [c, op, v];
  }).filter(([c]) => c !== 'user_id'); // the server already limits rows to the user
}

class Query {
  constructor(table) { this.q = { table, action: 'select', filters: [], or: [], order: [] }; this.mode = 'many'; this.wantRows = false; }
  select(_cols, opts = {}) { if (this.q.action === 'select') { if (opts.count) this.q.count = true; if (opts.head) this.q.head = true; } else this.wantRows = true; return this; }
  insert(values) { this.q.action = 'insert'; this.q.values = values; return this; }
  upsert(values, opts = {}) { this.q.action = 'upsert'; this.q.values = values; if (opts.onConflict) this.q.onConflict = opts.onConflict; return this; }
  update(values) { this.q.action = 'update'; this.q.values = values; return this; }
  delete() { this.q.action = 'delete'; return this; }
  f(c, op, v) { this.q.filters.push([c, op, v]); return this; }
  eq(c, v) { return this.f(c, 'eq', v); }
  neq(c, v) { return this.f(c, 'neq', v); }
  gt(c, v) { return this.f(c, 'gt', v); }
  gte(c, v) { return this.f(c, 'gte', v); }
  lt(c, v) { return this.f(c, 'lt', v); }
  lte(c, v) { return this.f(c, 'lte', v); }
  in(c, v) { return this.f(c, 'in', v); }
  is(c, v) { return this.f(c, 'is', v); }
  like(c, v) { return this.f(c, 'like', v); }
  ilike(c, v) { return this.f(c, 'ilike', v); }
  contains(c, v) { return this.f(c, 'contains', v); }
  not(c, op, v) { if (op === 'is') return this.f(c, 'not_is', v); if (op === 'eq') return this.f(c, 'neq', v); throw new Error('Unsupported filter: not ' + op); }
  match(obj) { Object.entries(obj).forEach(([c, v]) => this.eq(c, v)); return this; }
  filter(c, op, v) { return this.f(c, op, v); }
  or(text) { const g = parseOr(text); if (g.length) this.q.or.push(g); return this; }
  order(c, opts = {}) { this.q.order.push([c, opts.ascending !== false]); return this; }
  limit(n) { this.q.limit = n; return this; }
  range(a, b) { this.q.offset = a; this.q.limit = b - a + 1; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  async run() {
    try {
      const { data, count } = await api('/api/db', this.q);
      if (this.q.head) return { data: null, count, error: null };
      let rows = data;
      if (this.mode === 'single') {
        if (!rows || rows.length !== 1) return { data: null, error: { message: rows && rows.length ? 'More than one row' : 'Row not found', code: 'PGRST116' } };
        rows = rows[0];
      } else if (this.mode === 'maybe') rows = rows && rows.length ? rows[0] : null;
      return { data: rows, count: count ?? null, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message, status: e.status } };
    }
  }
  then(ok, bad) { return this.run().then(ok, bad); }
  catch(bad) { return this.run().catch(bad); }
}

// ---------- sign-in ----------
let current = undefined; // undefined = not checked yet
const listeners = new Set();
function notify(session) { current = session; listeners.forEach((fn) => fn(session ? 'SIGNED_IN' : 'SIGNED_OUT', session)); }
async function loadSession() {
  if (current !== undefined) return current;
  if (!getToken()) return (current = null);
  try { const { user } = await api('/api/me', null, 'GET'); current = { user, access_token: getToken() }; }
  catch { current = null; }
  return current;
}

export const auth = {
  async getSession() { return { data: { session: await loadSession() }, error: null }; },
  async getUser() { const s = await loadSession(); return { data: { user: s ? s.user : null }, error: null }; },
  onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
  async signOut() { try { await api('/api/logout'); } catch {} setToken(null); notify(null); return { error: null }; },
  signInWithGoogle() { window.location.href = '/auth/google'; },
  async devSignIn() { const { token } = await api('/api/dev-login'); setToken(token); current = undefined; notify(await loadSession()); },
  async config() { try { return await api('/api/config', null, 'GET'); } catch { return {}; } },
};

export const supabase = { from: (table) => new Query(table), auth };

// ---------- money ----------
// moveMoney({ key, legs: [{ table, id, delta, floor }], rows: [{ table, values }] })
// Every leg and row is saved together or not at all. key makes a step happen once (schedules, double clicks).
export const moveMoney = (step) => api('/api/money', step);
// Puts back exactly what the transaction moved, on the same accounts.
export const reverseTransaction = (id, opts = {}) => api(`/api/transactions/${encodeURIComponent(id)}/reverse`, opts);
