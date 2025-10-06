// Utility functions for formatting and calculations

export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const getDaysUntil = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const predictNextDate = (lastDate, frequency) => {
  const date = new Date(lastDate);
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'bimonthly':
      date.setMonth(date.getMonth() + 2);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().split('T')[0];
};

export const DEFAULT_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', color: '#10b981' },
  { id: 'utilities', name: 'Utilities', color: '#f59e0b' },
  { id: 'transportation', name: 'Transportation', color: '#3b82f6' },
  { id: 'entertainment', name: 'Entertainment', color: '#8b5cf6' },
  { id: 'healthcare', name: 'Healthcare', color: '#ef4444' },
  { id: 'dining', name: 'Dining', color: '#ec4899' },
  { id: 'shopping', name: 'Shopping', color: '#06b6d4' },
  { id: 'other', name: 'Other', color: '#6b7280' }
];
