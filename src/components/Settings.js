import React from 'react';
import { Settings as SettingsIcon, ChevronDown, ChevronUp } from 'lucide-react';
import useSettingsData from './settings/useSettingsData';
import DisplaySection from './settings/DisplaySection';
import AlertsSection from './settings/AlertsSection';
import FinancialSection from './settings/FinancialSection';
import AutomationSection from './settings/AutomationSection';
import TransactionDefaultsSection from './settings/TransactionDefaultsSection';
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
  const { settings, updateSetting, expandedSections, anyExpanded, toggleSection, toggleAllSections } = data;

  const sectionProps = (key) => ({
    darkMode,
    expanded: expandedSections[key],
    onToggle: () => toggleSection(key)
  });
  const settingProps = { settings, updateSetting };

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
            darkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {anyExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          {anyExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      <GeminiKeyCard darkMode={darkMode} />
      <DisplaySection
        {...sectionProps('appearance')}
        {...settingProps}
        displayDensity={displayDensity}
        onDisplayDensityChange={onDisplayDensityChange}
      />
      <AlertsSection {...sectionProps('notifications')} {...settingProps} />
      <FinancialSection {...sectionProps('financial')} {...settingProps} />
      <AutomationSection {...sectionProps('automation')} {...settingProps} />
      <TransactionDefaultsSection {...sectionProps('transactionDefaults')} {...settingProps} />
      <CategoriesSection
        {...sectionProps('categories')}
        onCategoriesChanged={() => {
          onReloadCategories();
          data.loadLocalCategories();
        }}
      />
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
