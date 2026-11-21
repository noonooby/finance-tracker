import React, { useEffect, useState } from 'react';
import { server } from '../utils/server';
import LearnedCategoriesSection from './settings/LearnedCategoriesSection';
import { Settings as SettingsIcon, ChevronDown, ChevronUp } from 'lucide-react';
import useSettingsData from './settings/useSettingsData';
import DisplaySection from './settings/DisplaySection';
import RemindersSection from './settings/RemindersSection';
import CategoriesSection from './settings/CategoriesSection';
import BudgetHistorySection from './settings/BudgetHistorySection';
import CategoryBudgetsSection from './settings/CategoryBudgetsSection';
import SuggestionsSection from './settings/SuggestionsSection';
import BackupSection from './settings/BackupSection';
import DangerZoneSection from './settings/DangerZoneSection';
import GeminiKeyCard from './settings/GeminiKeyCard';

export default function Settings({
  darkMode,
  onUpdate,
  onReloadCategories,
  categories: categoriesProp = [],
  displayDensity,
  onDisplayDensityChange
}) {
  const data = useSettingsData(categoriesProp);
  // Learning categories is on unless you turn it off (setting learn_categories).
  const [learnOn, setLearnOn] = useState(true);
  useEffect(() => {
    server.from('settings').select('*').eq('key', 'learn_categories').maybeSingle().then(({ data: row }) => setLearnOn(!(row && (row.value === false || row.value === 'false'))));
  }, []);
  const setLearn = async (on) => {
    setLearnOn(on);
    await server.from('settings').upsert({ key: 'learn_categories', value: on }, { onConflict: 'key' });
  };
  const { expandedSections, anyExpanded, toggleSection, toggleAllSections } = data;
  // Home's "Change" on budgets opens here with #budgets: open that section and scroll to it.
  useEffect(() => {
    if (window.location.hash !== '#budgets') return;
    if (!expandedSections.categoryBudgets) toggleSection('categoryBudgets');
    setTimeout(() => document.getElementById('budgets')?.scrollIntoView({ behavior: 'smooth' }), 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sectionProps = (key) => ({
    darkMode,
    expanded: expandedSections[key],
    onToggle: () => toggleSection(key)
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <SettingsIcon size={20} className="sm:w-6 sm:h-6" />
          Settings
        </h2>

        <button
          onClick={toggleAllSections}
          className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base rounded-lg border transition-colors ${
            'border-line text-fg hover:bg-surface-2'
          }`}
        >
          {anyExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          {anyExpanded ? 'Close all' : 'Open all'}
        </button>
      </div>

      <GeminiKeyCard darkMode={darkMode} />
      <DisplaySection
        {...sectionProps('appearance')}
        displayDensity={displayDensity}
        onDisplayDensityChange={onDisplayDensityChange}
      />
      <RemindersSection {...sectionProps('notifications')} />
      <CategoriesSection
        {...sectionProps('categories')}
        onCategoriesChanged={() => {
          onReloadCategories();
          data.loadLocalCategories();
        }}
      />
      <div id="budgets" />
      <BudgetHistorySection
        {...sectionProps('budgetHistory')}
        categories={data.categories}
        categoryBudgets={data.categoryBudgets}
      />
      <CategoryBudgetsSection
        {...sectionProps('categoryBudgets')}
        expenseCategories={data.expenseCategories}
        categoryBudgets={data.categoryBudgets}
        saveCategoryBudget={data.saveCategoryBudget}
        removeCategoryBudget={data.removeCategoryBudget}
      />
      <LearnedCategoriesSection {...sectionProps('learned')} categories={data.categories} learnOn={learnOn} onLearnChange={setLearn} />
      <SuggestionsSection {...sectionProps('suggestions')} />
      <BackupSection {...sectionProps('backup')} />
      <DangerZoneSection
        {...sectionProps('danger')}
        onUpdate={onUpdate}
        onReloadCategories={onReloadCategories}
      />
    </div>
  );
}
