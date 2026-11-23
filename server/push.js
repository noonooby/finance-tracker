// Reminders on your phone or computer (Web Push), with no outside service and no extra packages.
//  - The server makes its own signing key pair once and keeps it in the meta table. It is never logged or returned;
//    only the public half goes to the browser.
//  - Each message is encrypted for the one browser that asked for it (RFC 8291, aes128gcm), so the push service
//    carrying it cannot read it.
//  - Reminders: a card, loan or bill you pay yourself, two days before it is due and on the day, between 8:00 and 21:00
//    your time. Each reminder is sent once (meta key), so restarts and repeated checks never repeat it.
const crypto = require('node:crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s || ''), 'base64url');

function keys(db) {
  const row = db.prepare("SELECT v FROM meta WHERE k = 'vapid'").get();
  if (row) return JSON.parse(row.v);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const k = { pub: b64u(ecdh.getPublicKey()), priv: b64u(ecdh.getPrivateKey()) };
  db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('vapid', ?)").run(JSON.stringify(k));
  return JSON.parse(db.prepare("SELECT v FROM meta WHERE k = 'vapid'").get().v);
}
const publicKey = (db) => keys(db).pub;

function signingKey(k) {
  const pub = unb64u(k.pub);
  return crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: k.priv, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
}

// The VAPID header that tells the push service this server sent the message.
function vapid(db, endpoint, subject) {
  const k = keys(db);
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: signingKey(k), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${k.pub}`;
}

// RFC 8291: encrypt `text` for one subscription. -> Buffer (the request body)
function encrypt(sub, text, { salt = crypto.randomBytes(16), server = null } = {}) {
  const uaPublic = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const ecdh = server || crypto.createECDH('prime256v1');
  if (!server) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head.writeUInt8(65, 20);
  return Buffer.concat([head, asPublic, body]);
}

// Send one message. -> 'sent' | 'gone' (the browser unsubscribed; remove it) | 'failed'
async function send(db, sub, message, subject) {
  if (process.env.PUSH_STUB === 'fail') return 'failed';
  if (process.env.PUSH_STUB) { (global.__pushed = global.__pushed || []).push({ endpoint: sub.endpoint, message }); return 'sent'; }
  try {
    const r = await fetch(sub.endpoint, { method: 'POST', signal: AbortSignal.timeout(15000), headers: {
      Authorization: vapid(db, sub.endpoint, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal',
    }, body: encrypt(sub, JSON.stringify(message)) });
    if (r.status === 404 || r.status === 410) return 'gone';
    if (!r.ok) { console.error(`push: ${new URL(sub.endpoint).host} answered ${r.status}`); return 'failed'; }
    return 'sent';
  } catch (e) { console.error(`push: ${e.name}`); return 'failed'; }
}

// ---------- what is due ----------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
// anchorDay: the day of the month the bill belongs to, so one on the 31st returns to the 31st after a shorter month.
function nextBill(date, frequency, anchorDay) {
  const d = parse(date); if (!d) return null;
  const months = { monthly: 1, bimonthly: 2, quarterly: 3, yearly: 12 }[frequency];
  if (months) { const day = anchorDay || d.getDate(); const n = new Date(d.getFullYear(), d.getMonth() + months, 1); n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate())); return iso(n); }
  d.setDate(d.getDate() + (frequency === 'weekly' ? 7 : 14)); return iso(d);
}
const money = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(n) || 0);

// Things you pay yourself that fall due on `today` or `soon` (two days later). -> [{ id, date, title, body, url }]
function dueFor(rows, today, soon) {
  const out = [];
  const when = (d) => (d === today ? 'today' : 'in 2 days');
  // A due date left in the past (nothing was recorded against it) still comes round again: the next one on or after today.
  const coming = (date, frequency, anchorDate) => {
    let d = String(date || '').slice(0, 10);
    if (!parse(d)) return '';
    const anchor = (parse(anchorDate) || parse(d)).getDate();
    for (let i = 0; d && d < today && i < 600; i++) d = nextBill(d, frequency, anchor);
    return d || '';
  };
  for (const c of rows('credit_cards')) {
    if (c.is_gift_card || c.connected_payment_source || !(Number(c.balance) > 0)) continue;
    const d = coming(c.due_date, 'monthly');
    if (d === today || d === soon) out.push({ id: `card:${c.id}:${d}:${d === today ? 0 : 2}`, date: d, title: `${c.name} payment due ${when(d)}`,
      body: `Balance ${money(c.balance)}${Number(c.minimum_payment) > 0 ? `, minimum ${money(c.minimum_payment)}` : ''}.`, url: '/cards' });
  }
  for (const l of rows('loans')) {
    if (l.on_card_id || l.connected_payment_source || !(Number(l.balance) > 0)) continue;
    const d = coming(l.next_payment_date, l.frequency || 'monthly', ['weekly', 'biweekly'].includes(l.frequency) ? null : l.start_date);
    if (d === today || d === soon) out.push({ id: `loan:${l.id}:${d}:${d === today ? 0 : 2}`, date: d, title: `${l.name} payment due ${when(d)}`,
      body: `${money(Math.min(Number(l.balance), Number(l.payment_amount) || Number(l.balance)))} to pay.`, url: '/loans' });
  }
  for (const b of rows('bills')) {
    if (b.status !== 'active' || b.remind === false || !b.next_date) continue;
    let d = String(b.next_date).slice(0, 10);
    const anchor = parse(d) ? parse(d).getDate() : undefined;
    for (let i = 0; d && d < today && i < 600; i++) d = nextBill(d, b.frequency, anchor);
    // Already recorded (same merchant within 4 days, amount within 15%): no reminder.
    const at = parse(d);
    const paid = at && rows('transactions').some((t) => t.type === 'expense' && t.status !== 'undone' && t.status !== 'deleted'
      && require('./reader').mkey(t.description) === b.key && parse(t.date) && Math.abs((parse(t.date) - at) / 864e5) <= 4
      && Math.abs((Number(t.amount) || 0) - Number(b.amount)) <= Number(b.amount) * 0.15);
    if (!paid && (d === today || d === soon)) out.push({ id: `bill:${b.id}:${d}:${d === today ? 0 : 2}`, date: d, title: `${b.name} due ${when(d)}`,
      body: `About ${money(b.amount)}${b.payment_method_name ? ` from ${b.payment_method_name}` : ''}.`, url: '/bills' });
  }
  return out;
}

// One pass: every user with a subscription gets each new reminder once.
async function remind(db, { selectRows, tz, subject, now = new Date() }) {
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  if (local.getHours() < 8 || local.getHours() >= 21) return 0;
  const today = iso(local), soonD = new Date(local); soonD.setDate(soonD.getDate() + 2);
  const soon = iso(soonD);
  let sent = 0;
  const users = db.prepare("SELECT DISTINCT user_id FROM rows WHERE tbl = 'push_subscriptions'").all().map((r) => r.user_id);
  for (const uid of users) {
    const rows = (t) => selectRows(uid, { table: t, filters: [] });
    const off = rows('settings').find((s) => s.key === 'reminders');
    if (off && (off.value === false || off.value === 'false')) continue;
    const subs = rows('push_subscriptions');
    for (const item of dueFor(rows, today, soon)) {
      const k = `remind:${uid}:${item.id}`;
      if (db.prepare('SELECT 1 FROM meta WHERE k = ?').get(k)) continue;
      // Counted as reminded only once a device has it; if none could be reached, the next pass tries again.
      let reached = 0;
      for (const s of subs) {
        const r = await send(db, s, { title: item.title, body: item.body, url: item.url, tag: item.id });
        if (r === 'gone') db.prepare("DELETE FROM rows WHERE tbl = 'push_subscriptions' AND id = ? AND user_id = ?").run(String(s.id), uid);
        if (r === 'sent') reached++;
      }
      if (reached) db.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').run(k, now.toISOString());
      sent += reached;
    }
  }
  return sent;
}

module.exports = { publicKey, send, encrypt, vapid, dueFor, remind, _keys: keys };
