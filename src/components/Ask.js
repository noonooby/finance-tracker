import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { api } from '../utils/server';
import { savePending } from '../utils/pendingScan';
import { Card, Button } from './shared/ui';

// Ask a question about your money, or type something to record. An answer uses the app's own figures.
// Something to record opens the check-before-saving screen: nothing is saved from here.
const EXAMPLES = ['How much did I spend on groceries this month?', 'What do I owe in total?', 'Coffee 4.50 on my Visa yesterday'];

export default function Ask() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [talk, setTalk] = useState([]); // [{ from: 'you' | 'app', text, error }]
  const end = useRef(null);
  useEffect(() => { if (end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: 'nearest' }); }, [talk, busy]);

  const send = async (message) => {
    const q = String(message || '').trim().slice(0, 300);
    if (!q || busy) return;
    setTalk((t) => [...t, { from: 'you', text: q }]);
    setText(''); setBusy(true);
    try {
      const r = await api('/api/ask', { text: q, today: new Date().toLocaleDateString('en-CA') });
      if (r.kind === 'record') {
        await savePending({ image: { typed: true, pdf: true, text: q, name: `You typed: ${q}`, url: '', type: 'text/plain' }, note: '', proposal: r.proposal });
        navigate('/screenshot');
        return;
      }
      setTalk((t) => [...t, { from: 'app', text: r.text }]);
    } catch (err) {
      setTalk((t) => [...t, { from: 'app', text: err.message, error: true }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ask or tell</h1>
        <p className="text-sm text-muted mt-1">Ask about your money and get an answer from your own figures. Or type what you spent or received: you check it before it is saved.</p>
      </div>

      {talk.length === 0 && (
        <Card className="space-y-2">
          <div className="text-xs text-muted">Try one</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" onClick={() => send(x)} className="press text-sm px-3 py-1.5 rounded-xl bg-accent-soft text-accent text-left">{x}</button>
            ))}
          </div>
        </Card>
      )}

      {talk.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {talk.map((m, i) => (
            <div key={i} className={`flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.from === 'you' ? 'bg-accent text-accent-contrast' : m.error ? 'bg-negative/10 text-negative' : 'bg-surface border border-line text-fg'}`}>{m.text}</div>
            </div>
          ))}
          {busy && <div className="text-xs text-muted px-1">Working it out</div>}
          <div ref={end} />
        </div>
      )}

      <form className="flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="flex-1">
          <span className="sr-only">Your question, or what to record</span>
          <textarea rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
            placeholder="Ask a question, or type what you spent"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-fg placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none" />
        </label>
        <Button type="submit" loading={busy} disabled={!text.trim()} aria-label="Send"><Send size={18} aria-hidden="true" /></Button>
      </form>
    </div>
  );
}
