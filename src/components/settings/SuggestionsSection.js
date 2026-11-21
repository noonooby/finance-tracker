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
        <p className={`text-sm text-muted`}>
          Names the app has learned from your entries.
        </p>
        <button
          onClick={handleLoad}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-accent/30 text-accent hover:bg-accent-soft`}
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
                    className={`flex items-center justify-between p-2 rounded bg-surface-2`}
                  >
                    <div className="flex-1">
                      <span className="font-medium">{entity.name}</span>
                      <span className={`text-sm ml-2 text-muted`}>
                        (used {entity.usage_count} {entity.usage_count === 1 ? 'time' : 'times'})
                      </span>
                    </div>
                    <button
                      onClick={() => handleDelete(entity.id)}
                      className={`p-2 rounded hover:bg-line/60 text-negative`}
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
        <div className={`flex items-center gap-3 p-4 rounded-2xl border border-line bg-surface-2`}>
          <Database size={20} className={'text-muted'} />
          <div className="flex-1">
            <p className={`text-sm text-muted`}>
              No learned suggestions yet. They are added as you enter transactions.
            </p>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
