import React, { useState } from 'react';
import { Database, Trash2 } from 'lucide-react';
import { fetchAllKnownEntities, deleteKnownEntity } from '../../utils/knownEntities';
import { showToast } from '../../utils/toast';
import SettingsSection, { boxClass } from './SettingsSection';

export default function SuggestionsSection({ darkMode, expanded, onToggle }) {
  const [knownEntities, setKnownEntities] = useState({});
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);

  const handleLoad = async () => {
    setLoading(true);
    try {
      setKnownEntities(await fetchAllKnownEntities());
      setShown(true);
    } catch (error) {
      console.error('Error loading entities:', error);
      showToast.error('Error loading suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (entityId) => {
    if (!window.confirm('Delete this suggestion?')) return;
    try {
      await deleteKnownEntity(entityId);
      await handleLoad();
    } catch (error) {
      console.error('Error deleting entity:', error);
      showToast.error('Error deleting suggestion');
    }
  };

  const hasEntities = Object.keys(knownEntities).length > 0;

  return (
    <SettingsSection title="Manage Learned Suggestions" icon={Database} expanded={expanded} onToggle={onToggle} darkMode={darkMode}>
      <div className="flex items-center justify-between">
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Names the app has learned from your entries.
        </p>
        <button
          onClick={handleLoad}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${darkMode ? 'border-blue-500 text-blue-400 hover:bg-blue-900/30' : 'border-blue-600 text-blue-600 hover:bg-blue-50'}`}
        >
          <Database size={20} />
          <span>{loading ? 'Loading...' : shown ? 'Refresh' : 'View'}</span>
        </button>
      </div>

      {shown && hasEntities && (
        <div className="space-y-4 mt-4">
          {Object.entries(knownEntities).map(([type, entities]) => (
            <div key={type} className={boxClass(darkMode)}>
              <h4 className="font-semibold mb-2 capitalize">{type.replace('_', ' ')}s ({entities.length})</h4>
              <div className="space-y-2">
                {entities.map(entity => (
                  <div
                    key={entity.id}
                    className={`flex items-center justify-between p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}
                  >
                    <div className="flex-1">
                      <span className="font-medium">{entity.name}</span>
                      <span className={`text-sm ml-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        (used {entity.usage_count} {entity.usage_count === 1 ? 'time' : 'times'})
                      </span>
                    </div>
                    <button
                      onClick={() => handleDelete(entity.id)}
                      className={`p-2 rounded ${darkMode ? 'hover:bg-gray-600 text-red-400' : 'hover:bg-gray-200 text-red-600'}`}
                      title="Delete suggestion"
                      aria-label={`Delete suggestion ${entity.name}`}
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

      {shown && !hasEntities && (
        <div className={`flex items-center gap-3 p-4 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <Database size={20} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
          <div className="flex-1">
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              No learned suggestions yet. They are added as you enter transactions.
            </p>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
