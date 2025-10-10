import React, { useState } from 'react';
import { Settings as SettingsIcon, RefreshCw, CheckCircle, AlertCircle, Trash2, Database } from 'lucide-react';
import { recalculateAvailableCash, validateAvailableCash } from '../utils/helpers';
import { deleteAllUserData } from '../utils/db';
import CategoryManager from './CategoryManager';
import { fetchAllKnownEntities, deleteKnownEntity } from '../utils/knownEntities';

export default function Settings({ darkMode, onUpdate, onReloadCategories }) {
  const [recalculating, setRecalculating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [message, setMessage] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [knownEntities, setKnownEntities] = useState({});
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [showEntities, setShowEntities] = useState(false);

  const handleRecalculate = async () => {
    if (!window.confirm('This will recalculate your available cash based on all transactions. Continue?')) {
      return;
    }

    setRecalculating(true);
    setMessage(null);

    try {
      const newCash = await recalculateAvailableCash();
      setMessage({
        type: 'success',
        text: `Available cash recalculated: $${newCash.toFixed(2)}`
      });
      if (onUpdate) await onUpdate();
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error recalculating cash. Please try again.'
      });
    } finally {
      setRecalculating(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setMessage(null);

    try {
      const result = await validateAvailableCash();
      setValidationResult(result);
      setMessage({
        type: result.isValid ? 'success' : 'warning',
        text: result.message
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error validating cash. Please try again.'
      });
    } finally {
      setValidating(false);
    }
  };

  const handleDeleteAllData = async () => {
    if (!window.confirm('This will permanently delete all of your data for this account. This action cannot be undone. Continue?')) {
      return;
    }

    setDeletingAll(true);
    setMessage(null);

    try {
      await deleteAllUserData();
      setMessage({
        type: 'success',
        text: 'All data deleted successfully.'
      });
      if (onUpdate) await onUpdate();
      if (onReloadCategories) await onReloadCategories();
    } catch (error) {
      console.error('Error deleting data:', error);
      setMessage({
        type: 'error',
        text: 'Failed to delete data. Please try again.'
      });
    } finally {
      setDeletingAll(false);
    }
  };

  const handleLoadEntities = async () => {
    setLoadingEntities(true);
    try {
      const entities = await fetchAllKnownEntities();
      setKnownEntities(entities);
      setShowEntities(true);
    } catch (error) {
      console.error('Error loading entities:', error);
      setMessage({
        type: 'error',
        text: 'Error loading suggestions. Please try again.'
      });
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleDeleteEntity = async (entityId, entityType) => {
    if (!window.confirm('Delete this suggestion?')) return;
  
    try {
      await deleteKnownEntity(entityId);
      await handleLoadEntities(); // Reload
      setMessage({
        type: 'success',
        text: 'Suggestion deleted successfully.'
      });
    } catch (error) {
      console.error('Error deleting entity:', error);
      setMessage({
        type: 'error',
        text: 'Error deleting suggestion. Please try again.'
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <SettingsIcon size={24} />
        Settings
      </h2>

      {message && (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-800' :
          message.type === 'warning' ? 'bg-yellow-50 text-yellow-800' :
          'bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <p>{message.text}</p>
        </div>
      )}

      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 space-y-4`}>
        <h3 className="text-lg font-semibold">Available Cash Management</h3>
        
        <button
          onClick={handleValidate}
          disabled={validating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-blue-600 hover:bg-blue-50"
        >
          <CheckCircle size={20} className="text-blue-600" />
          <span>{validating ? 'Validating...' : 'Validate Available Cash'}</span>
        </button>

        {validationResult && (
          <div className={`p-4 rounded-lg ${validationResult.isValid ? 'bg-green-50' : 'bg-yellow-50'}`}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Expected:</span>
                <span className="font-mono">${validationResult.expected.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Current:</span>
                <span className="font-mono">${validationResult.actual.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw size={20} className={recalculating ? 'animate-spin' : ''} />
          <span>{recalculating ? 'Recalculating...' : 'Recalculate Available Cash'}</span>
        </button>
      </div>

      {/* Category Manager Section */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6`}>
        <CategoryManager
          darkMode={darkMode}
          onUpdate={onReloadCategories}
        />
      </div>

      {/* Manage Suggestions Section */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Manage Learned Suggestions</h3>
          <button
            onClick={handleLoadEntities}
            disabled={loadingEntities}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-blue-600 text-blue-600 hover:bg-blue-50"
          >
            <Database size={20} />
            <span>{loadingEntities ? 'Loading...' : showEntities ? 'Refresh' : 'View Suggestions'}</span>
          </button>
        </div>

        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          View and manage suggestions that Claude has learned from your inputs.
        </p>

        {showEntities && Object.keys(knownEntities).length > 0 && (
          <div className="space-y-4 mt-4">
            {Object.entries(knownEntities).map(([type, entities]) => (
              <div key={type} className={`border ${darkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4`}>
                <h4 className="font-semibold mb-2 capitalize">{type.replace('_', ' ')}s ({entities.length})</h4>
                <div className="space-y-2">
                  {entities.map(entity => (
                    <div
                      key={entity.id}
                      className={`flex items-center justify-between p-2 rounded ${
                        darkMode ? 'bg-gray-700' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex-1">
                        <span className="font-medium">{entity.entity_value}</span>
                        <span className={`text-sm ml-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          (used {entity.usage_count} {entity.usage_count === 1 ? 'time' : 'times'})
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteEntity(entity.id, type)}
                        className={`p-2 rounded ${darkMode ? 'hover:bg-gray-600 text-red-400' : 'hover:bg-gray-200 text-red-600'}`}
                        title="Delete suggestion"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {showEntities && Object.keys(knownEntities).length === 0 && (
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${
            darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}>
            <Database size={20} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
            <div className="flex-1">
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                No learned suggestions yet. The SmartInput feature will automatically learn from your entries as you use the app.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'} rounded-lg p-6 space-y-3`}>
        <h3 className="text-lg font-semibold text-red-600">Danger Zone</h3>
        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Delete all data associated with this account, including cards, loans, reserved funds, income, transactions, categories, and activity history.
        </p>
        <button
          onClick={handleDeleteAllData}
          disabled={deletingAll}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg ${deletingAll ? 'bg-red-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'} text-white`}
        >
          <AlertCircle size={20} />
          <span>{deletingAll ? 'Deleting...' : 'Delete All Data'}</span>
        </button>
      </div>
    </div>
  );
}
