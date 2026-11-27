import React from 'react';
import { Database } from 'lucide-react';
import BackupManager from '../BackupManager';
import SettingsSection from './SettingsSection';

export default function BackupSection({ expanded, onToggle }) {
  return (
    <SettingsSection title="Backup & data management" icon={Database} expanded={expanded} onToggle={onToggle} bodyClassName="p-4 border-t border-line">
      <BackupManager />
    </SettingsSection>
  );
}
