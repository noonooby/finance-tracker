import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Edit2 } from 'lucide-react';

/**
 * Alert Settings Section
 * Allows users to configure obligation alert windows
 */
export default function AlertSettingsSection({
  darkMode,
  alertSettings,
  compactMode,
  isCollapsed,
  onToggleCollapse,
  onSave
}) {
  const urgentDays = alertSettings?.defaultDays || 7;
  const upcomingDays = alertSettings?.upcomingDays || 30;
  
  const [showEditor, setShowEditor] = useState(false);
  const [urgentInput, setUrgentInput] = useState(urgentDays);
  const [upcomingInput, setUpcomingInput] = useState(upcomingDays);

  useEffect(() => {
    setUrgentInput(urgentDays);
    setUpcomingInput(upcomingDays);
  }, [urgentDays, upcomingDays]);

  const handleSave = () => {
    const parsedUrgent = Math.max(0, parseInt(urgentInput, 10) || 0);
    const parsedUpcoming = Math.max(0, parseInt(upcomingInput, 10) || 0);
    onSave({
      defaultDays: parsedUrgent,
      upcomingDays: parsedUpcoming
    });
    setShowEditor(false);
  };

  return (
    <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border ${compactMode ? 'p-1.5' : 'p-4'}`}>
      <div className="flex items-center justify-between">
        <button
          onClick={onToggleCollapse}
          className={`flex items-center ${compactMode ? 'gap-0.5' : 'gap-2'} flex-1 text-left`}
        >
          {isCollapsed ? (
            <ChevronRight size={compactMode ? 14 : 18} className="text-gray-500" />
          ) : (
            <ChevronDown size={compactMode ? 14 : 18} className="text-gray-500" />
          )}
          <h3 className={`font-semibold ${compactMode ? 'text-xs' : ''}`}>Obligation Alerts</h3>
        </button>
        {!isCollapsed && (
          <button
            onClick={() => setShowEditor(prev => !prev)}
            className={`flex items-center ${compactMode ? 'gap-0.5 px-1.5 py-0.5 text-[10px]' : 'gap-2 px-3 py-1 text-sm'} rounded ${darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <Edit2 size={compactMode ? 10 : 16} />
            {showEditor ? 'Close' : 'Edit'}
          </button>
        )}
      </div>
      
      {!isCollapsed && (
        <>
          <p className={`${compactMode ? 'text-xs' : 'text-sm'} ${darkMode ? 'text-gray-400' : 'text-gray-600'} ${compactMode ? 'mt-0.5' : 'mt-3'}`}>
            Default urgent window: <span className="font-semibold">{urgentDays}d</span> • Upcoming window: <span className="font-semibold">{upcomingDays}d</span>
          </p>
          <p className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${darkMode ? 'text-gray-500' : 'text-gray-500'} ${compactMode ? 'mt-0' : 'mt-1'}`}>
            Note: Individual cards and loans may use custom alert windows
          </p>
          {showEditor && (
            <div className={`grid gap-2 md:grid-cols-2 ${compactMode ? 'mt-1' : 'mt-3'}`}>
              <div>
                <label className={`block ${compactMode ? 'text-xs' : 'text-sm'} font-medium ${compactMode ? 'mb-0.5' : 'mb-1'} ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Default Urgent Window (days)
                </label>
                <input
                  type="number"
                  min="0"
                  value={urgentInput}
                  onChange={(e) => setUrgentInput(e.target.value)}
                  className={`w-full ${compactMode ? 'px-1.5 py-1 text-xs' : 'px-3 py-2'} border rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                />
                <p className={`${compactMode ? 'text-[10px]' : 'text-xs'} ${compactMode ? 'mt-0' : 'mt-1'} ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  Cards/loans can override this
                </p>
              </div>
              <div>
                <label className={`block ${compactMode ? 'text-xs' : 'text-sm'} font-medium ${compactMode ? 'mb-0.5' : 'mb-1'} ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Upcoming (days)
                </label>
                <input
                  type="number"
                  min="0"
                  value={upcomingInput}
                  onChange={(e) => setUpcomingInput(e.target.value)}
                  className={`w-full ${compactMode ? 'px-1.5 py-1 text-xs' : 'px-3 py-2'} border rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
                />
              </div>
              <div className={`md:col-span-2 flex gap-1.5 ${compactMode ? 'mt-0.5' : ''}`}>
                <button
                  onClick={handleSave}
                  className={`flex-1 bg-blue-600 text-white ${compactMode ? 'py-1 text-xs' : 'py-2'} rounded-lg font-medium hover:bg-blue-700`}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowEditor(false);
                    setUrgentInput(urgentDays);
                    setUpcomingInput(upcomingDays);
                  }}
                  className={`flex-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} ${compactMode ? 'py-1 text-xs' : 'py-2'} rounded-lg font-medium`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
