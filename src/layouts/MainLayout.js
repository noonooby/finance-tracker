import React from 'react';
import { Outlet } from 'react-router-dom';
import { Download, Upload, Moon, Sun, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useFinanceData } from '../hooks/useFinanceData';
import { useTheme } from '../hooks/useTheme';
import { useUI } from '../hooks/useUI';
import { dbOperation } from '../utils/db';
import BottomNavigation from '../BottomNavigation';

/**
 * Main Layout Component
 * Wraps all authenticated pages with header and navigation
 */
export function MainLayout() {
  const { signOut } = useAuth();
  const {
    creditCards,
    loans,
    reservedFunds,
    income,
    categories,
    bankAccounts,
    cashInHand,
    alertSettings,
    isMigrating,
    dataLoading,
    loadAllData,
    updateCashInHand,
  } = useFinanceData();
  
  const { darkMode, toggleDarkMode } = useTheme();
  const { openAddTransaction } = useUI();

  // Export data
  const exportData = async () => {
    const data = {
      creditCards,
      loans,
      reservedFunds,
      income,
      categories,
      bankAccounts,
      cashInHand,
      alertSettings,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import data
  const importData = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        for (const card of data.creditCards || []) await dbOperation('creditCards', 'put', card);
        for (const loan of data.loans || []) await dbOperation('loans', 'put', loan);
        for (const fund of data.reservedFunds || []) await dbOperation('reservedFunds', 'put', fund);
        for (const inc of data.income || []) await dbOperation('income', 'put', inc);
        for (const cat of data.categories || []) await dbOperation('categories', 'put', cat);
        
        if (data.cashInHand) {
          await updateCashInHand(data.cashInHand);
        }
        
        await loadAllData();
        
        alert('Data imported successfully!');
      } catch (error) {
        console.error('Import error:', error);
        alert('Error importing data. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className={`min-h-screen pb-20 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b p-4 sticky top-0 z-10`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Finance Tracker</h1>
            {(isMigrating || dataLoading) && (
              <span className="text-xs text-blue-500 animate-pulse">
                {isMigrating ? 'Syncing accounts…' : 'Loading data…'}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleDarkMode}
              className={`p-2 ${darkMode ? 'text-yellow-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'} rounded-lg`}
              title={darkMode ? 'Light Mode' : 'Dark Mode'}
            >
              {darkMode ? <Sun size={24} /> : <Moon size={24} />}
            </button>
            <button
              onClick={exportData}
              className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded-lg`}
              title="Export Data"
            >
              <Download size={24} />
            </button>
            <label className={`p-2 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'} rounded-lg cursor-pointer`} title="Import Data">
              <Upload size={24} />
              <input
                type="file"
                accept=".json"
                onChange={importData}
                className="hidden"
              />
            </label>
            <button
              onClick={signOut}
              className={`px-3 py-1 text-sm ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'} rounded-lg`}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Rendered by Routes */}
      <div className="p-4">
        <Outlet />
      </div>

      {/* Floating Add Button */}
      <button
        onClick={openAddTransaction}
        className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center z-20"
        title="Add Transaction"
      >
        <Plus size={28} />
      </button>

      {/* Bottom Navigation */}
      <BottomNavigation darkMode={darkMode} />
    </div>
  );
}
