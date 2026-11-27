import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { deleteAllUserData } from '../../utils/db';
import { showToast } from '../../utils/toast';
import SettingsSection from './SettingsSection';

export default function DangerZoneSection({ expanded, onToggle, onUpdate, onReloadCategories }) {
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
      title="Danger zone"
      danger
      expanded={expanded}
      onToggle={onToggle}
      bodyClassName="p-4 space-y-3 border-t border-line"
    >
      <p className="text-sm text-muted">
        Delete everything recorded on this sign-in: accounts, cards, loans, income, transactions, categories, bills, settings and history.
      </p>
      <button
        onClick={handleDeleteAllData}
        disabled={deleting}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl ${deleting ? 'bg-negative/40 cursor-not-allowed' : 'press bg-negative text-white hover:opacity-90 '} text-white`}
      >
        <AlertCircle size={20} />
        <span>{deleting ? 'Deleting...' : 'Delete all data'}</span>
      </button>
    </SettingsSection>
  );
}
