import React, { useState } from 'react';
import { Target, X, Lightbulb } from 'lucide-react';
import * as Icons from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import { showToast } from '../../utils/toast';
import SettingsSection, { inputClass, boxClass } from './SettingsSection';

export default function CategoryBudgetsSection({
  darkMode,
  expanded,
  onToggle,
  expenseCategories,
  categoryBudgets,
  saveCategoryBudget,
  removeCategoryBudget
}) {
  const [inputs, setInputs] = useState({});
  const [saving, setSaving] = useState(false);

  const handleSet = async (categoryId) => {
    const amount = parseFloat(inputs[categoryId]);
    if (isNaN(amount) || amount <= 0) {
      showToast.error('Please enter a valid budget amount');
      return;
    }
    setSaving(true);
    const ok = await saveCategoryBudget(categoryId, amount);
    if (ok) setInputs(prev => ({ ...prev, [categoryId]: '' }));
    setSaving(false);
  };

  const handleRemove = async (categoryId) => {
    if (!window.confirm('Remove budget for this category?')) return;
    setSaving(true);
    await removeCategoryBudget(categoryId);
    setSaving(false);
  };

  return (
    <SettingsSection title="Category Budgets" icon={Target} expanded={expanded} onToggle={onToggle} darkMode={darkMode}>
      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
        Set a monthly spending limit for each expense category.
      </p>

      {expenseCategories.length === 0 ? (
        <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
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
              <div key={category.id} className={boxClass(darkMode)}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <IconComponent size={20} className="text-gray-500" />
                    <div>
                      <div className={`font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {category.name}
                      </div>
                      {hasBudget && (
                        <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Monthly Budget: {formatCurrency(currentBudget)}
                        </div>
                      )}
                    </div>
                  </div>
                  {hasBudget && (
                    <button
                      onClick={() => handleRemove(category.id)}
                      className={`p-2 rounded ${darkMode ? 'hover:bg-gray-600 text-red-400' : 'hover:bg-gray-200 text-red-600'}`}
                      title="Remove budget"
                      aria-label={`Remove ${category.name} budget`}
                      disabled={saving}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {!hasBudget && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="number"
                      step="10"
                      placeholder="Monthly budget amount"
                      aria-label={`${category.name} monthly budget`}
                      value={inputs[category.id] || ''}
                      onChange={(e) => setInputs(prev => ({ ...prev, [category.id]: e.target.value }))}
                      className={inputClass(darkMode, 'flex-1')}
                    />
                    <button
                      onClick={() => handleSet(category.id)}
                      disabled={saving || !inputs[category.id]}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

      <div className={`${darkMode ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3 mt-4`}>
        <p className={`text-xs flex items-center gap-2 ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
          <Lightbulb size={14} className="flex-shrink-0" />
          <span>Spending against each budget is tracked monthly. See trends in Budget History.</span>
        </p>
      </div>
    </SettingsSection>
  );
}
