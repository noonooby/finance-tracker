// What a saved line did to one account, from the line's own record of what it moved (and what it would have moved
// when the account's balance was already seen for that day). One rule for every kind of line and every screen.
//   type: 'bank_account' | 'credit_card' | 'card' | 'loan'.  -> a signed amount, or null when the line has no record.
const TABLE = { bank_account: 'bank_accounts', credit_card: 'credit_cards', card: 'credit_cards', loan: 'loans' };
export function effectOn(t, type, id) {
  const table = TABLE[type];
  let cents = 0, seen = false;
  const mine = (l) => l && l.table === table && String(l.id) === String(id);
  for (const l of (t && t._legs) || []) if (mine(l)) { cents += Math.round(Number(l.delta) * 100) || 0; seen = true; }
  for (const h of (t && t.history_only) || []) if (mine(h)) { cents += Math.round(Number(h.amount) * 100) || 0; seen = true; }
  return seen ? cents / 100 : null;
}
