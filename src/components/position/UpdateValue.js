import React, { useState } from 'react';
import { recordAdjustment } from '../../utils/money';
import { localDate } from '../../utils/helpers';
import { showToast } from '../../utils/toast';

const TARGET = { bank: 'bank_account', card: 'credit_card', card_credit: 'credit_card', gift_card: 'credit_card', loan: 'loan', mortgage: 'loan', investment: 'investment', asset: 'asset', cash: 'cash_in_hand' };

// Inline "Update": states today's figure; saved as a balance correction so it can be undone.
export default function UpdateValue({ line, signed, accounts, onDone, darkMode }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) {
    return <button type="button" className="text-xs font-medium text-blue-600 dark:text-blue-400" onClick={() => { setValue(String(signed)); setOpen(true); }} aria-label={`Update ${line.name}`}>Update</button>;
  }
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const type = TARGET[line.kind];
      await recordAdjustment({ target: type === 'cash_in_hand' ? 'cash_in_hand' : `${type}:${line.id}`, newBalance: Number(value), current: signed, date: localDate(), description: `${line.name} updated` }, accounts);
      setOpen(false);
      await onDone();
    } catch (err) { showToast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <input type="number" step="0.01" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Today's figure for ${line.name}`} autoFocus
        className={`w-28 px-2 py-1 text-sm border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`} />
      <button type="submit" disabled={busy} className="text-xs font-medium text-white bg-blue-600 rounded-lg px-2 py-1">Save</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs">Cancel</button>
    </form>
  );
}
