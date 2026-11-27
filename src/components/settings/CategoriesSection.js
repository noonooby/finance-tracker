import React from 'react';
import { Grid } from 'lucide-react';
import CategoryManager from '../CategoryManager';
import SettingsSection from './SettingsSection';

export default function CategoriesSection({ expanded, onToggle, onCategoriesChanged }) {
  return (
    <SettingsSection title="Categories" icon={Grid} expanded={expanded} onToggle={onToggle} bodyClassName="p-4 border-t border-line">
      <CategoryManager onUpdate={onCategoriesChanged} />
    </SettingsSection>
  );
}
