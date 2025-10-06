import React, { useState, useEffect } from 'react';
import { Undo2, Activity, Trash2, CreditCard, TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { undoActivity } from '../utils/activityLogger';

export default function ActivityFeed({ darkMode, onUpdate }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState(null);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async (activity) => {
    if (!window.confirm('Are you sure you want to undo this action?')) return;

    setUndoingId(activity.id);
    try {
      await undoActivity(activity, onUpdate);
      await loadActivities();
      alert('Action undone successfully!');
    } catch (error) {
      console.error('Error undoing activity:', error);
      alert('Failed to undo action. Please try again.');
    } finally {
      setUndoingId(null);
    }
  };

  const getEntityIcon = (entityType) => {
    switch (entityType) {
      case 'card': return <CreditCard size={16} />;
      case 'loan': return <TrendingUp size={16} />;
      case 'fund': return <Calendar size={16} />;
      case 'income': return <DollarSign size={16} />;
      default: return <Activity size={16} />;
    }
  };

  const getActionColor = (actionType) => {
    switch (actionType) {
      case 'add': return 'text-green-600';
      case 'edit': return 'text-blue-600';
      case 'delete': return 'text-red-600';
      case 'payment': return 'text-purple-600';
      default: return 'text-gray-600';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-gray-500">Loading activities...</div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-8 text-center`}>
        <Activity size={48} className="mx-auto mb-4 text-gray-400" />
        <p className="text-gray-500">No recent activities</p>
        <p className="text-sm text-gray-400 mt-2">Your actions will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Activity size={24} />
          Recent Activity
        </h2>
        <span className="text-sm text-gray-500">Last 50 actions</span>
      </div>

      {activities.map((activity) => (
        <div
          key={activity.id}
          className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4 flex items-start justify-between gap-3 hover:shadow-md transition-shadow`}
        >
          <div className="flex items-start gap-3 flex-1">
            <div className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
              {getEntityIcon(activity.entity_type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`font-semibold capitalize ${getActionColor(activity.action_type)}`}>
                  {activity.action_type}
                </span>
                <span className="text-sm text-gray-500 capitalize">
                  {activity.entity_type}
                </span>
              </div>
              
              <p className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                {activity.description}
              </p>
              
              <span className="text-xs text-gray-500">
                {formatDate(activity.created_at)}
              </span>
            </div>
          </div>

          <button
            onClick={() => handleUndo(activity)}
            disabled={undoingId === activity.id}
            className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors ${
              undoingId === activity.id
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : darkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
            title="Undo this action"
          >
            <Undo2 size={16} />
            {undoingId === activity.id ? 'Undoing...' : 'Undo'}
          </button>
        </div>
      ))}
    </div>
  );
}
