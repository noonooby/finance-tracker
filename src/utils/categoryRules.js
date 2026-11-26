// Learned categories: one rule per merchant (merchant -> category), kept by the server from what you record.
// A rule you set yourself is fixed (source 'set'); learning never changes it. The app only suggests: a suggestion
// fills an empty category and you can always change it.

import { knownCategory, ownCategory, guessCategory, throughCategory } from './merchants';

// Same merchant key as the server (server/reader.js mkey): letters only, card-processor prefixes removed.
export const mkey = (m) => String(m || '').toLowerCase().replace(/^(sq|sp|tst|klarna|paypal|pp)\s*\*\s*/, '').replace(/[^a-z]/g, '').slice(0, 24);

// The rule for a description: the same merchant key, else the longest rule key that starts the description's key
// (so "Tim Hortons #123" finds the rule learned from "Tim Hortons"). -> rule or null
export function findRule(rules, description) {
  const k = mkey(description);
  if (k.length < 3 || !rules || !rules.length) return null;
  const exact = rules.find((r) => r.key === k);
  if (exact) return exact;
  let best = null;
  for (const r of rules) if (r.key && r.key.length >= 4 && k.startsWith(r.key) && (!best || r.key.length > best.key.length)) best = r;
  return best;
}

// A category id for a description, only if it still exists among the categories given.
// What you chose before comes first; a merchant the app knows by name (merchants.js) fills in when you have no rule.
//   income: true or false when the kind of line is known, so a deposit is never given a spending category.
export function suggestCategoryId(rules, description, categories, income) {
  const r = findRule(rules, description);
  if (r && (categories || []).some((c) => String(c.id) === String(r.category_id))) return String(r.category_id);
  const own = ownCategory(knownCategory(description, income), categories);
  return own ? String(own.id) : '';
}

// One way to choose a category for a line, used by pictures, typed lines and the quick form alike.
// Order: a bill paid through a service (the amount decides), what you chose before for this merchant, the last line
// you saved from it, a merchant the app knows by name, then the reading's own word for it.
//   pool: the categories it may choose from (spending ones, or income ones). -> a category id, or ''
export function pickCategory({ merchant, guess, income = false, amount = null, rules = [], transactions = [], pool = [] }) {
  const has = (id) => pool.some((c) => String(c.id) === String(id));
  const via = !income && throughCategory(merchant, amount, transactions);
  if (via && via.category_id && has(via.category_id)) return String(via.category_id);
  if (via && via.known) { const own = ownCategory(via.known, pool); if (own) return String(own.id); }
  const learned = findRule(rules, merchant) ? suggestCategoryId(rules, merchant, pool, income) : '';
  if (learned) return learned;
  const k = mkey(merchant);
  const past = k.length >= 3 && [...transactions].sort((a, b) => String(b.date).localeCompare(String(a.date))).find((t) => t.category_id && t.status !== 'undone' && mkey(t.description) === k);
  if (past && has(past.category_id)) return String(past.category_id);
  const known = ownCategory(knownCategory(merchant, income), pool);
  if (known) return String(known.id);
  const g = String(guess || '').toLowerCase();
  const hit = (g && pool.find((c) => c.name.toLowerCase() === g)) || (g && pool.find((c) => c.name.toLowerCase().includes(g) || g.includes(c.name.toLowerCase())));
  if (hit) return String(hit.id);
  const own = ownCategory(guessCategory(guess), pool);
  return own ? String(own.id) : '';
}

// What you paid this merchant with last time: "bank_account:ID" or "credit_card:ID", or '' when there is no such line
// or the account is gone.
export function usualSource(description, transactions = [], { bankAccounts = [], creditCards = [] } = {}) {
  const k = mkey(description);
  if (k.length < 3) return '';
  const past = [...transactions].sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .find((t) => t.type === 'expense' && t.status !== 'undone' && t.payment_method_id && mkey(t.description) === k);
  if (!past) return '';
  const list = past.payment_method === 'bank_account' ? bankAccounts : past.payment_method === 'credit_card' ? creditCards : [];
  return list.some((a) => String(a.id) === String(past.payment_method_id)) ? `${past.payment_method}:${past.payment_method_id}` : '';
}
