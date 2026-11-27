import React, { useMemo, useState } from 'react';
import { ask } from '../../utils/confirm';
import { useFinanceData } from '../../hooks/useFinanceData';
import { spentByCategory, monthRange, monthOf, prevMonth } from '../../utils/spending';
import { Target, X, Lightbulb } from 'lucide-react';
import * as Icons from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import { showToast } from '../../utils/toast';
import SettingsSection, { inputClass, boxClass } from './SettingsSection';

export default function CategoryBudgetsSection({
  expanded,
  onToggle,
  expenseCategories,
  categoryBudgets,
  saveCategoryBudget,
  removeCategoryBudget
}) {
  const [inputs, setInputs] = useState({});
  // What each category cost on average over the last three full months, as a starting point for its budget.
  const { transactions } = useFinanceData();
  const avg = useMemo(() => {
    const now = monthOf();
    const from = monthRange(prevMonth(now, 3))[0], to = monthRange(prevMonth(now, 1))[1];
    const s = spentByCategory(transactions, from, to);
    return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.max(0, Math.round(v / 3))]));
  }, [transactions]);
  const [saving, setSaving] = useState(false);

  const handleSet = async (categoryId) => {
    const amount = parseFloat(inputs[categoryId]);
    if (isNaN(amount) || amount <= 0) {
      showToast.error('Enter a monthly amount above zero.');
      return;
    }
    setSaving(true);
    const ok = await saveCategoryBudget(categoryId, amount);
    if (ok) setInputs(prev => ({ ...prev, [categoryId]: '' }));
    setSaving(false);
  };

  const handleRemove = async (categoryId) => {
    if (!(await ask('Remove budget for this category?'))) return;
    setSaving(true);
    await removeCategoryBudget(categoryId);
    setSaving(false);
  };

  return (
    <SettingsSection title="Category budgets" icon={Target} expanded={expanded} onToggle={onToggle}>
      <p className="text-sm text-muted">
        Set a monthly spending limit for each expense category.
      </p>

      {expenseCategories.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <Target size={48} className="mx-auto mb-3 opacity-30" />
          <p>Loading categories...</p>
          <p className="text-sm mt-1">If no categories appear, add them in the Categories section above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {expenseCategories.map(category => {
            const currentBudget = categoryBudgets[category.id];
            const hasBudget = currentBudget && currentBudget > 0;
            const IconComponent = Icons[category.icon || 'Package'] || Icons.Package;

            return (
              <div key={category.id} className={boxClass}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <IconComponent size={20} className="text-muted" />
                    <div>
                      <div className="font-medium text-fg">
                        {category.name}
                      </div>
                      {hasBudget && (
                        <div className="text-xs text-muted">
                          Monthly Budget: {formatCurrency(currentBudget)}
                        </div>
                      )}
                    </div>
                  </div>
                  {hasBudget && (
                    <button
                      onClick={() => handleRemove(category.id)}
                      className="p-2 rounded hover:bg-line/60 text-negative"
                      title="Remove budget"
                      aria-label={`Remove ${category.name} budget`}
                      disabled={saving}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {!hasBudget && avg[String(category.id)] > 0 && (
                  <div className="text-xs text-muted">Last 3 months: about {formatCurrency(avg[String(category.id)])} a month.{' '}
                    <button type="button" className="text-accent font-medium" onClick={() => setInputs((p) => ({ ...p, [category.id]: String(avg[String(category.id)]) }))}>Use this</button>
                  </div>
                )}
                {!hasBudget && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="number"
                      step="10"
                      placeholder="Monthly budget amount"
                      aria-label={`${category.name} monthly budget`}
                      value={inputs[category.id] || ''}
                      onChange={(e) => setInputs(prev => ({ ...prev, [category.id]: e.target.value }))}
                      className={inputClass('flex-1')}
                    />
                    <button
                      onClick={() => handleSet(category.id)}
                      disabled={saving || !inputs[category.id]}
                      className="px-4 py-2 bg-accent text-accent-contrast rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Set
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-accent-soft border-accent/30 border rounded-xl p-3 mt-4">
        <p className="text-xs flex items-center gap-2 text-accent">
          <Lightbulb size={14} className="flex-shrink-0" />
          <span>Spending against each budget is tracked monthly. See trends in Budget History.</span>
        </p>
      </div>
    </SettingsSection>
  );
}
