import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, Trash2 } from 'lucide-react';
import { server, api } from '../utils/server';
import { showToast } from '../utils/toast';
import { scoreSummary, scoreBand } from '../utils/plans';
import { parseDay } from '../utils/helpers';
import { Card, Section, Button, Field, EmptyState } from './shared/ui';

// Credit score: the number you read from a bureau or your bank, with the day you checked it. The app keeps the history.
const BUREAUS = ['Equifax', 'TransUnion', 'Experian'];
const day = (d) => { const x = parseDay(d); return x ? x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
const today = () => new Date().toLocaleDateString('en-CA');

export default function CreditScore() {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [v, setV] = useState({ bureau: 'Equifax', other: '', score: '', date: today(), note: '' });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  // A screenshot of the score fills the form; you check it and save.
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState('');
  const fromPicture = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setReading(true); setReadNote('');
    try {
      const image = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('That file could not be opened.')); r.readAsDataURL(file); });
      const p = await api('/api/read-score', { image, mime: file.type, today: today() });
      const known = p.bureau && BUREAUS.find((b) => b.toLowerCase() === p.bureau.toLowerCase());
      setV((prev) => ({ ...prev, score: String(p.score), date: p.date || prev.date, bureau: known || (p.bureau ? 'Other' : prev.bureau), other: known || !p.bureau ? prev.other : p.bureau }));
      setReadNote(`Read ${p.score}${p.bureau ? ` from ${p.bureau}` : ''}${p.date ? '' : '; the picture shows no date, so set the day'}${p.bureau ? '' : '; choose the bureau'}. Check it, then save.`);
    } catch (err) { showToast.error(err.message); } finally { setReading(false); }
  };
  const load = async () => {
    const { data, error } = await server.from('credit_scores').select('*');
    if (error) showToast.error(error.message);
    setScores(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const summary = useMemo(() => scoreSummary(scores), [scores]);
  const history = useMemo(() => [...scores].sort((a, b) => String(b.date).localeCompare(String(a.date))), [scores]);

  const add = async (e) => {
    e.preventDefault();
    const bureau = (v.bureau === 'Other' ? v.other : v.bureau).trim().slice(0, 40);
    setSaving(true);
    const { error } = await server.from('credit_scores').insert({ bureau, score: Number(v.score), date: v.date, note: v.note.trim().slice(0, 120) || null, created_at: new Date().toISOString() });
    setSaving(false);
    if (error) return showToast.error(error.message);
    setV({ ...v, score: '', note: '' });
    load();
  };
  const remove = async (s) => {
    if (!window.confirm(`Remove the ${s.bureau} score of ${s.score} from ${day(s.date)}?`)) return;
    const { error } = await server.from('credit_scores').delete().eq('id', s.id);
    if (error) return showToast.error(error.message);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Credit score</h1>
        <p className="text-sm text-muted mt-1">Enter the score when you check it with a bureau or your bank. The app keeps each one and shows how it moves.</p>
      </div>

      {summary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {summary.map((s) => (
            <Card key={s.bureau}>
              <div className="text-xs text-muted">{s.bureau}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{s.score}</span>
                <span className="text-sm text-muted">{scoreBand(s.score)}</span>
              </div>
              <div className="text-xs text-muted mt-1">
                Checked {day(s.date)}
                {s.change != null && s.change !== 0 && <span className={s.change > 0 ? 'text-positive' : 'text-negative'}> · {s.change > 0 ? 'up' : 'down'} {Math.abs(s.change)} since the one before</span>}
                {s.change === 0 && ' · no change since the one before'}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Section title="Add a score">
        <Card>
          <form className="space-y-3" onSubmit={add}>
            <div className="space-y-1">
              <label className="press inline-flex items-center gap-2 text-sm font-medium text-accent cursor-pointer">
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={fromPicture} disabled={reading} />
                {reading ? 'Reading the picture' : 'Fill in from a screenshot'}
              </label>
              {readNote && <p className="text-xs text-muted">{readNote}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Bureau" as="select" value={v.bureau} onChange={set('bureau')}>
                {[...BUREAUS, 'Other'].map((b) => <option key={b}>{b}</option>)}
              </Field>
              {v.bureau === 'Other' && <Field label="Name" value={v.other} onChange={set('other')} required maxLength={40} />}
              <Field label="Score" type="number" inputMode="numeric" step="1" min="300" max="900" value={v.score} onChange={set('score')} required />
              <Field label="Checked on" type="date" value={v.date} max={today()} onChange={set('date')} required />
              <Field label="Note (optional)" value={v.note} onChange={set('note')} maxLength={120} className="sm:col-span-2" />
            </div>
            <Button type="submit" loading={saving}>Save</Button>
          </form>
        </Card>
      </Section>

      <Section title="History">
        <Card padded={false} className="divide-y divide-line">
          {!loading && history.length === 0 && <EmptyState icon={Gauge} title="No scores yet" text="Add the first one above." />}
          {history.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{s.bureau}</span>
                <span className="block text-xs text-muted truncate">{day(s.date)}{s.note ? ` · ${s.note}` : ''}</span>
              </span>
              <span className="font-semibold tabular-nums">{s.score}</span>
              <button type="button" onClick={() => remove(s)} aria-label={`Remove the ${s.bureau} score from ${day(s.date)}`} className="text-muted"><Trash2 size={16} /></button>
            </div>
          ))}
        </Card>
      </Section>
    </div>
  );
}
