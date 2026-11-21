import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { deleteAllUserData } from '../../utils/db';
import { showToast } from '../../utils/toast';
import SettingsSection from './SettingsSection';

export default function DangerZoneSection({ darkMode, expanded, onToggle, onUpdate, onReloadCategories }) {
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAllData = async () => {
    const typed = window.prompt('This permanently deletes every account, card, loan, transaction, category, bill and setting on this sign-in. It cannot be undone. Download a backup first if you may want it back.\n\nType DELETE to continue.');
    if (String(typed || '').trim().toUpperCase() !== 'DELETE') return;
    setDeleting(true);
    try {
      await deleteAllUserData();
      showToast.success('All data deleted');
      if (onUpdate) await onUpdate();
      if (onReloadCategories) await onReloadCategories();
    } catch (error) {
      console.error('Error deleting data:', error);
      showToast.error(`Could not delete: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SettingsSection
      title="Danger Zone"
      danger
      expanded={expanded}
      onToggle={onToggle}
      darkMode={darkMode}
      bodyClassName="p-6 space-y-3 border-t border-line"
    >
      <p className={`text-sm text-muted`}>
        Delete everything recorded on this sign-in: accounts, cards, loans, income, transactions, categories, bills, settings and history.
      </p>
      <button
        onClick={handleDeleteAllData}
        disabled={deleting}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg ${deleting ? 'bg-red-300 cursor-not-allowed' : 'press bg-negative text-white hover:opacity-90 '} text-white`}
      >
        <AlertCircle size={20} />
        <span>{deleting ? 'Deleting...' : 'Delete All Data'}</span>
      </button>
    </SettingsSection>
  );
}
