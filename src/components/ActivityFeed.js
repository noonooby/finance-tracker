import React, { useState, useEffect } from 'react';
import { 
  Undo2, 
  Activity, 
  CreditCard, 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  Wallet, 
  Building2, 
  Settings as SettingsIcon, 
  Eye, 
  EyeOff, 
  SlidersHorizontal 
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { undoActivity } from '../utils/activityLogger';
import { getSetting, setSetting } from '../utils/settingsManager';
import {
  getUserPreferences,
  updateActivityPreferences
} from '../utils/userPreferencesManager';

const parseSnapshot = (snapshot) => {
  if (!snapshot) return null;
  if (typeof snapshot === 'string') {
    try {
      return JSON.parse(snapshot);
    } catch (error) {
      console.warn('Unable to parse activity snapshot:', error);
      return null;
    }
  }
  return snapshot;
};

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `$${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const extractActivityAmount = (activity, snapshot = {}) => {
  if (!snapshot || typeof snapshot !== 'object') return null;

  // FOR EDIT ACTIONS: Display the NEW/UPDATED amount (not the old amount)
  if (activity.action_type === 'edit' && snapshot.updated) {
    const updatedAmountCandidates = [
      snapshot.updated.balance,
      snapshot.updated.amount,
      snapshot.updated.credit_limit,
      snapshot.updated.payment_amount,
      snapshot.updated.original_amount,
      snapshot.updated.purchase_amount
    ];
    
    for (const candidate of updatedAmountCandidates) {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric !== 0) {
        return Math.abs(numeric);
      }
    }
  }

  if (Array.isArray(snapshot.affectedFunds) && snapshot.affectedFunds.length > 0) {
    const total = snapshot.affectedFunds.reduce((sum, entry) => {
      const amount = Number(entry?.amountUsed ?? entry?.amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    if (total) return Math.abs(total);
  }

  if (Array.isArray(snapshot.bankAdjustments) && snapshot.bankAdjustments.length > 0) {
    const total = snapshot.bankAdjustments.reduce((sum, entry) => {
      const amount = Number(entry?.amount ?? entry?.delta ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    if (total) return Math.abs(total);
  }

  const amountCandidates = [
    snapshot.paymentAmount,
    snapshot.amount,
    snapshot.newAmount,
    snapshot.balance,
    snapshot.total,
    snapshot.original_amount,
    snapshot.purchase_amount,
    snapshot.credit_limit,
    snapshot.value,
    snapshot.amountUsed,
    snapshot.newValue,
    snapshot.previousValue
  ];

  for (const candidate of amountCandidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric !== 0) {
      return Math.abs(numeric);
    }
  }

  if (activity?.description) {
    const match = activity.description.match(/\$[\d.,]+/);
    if (match) {
      const numeric = Number(match[0].replace(/[$,]/g, ''));
      if (Number.isFinite(numeric)) {
        return Math.abs(numeric);
      }
    }
  }

  return null;
};

const buildActivityDetails = (activity, snapshot = {}) => {
  if (!snapshot || typeof snapshot !== 'object') return [];

  const details = [];

  if (Array.isArray(snapshot.affectedFunds) && snapshot.affectedFunds.length > 0) {
    const entries = snapshot.affectedFunds.map((entry) => {
      const fund = entry?.fund || entry;
      const name = fund?.name || fund?.entity_name || 'Reserved Fund';
      const accountName = fund?.source_account_name;
      const label = accountName ? `${name} → ${accountName}` : name;
      const amountText = formatCurrency(entry?.amountUsed ?? entry?.amount ?? snapshot.paymentAmount);
      return amountText ? `${label} (${amountText})` : label;
    });
    details.push({
      label: snapshot.affectedFunds.length > 1 ? 'Reserved Funds' : 'Reserved Fund',
      value: entries.join(', ')
    });
  } else if (snapshot.affectedFund) {
    const fund = snapshot.affectedFund;
    const name = fund?.name || fund?.entity_name || 'Reserved Fund';
    const amountText = formatCurrency(snapshot.amountUsed ?? snapshot.paymentAmount ?? snapshot.amount);
    const accountName = fund?.source_account_name;
    const labelValue = accountName ? `${name} → ${accountName}` : name;
    details.push({
      label: 'Reserved Fund',
      value: amountText ? `${labelValue} (${amountText})` : labelValue
    });
  }

  if (snapshot.previousCash !== undefined && snapshot.newCash !== undefined) {
    const prev = formatCurrency(snapshot.previousCash);
    const next = formatCurrency(snapshot.newCash);
    if (prev && next) {
      details.push({ label: 'Cash', value: `${prev} → ${next}` });
    }
  }

  if (snapshot.previousAmount !== undefined && snapshot.newAmount !== undefined) {
    const prev = formatCurrency(snapshot.previousAmount);
    const next = formatCurrency(snapshot.newAmount);
    if (prev && next) {
      details.push({ label: 'Amount', value: `${prev} → ${next}` });
    }
  }

  if (snapshot.previousBalance !== undefined && snapshot.entity?.balance !== undefined) {
    const prev = formatCurrency(snapshot.previousBalance);
    const next = formatCurrency(snapshot.entity.balance);
    if (prev && next) {
      details.push({ label: 'Balance', value: `${prev} → ${next}` });
    }
  }

  const method = snapshot.paymentMethodName || snapshot.payment_method_name;
  if (method) {
    details.push({ label: 'Method', value: method });
  }

  if (snapshot.source?.name) {
    details.unshift({ label: 'Source', value: snapshot.source.name });
  }

  if (Array.isArray(snapshot.bankAdjustments) && snapshot.bankAdjustments.length > 0) {
    const entries = snapshot.bankAdjustments.map((entry) => {
      const name = entry?.accountName || 'Account';
      const amountText = formatCurrency(entry?.amount ?? entry?.delta ?? snapshot.paymentAmount);
      return amountText ? `${name} (${amountText})` : name;
    });
    details.push({
      label: snapshot.bankAdjustments.length > 1 ? 'Bank Accounts' : 'Bank Account',
      value: entries.join(', ')
    });
  }

  return details;
};

export default function ActivityFeed({ darkMode, onUpdate }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState(null);
  const [entityFilter, setEntityFilter] = useState('all');
  const [showAllActivities, setShowAllActivities] = useState(true);
  const [showPreferences, setShowPreferences] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Activity preferences from database
  const [preferences, setPreferences] = useState({
    showEdits: true,
    showDeletions: true,
    showAdditions: true,
    showSystem: false,
    perPage: 25
  });

  useEffect(() => {
    loadActivities();
    loadTogglePreference();
    loadActivityPreferences();
  }, []);

  const loadActivityPreferences = async () => {
    try {
      const prefs = await getUserPreferences();
      setPreferences({
        showEdits: prefs.activity_show_edits ?? true,
        showDeletions: prefs.activity_show_deletions ?? true,
        showAdditions: prefs.activity_show_additions ?? true,
        showSystem: prefs.activity_show_system ?? false,
        perPage: prefs.activities_per_page ?? 25
      });
    } catch (error) {
      console.error('Error loading activity preferences:', error);
    }
  };

  const handlePreferenceChange = async (updates) => {
    const newPreferences = { ...preferences, ...updates };
    setPreferences(newPreferences);
    
    try {
      await updateActivityPreferences(newPreferences);
      console.log('✅ Activity preferences saved');
    } catch (error) {
      console.error('Error saving activity preferences:', error);
    }
  };

  const loadTogglePreference = async () => {
    try {
      const preference = await getSetting('showViewOnlyActivities', true);
      setShowAllActivities(preference);
    } catch (error) {
      console.error('Error loading activity toggle preference:', error);
    }
  };

  const handleToggleChange = async (checked) => {
    setShowAllActivities(checked);
    try {
      await setSetting('showViewOnlyActivities', checked);
      console.log('✅ Activity view preference saved');
    } catch (error) {
      console.error('Error saving activity toggle preference:', error);
    }
  };

  const loadActivities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200); // Load more to account for filtering

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
    } catch (error) {
      console.error('Error undoing activity:', error);
      alert('Failed to undo action. Please try again.');
    } finally {
      setUndoingId(null);
    }
  };

  const getEntityIcon = (entityType, actionType) => {
    // Settings-related activities get settings icon
    if (actionType === 'setting_change' || actionType === 'edit_setting' || actionType === 'set_budget' || actionType === 'delete_budget') {
      return <SettingsIcon size={16} />;
    }
    
    switch (entityType) {
      case 'card': return <CreditCard size={16} />;
      case 'loan': return <TrendingUp size={16} />;
      case 'fund': return <Calendar size={16} />;
      case 'income': return <DollarSign size={16} />;
      case 'bank_account': return <Building2 size={16} />;
      case 'cash': return <Wallet size={16} />;
      case 'cash_in_hand': return <Wallet size={16} />;
      case 'category_budget': return <DollarSign size={16} />;
      default: return <Activity size={16} />;
    }
  };

  const getActionColor = (actionType) => {
    switch (actionType) {
      case 'add': return 'text-green-600';
      case 'edit': return 'text-blue-600';
      case 'edit_setting': return 'text-blue-600';
      case 'delete': return 'text-red-600';
      case 'payment': return 'text-purple-600';
      case 'cash_withdrawal': return 'text-orange-600';
      case 'cash_deposit': return 'text-teal-600';
      case 'set_budget': return 'text-green-600';
      case 'delete_budget': return 'text-red-600';
      case 'setting_change': return 'text-gray-500';
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

  // Determine if activity can be undone (has snapshot)
  const canUndo = (activity) => {
    return activity.snapshot !== null && activity.action_type !== 'setting_change';
  };

  // Determine if activity is view-only (setting_change with no undo)
  const isViewOnly = (activity) => {
    return activity.action_type === 'setting_change';
  };

  // Check if activity is a system activity (auto-generated)
  const isSystemActivity = (activity) => {
    return activity.action_type.startsWith('auto_') || 
           activity.action_type.startsWith('system_') ||
           activity.description.toLowerCase().includes('auto-deposit') ||
           activity.description.toLowerCase().includes('auto-payment');
  };

  // Filter activities based on preferences
  const filteredActivities = activities.filter(activity => {
    // Entity type filter
    if (entityFilter !== 'all' && activity.entity_type !== entityFilter) {
      return false;
    }
    
    // Show all activities toggle (for view-only items)
    if (!showAllActivities && isViewOnly(activity)) {
      return false;
    }
    
    // Action type filters
    if (activity.action_type === 'add' && !preferences.showAdditions) {
      return false;
    }
    if (activity.action_type === 'edit' && !preferences.showEdits) {
      return false;
    }
    if (activity.action_type === 'delete' && !preferences.showDeletions) {
      return false;
    }
    
    // System activities filter
    if (isSystemActivity(activity) && !preferences.showSystem) {
      return false;
    }
    
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredActivities.length / preferences.perPage);
  const startIndex = (currentPage - 1) * preferences.perPage;
  const endIndex = startIndex + preferences.perPage;
  const paginatedActivities = filteredActivities.slice(startIndex, endIndex);

  // MOVED: Reset to page 1 if current page is out of bounds
  // This useEffect must be called before any early returns
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const viewOnlyCount = activities.filter(isViewOnly).length;

  // Early returns AFTER all hooks
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
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {filteredActivities.length} of {activities.length} activities
          </span>
          <button
            onClick={() => setShowPreferences(!showPreferences)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              showPreferences
                ? darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'
                : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <SlidersHorizontal size={18} />
            {showPreferences ? 'Hide' : 'Preferences'}
          </button>
        </div>
      </div>

      {/* Preferences Panel */}
      {showPreferences && (
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4 space-y-4`}>
          <h3 className="font-semibold flex items-center gap-2">
            <SlidersHorizontal size={18} />
            Activity Feed Preferences
          </h3>
          
          <div className="space-y-3">
            {/* Activity Type Checkboxes */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Show Activity Types
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.showAdditions}
                    onChange={(e) => handlePreferenceChange({ showAdditions: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Show additions (add card, add loan, etc.)</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.showEdits}
                    onChange={(e) => handlePreferenceChange({ showEdits: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Show edits (edit card, update balance, etc.)</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.showDeletions}
                    onChange={(e) => handlePreferenceChange({ showDeletions: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Show deletions (delete transaction, etc.)</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.showSystem}
                    onChange={(e) => handlePreferenceChange({ showSystem: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Show system activities (auto-deposit, auto-payment)</span>
                </label>
              </div>
            </div>
            
            {/* Activities Per Page */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Activities Per Page
              </label>
              <select
                value={preferences.perPage}
                onChange={(e) => {
                  handlePreferenceChange({ perPage: parseInt(e.target.value) });
                  setCurrentPage(1); // Reset to first page
                }}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
              >
                <option value={25}>25 activities</option>
                <option value={50}>50 activities</option>
                <option value={100}>100 activities</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Filter UI */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4 space-y-3`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Entity Filter */}
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setCurrentPage(1); // Reset to first page
            }}
            className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          >
            <option value="all">All Entity Types</option>
            <option value="card">Credit Cards</option>
            <option value="loan">Loans</option>
            <option value="bank_account">Bank Accounts</option>
            <option value="income">Income</option>
            <option value="fund">Reserved Funds</option>
            <option value="cash_in_hand">Cash in Hand</option>
            <option value="category_budget">Category Budgets</option>
          </select>

          {/* Show All Activities Toggle */}
          <div className={`flex items-center justify-between px-4 py-2 border rounded-lg ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
            <div className="flex items-center gap-2">
              {showAllActivities ? <Eye size={18} /> : <EyeOff size={18} />}
              <span className="text-sm font-medium">Show Settings Changes</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showAllActivities}
                onChange={(e) => handleToggleChange(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {!showAllActivities && viewOnlyCount > 0 && (
          <p className={`text-xs flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <SettingsIcon size={12} />
            Hiding {viewOnlyCount} settings change{viewOnlyCount !== 1 ? 's' : ''} (toggle above to show)
          </p>
        )}
      </div>

      {filteredActivities.length === 0 && (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-8 text-center`}>
          <Activity size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">No activities found</p>
          <p className="text-sm text-gray-400 mt-2">Try adjusting your filters</p>
        </div>
      )}

      {paginatedActivities.map((activity) => {
        const snapshot = parseSnapshot(activity.snapshot) || {};
        const amountValue = extractActivityAmount(activity, snapshot);
        const amountDisplay = amountValue !== null ? formatCurrency(amountValue) : null;
        const amountColor = getActionColor(activity.action_type);
        const detailItems = buildActivityDetails(activity, snapshot);
        const displayName =
          activity.entity_name ||
          snapshot.entity?.name ||
          snapshot.fund?.name ||
          snapshot.source ||
          'Untitled';
        const detailBadgeClass = darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700';
        
        const activityCanUndo = canUndo(activity);
        const activityIsViewOnly = isViewOnly(activity);

        // COMPACT VIEW for view-only settings changes
        if (activityIsViewOnly) {
          return (
            <div
              key={activity.id}
              className={`${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'} border rounded-lg p-3 opacity-75`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <SettingsIcon size={14} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    {activity.description}
                  </p>
                  <span className="text-xs text-gray-500">
                    {formatDate(activity.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        }

        // FULL VIEW for undoable activities
        return (
          <div
            key={activity.id}
            className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4 hover:shadow-md transition-shadow`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  {getEntityIcon(activity.entity_type, activity.action_type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-semibold capitalize ${getActionColor(activity.action_type)}`}>
                      {activity.action_type.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-500 capitalize">
                      {activity.entity_type.replace('_', ' ')}
                    </span>
                    {isSystemActivity(activity) && (
                      <span className={`text-xs px-2 py-0.5 rounded ${darkMode ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                        Auto
                      </span>
                    )}
                  </div>

                  <h3 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-800'} mb-1`}>
                    {displayName}
                  </h3>

                  <p className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    {activity.description}
                  </p>

                  {detailItems.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {detailItems.map((detail, index) => (
                        <span
                          key={`${activity.id}-${detail.label}-${index}`}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded ${detailBadgeClass}`}
                        >
                          <span className="font-semibold">{detail.label}:</span>
                          <span>{detail.value}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <span className="text-xs text-gray-500">
                    {formatDate(activity.created_at)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                {amountDisplay && (
                  <span className={`text-lg font-semibold ${amountColor}`}>
                    {amountDisplay}
                  </span>
                )}
                {activityCanUndo && (
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
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className={`flex items-center justify-between px-4 py-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg`}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className={`px-4 py-2 rounded-lg ${
              currentPage === 1
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Previous
          </button>
          
          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className={`px-4 py-2 rounded-lg ${
              currentPage === totalPages
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
