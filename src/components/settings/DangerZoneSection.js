import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { deleteAllUserData } from '../../utils/db';
import { showToast } from '../../utils/toast';
import SettingsSection from './SettingsSection';

export default function DangerZoneSection({ darkMode, expanded, onToggle, onUpdate, onReloadCategories }) {
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAllData = async () => {
    if (!window.confirm('This will permanently delete all of your data for this account. This action cannot be undone. Continue?')) {
      return;
    }
    setDeleting(true);
    try {
      await deleteAllUserData();
      showToast.success('All data deleted');
      if (onUpdate) await onUpdate();
      if (onReloadCategories) await onReloadCategories();
    } catch (error) {
      console.error('Error deleting data:', error);
      showToast.error('Failed to delete data. Please try again.');
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
      bodyClassName="p-6 space-y-3 border-t border-gray-700"
    >
      <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        Delete all data associated with this account, including cards, loans, reserved funds, income, transactions, categories, and activity history.
      </p>
      <button
        onClick={handleDeleteAllData}
        disabled={deleting}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg ${deleting ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'} text-white`}
      >
        <AlertCircle size={20} />
        <span>{deleting ? 'Deleting...' : 'Delete All Data'}</span>
      </button>
    </SettingsSection>
  );
}
