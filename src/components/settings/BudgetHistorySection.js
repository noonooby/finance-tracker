import React from 'react';
import { TrendingUp } from 'lucide-react';
import BudgetHistory from '../BudgetHistory';
import SettingsSection from './SettingsSection';

export default function BudgetHistorySection({ expanded, onToggle, categories, categoryBudgets }) {
  return (
    <SettingsSection title="Budget history" icon={TrendingUp} expanded={expanded} onToggle={onToggle} bodyClassName="p-4 border-t border-line">
      <BudgetHistory categories={categories} categoryBudgets={categoryBudgets} />
    </SettingsSection>
  );
}
