import React, { useEffect, useState } from 'react';
import { api } from '../../utils/server';
import { showToast } from '../../utils/toast';

// Shown only while no Gemini key is set and only to the owner. Once saved it disappears for good;
// the key stays on the server and is never sent back to the browser.
export default function GeminiKeyCard({ darkMode }) {
  const [state, setState] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/gemini-key', null, 'GET').then(setState).catch(() => setState(null)); }, []);
  if (!state || !state.canSet) return null;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/gemini-key', { key: key.trim() });
      setKey('');
      setState({ set: true, canSet: false });
      showToast.success('Gemini key saved. Screenshot reading is on.');
    } catch (err) { showToast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className={`rounded-2xl border p-4 space-y-2 bg-surface border-accent/30`}>
      <h2 className="font-semibold">Gemini key for reading screenshots</h2>
      <p className={`text-sm text-muted`}>
        Paste your key from Google AI Studio once. It is checked with Google, then kept on the server only. After that this box goes away and the key can't be seen or changed from the app.
      </p>
      <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} aria-label="Gemini key" placeholder="Gemini key"
        className={`w-full px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`} />
      <button type="submit" disabled={busy || !key.trim()} className="w-full bg-accent text-accent-contrast rounded-lg py-2 font-medium disabled:opacity-50">{busy ? 'Checking...' : 'Check and save'}</button>
    </form>
  );
}
