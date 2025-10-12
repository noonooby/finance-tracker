import React, { useState, useEffect } from 'react';
import { Undo2, Activity, CreditCard, TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { undoActivity } from '../utils/activityLogger';

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
    snapshot.amountUsed
  ];

  for (const candidate of amountCandidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric !== 0) {
      return Math.abs(numeric);
    }
  }

  if (Array.isArray(snapshot.affectedFund)) {
    const total = snapshot.affectedFund.reduce((sum, entry) => {
      const amount = Number(entry?.amountUsed ?? entry?.amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    if (total) return Math.abs(total);
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

      {activities.map((activity) => {
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

        return (
          <div
            key={activity.id}
            className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4 hover:shadow-md transition-shadow`}
          >
            <div className="flex items-start justify-between gap-4">
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
