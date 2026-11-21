import React from 'react';
import { Database } from 'lucide-react';
import BackupManager from '../BackupManager';
import SettingsSection from './SettingsSection';

export default function BackupSection({ darkMode, expanded, onToggle }) {
  return (
    <SettingsSection title="Backup & Data Management" icon={Database} expanded={expanded} onToggle={onToggle} darkMode={darkMode} bodyClassName="p-6 border-t border-line">
      <BackupManager />
    </SettingsSection>
  );
}
