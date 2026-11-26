// Learned categories: one rule per merchant (merchant -> category), kept by the server from what you record.
// A rule you set yourself is fixed (source 'set'); learning never changes it. The app only suggests: a suggestion
// fills an empty category and you can always change it.

import { knownCategory, ownCategory } from './merchants';

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
