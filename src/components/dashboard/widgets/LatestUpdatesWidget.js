import React from 'react';
import { Activity, ChevronRight, ChevronDown } from 'lucide-react';

/**
 * Latest Updates Widget
 * Displays recent activity feed items
 */
export default function LatestUpdatesWidget({
  darkMode,
  activities,
  compactMode,
  isCollapsed,
  onToggleCollapse,
  onViewAll
}) {
  if (!activities || activities.length === 0) return null;
  
  return (
    <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border ${compactMode ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 flex-1"
        >
          {isCollapsed ? (
            <ChevronRight size={18} className="text-gray-500" />
          ) : (
            <ChevronDown size={18} className="text-gray-500" />
          )}
          <h3 className="font-semibold flex items-center gap-2">
            <Activity size={18} />
            Latest Updates
          </h3>
        </button>
        {!isCollapsed && (
          <button
            onClick={onViewAll}
            className={`text-xs px-3 py-1 rounded ${darkMode ? 'bg-blue-900 text-blue-200 hover:bg-blue-800' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
          >
            View All
          </button>
        )}
      </div>
      
      {!isCollapsed && (
        <div className="space-y-2">
          {activities.slice(0, 5).map(activity => {
            const timeDiff = Date.now() - new Date(activity.created_at).getTime();
            const minutesAgo = Math.floor(timeDiff / 60000);
            const hoursAgo = Math.floor(timeDiff / 3600000);
            const daysAgo = Math.floor(timeDiff / 86400000);
            
            const timeAgo = minutesAgo < 1 ? 'Just now' 
              : minutesAgo < 60 ? `${minutesAgo}m ago`
              : hoursAgo < 24 ? `${hoursAgo}h ago`
              : `${daysAgo}d ago`;
            
            return (
              <div 
                key={activity.id} 
                className={`text-sm ${compactMode ? 'pb-1.5' : 'pb-2'} border-b last:border-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}
              >
                <div className={`font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  {activity.description}
                </div>
                <div className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {timeAgo}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
