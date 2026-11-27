import React, { useMemo, useState } from 'react';
import { Sparkles, Trash2, Lock, Unlock } from 'lucide-react';
import { server } from '../../utils/server';
import { showToast } from '../../utils/toast';
import { mkey } from '../../utils/categoryRules';
import { useFinanceData } from '../../hooks/useFinanceData';
import SettingsSection, { inputClass } from './SettingsSection';

// What the app has learned: one category per merchant. Each rule can be changed, fixed so learning leaves it alone,
// or deleted. Learning itself can be turned off. Suggestions only fill an empty category; you always decide.
export default function LearnedCategoriesSection({ expanded, onToggle, categories = [], learnOn, onLearnChange }) {
  const { categoryRules = [], setCategoryRules } = useFinanceData();
  const [filter, setFilter] = useState('');
  const [newMerchant, setNewMerchant] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const nameOf = (id) => (categories.find((c) => String(c.id) === String(id)) || {}).name || 'Deleted category';
  const rules = useMemo(() => [...categoryRules]
    .filter((r) => !filter || r.merchant.toLowerCase().includes(filter.toLowerCase()) || nameOf(r.category_id).toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => String(a.merchant).localeCompare(String(b.merchant))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [categoryRules, filter, categories]);

  const save = async (rule, change) => {
    const next = { ...rule, ...change, updated_at: new Date().toISOString() };
    const { error } = await server.from('category_rules').update(change).eq('id', rule.id);
    if (error) return showToast.error(error.message);
    setCategoryRules(categoryRules.map((r) => (r.id === rule.id ? next : r)));
  };
  const remove = async (rule) => {
    const { error } = await server.from('category_rules').delete().eq('id', rule.id);
    if (error) return showToast.error(error.message);
    setCategoryRules(categoryRules.filter((r) => r.id !== rule.id));
  };
  const add = async () => {
    const key = mkey(newMerchant);
    if (key.length < 3) return showToast.error('Enter a merchant name with at least 3 letters.');
    if (!newCategory) return showToast.error('Choose a category.');
    const existing = categoryRules.find((r) => r.key === key);
    if (existing) { await save(existing, { category_id: newCategory, source: 'set' }); setNewMerchant(''); return; }
    const row = { key, merchant: newMerchant.trim().slice(0, 60), category_id: newCategory, source: 'set', uses: 0 };
    const { data, error } = await server.from('category_rules').insert(row).select().single();
    if (error) return showToast.error(error.message);
    setCategoryRules([...categoryRules, data]);
    setNewMerchant('');
  };

  const fixed = categoryRules.filter((r) => r.source === 'set').length;
  return (
    <SettingsSection title="Learned categories" icon={Sparkles} expanded={expanded} onToggle={onToggle}>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={learnOn} onChange={(e) => onLearnChange(e.target.checked)} />
        <span>
          <span className="block font-medium">Learn categories from what I record</span>
          <span className="block text-xs text-muted">When you save a purchase or income with a category, the app remembers it for that merchant and fills it in next time (on the + button, Scan and Excel upload). It only fills an empty category; you can always change it.</span>
        </span>
      </label>

      <div className="text-sm text-muted">{categoryRules.length} merchants learned{fixed ? `, ${fixed} fixed by you` : ''}. A fixed rule is never changed by learning.</div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input className={inputClass} placeholder="Merchant, for example Loblaws" value={newMerchant} onChange={(e) => setNewMerchant(e.target.value)} />
        <select className={inputClass} value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
          <option value="">Category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_income ? ' (income)' : ''}</option>)}
        </select>
        <button type="button" onClick={add} className="press btn-primary">Add rule</button>
      </div>

      {categoryRules.length > 6 && <input className={inputClass} placeholder="Find a merchant or category" value={filter} onChange={(e) => setFilter(e.target.value)} />}

      {rules.length === 0 ? (
        <p className="text-sm text-muted">Nothing learned yet. Save a purchase with a category and it appears here.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{r.merchant}</div>
                <div className="text-xs text-muted">{r.source === 'set' ? 'Fixed by you' : `Learned${r.uses > 1 ? `, used ${r.uses} times` : ''}`}</div>
              </div>
              <select aria-label={`Category for ${r.merchant}`} className={inputClass('w-40')} value={r.category_id}
                onChange={(e) => save(r, { category_id: e.target.value, source: 'set' })}>
                {!categories.some((c) => String(c.id) === String(r.category_id)) && <option value={r.category_id}>{nameOf(r.category_id)}</option>}
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className="press p-2 rounded-xl text-muted hover:text-fg" onClick={() => save(r, { source: r.source === 'set' ? 'learned' : 'set' })}
                aria-label={r.source === 'set' ? `Let the app update ${r.merchant}` : `Fix ${r.merchant} so learning leaves it alone`}
                title={r.source === 'set' ? 'Fixed: learning leaves it alone' : 'Learning may update it'}>
                {r.source === 'set' ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
              <button type="button" className="press p-2 rounded-xl text-negative" onClick={() => remove(r)} aria-label={`Forget ${r.merchant}`}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
