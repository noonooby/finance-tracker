import React from 'react';
import { Grid } from 'lucide-react';
import CategoryManager from '../CategoryManager';
import SettingsSection from './SettingsSection';

export default function CategoriesSection({ darkMode, expanded, onToggle, onCategoriesChanged }) {
  return (
    <SettingsSection title="Categories" icon={Grid} expanded={expanded} onToggle={onToggle} darkMode={darkMode} bodyClassName="p-6 border-t border-line">
      <CategoryManager darkMode={darkMode} onUpdate={onCategoriesChanged} />
    </SettingsSection>
  );
}
