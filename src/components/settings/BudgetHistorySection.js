import React from 'react';
import { TrendingUp } from 'lucide-react';
import BudgetHistory from '../BudgetHistory';
import SettingsSection from './SettingsSection';

export default function BudgetHistorySection({ darkMode, expanded, onToggle, categories, categoryBudgets }) {
  return (
    <SettingsSection title="Budget History" icon={TrendingUp} expanded={expanded} onToggle={onToggle} darkMode={darkMode} bodyClassName="p-6 border-t border-line">
      <BudgetHistory darkMode={darkMode} categories={categories} categoryBudgets={categoryBudgets} />
    </SettingsSection>
  );
}
