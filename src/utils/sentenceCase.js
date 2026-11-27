/**
 * Sentence Case Utilities
 * 
 * All user-facing text in the app must follow Sentence Case formatting:
 * - First letter capitalized
 * - Rest lowercase except proper nouns
 * - Applies to descriptions, frequencies, types, etc.
 */

/**
 * Format frequency for display (Sentence Case)
 * @param {string} frequency - The frequency value
 * @returns {string} Formatted frequency
 */
export function formatFrequency(frequency) {
  if (!frequency) return '';
  
  const frequencyMap = {
    'onetime': 'One Time',
    'one-time': 'One Time',
    'weekly': 'Weekly',
    'biweekly': 'Bi-Weekly',
    'bi-weekly': 'Bi-Weekly',
    'monthly': 'Monthly',
    'bimonthly': 'Every 2 months',
    'bi-monthly': 'Bi-Monthly',
    'quarterly': 'Quarterly',
    'yearly': 'Yearly',
    'annual': 'Annual',
    'daily': 'Daily'
  };
  
  return frequencyMap[frequency.toLowerCase()] || frequency.charAt(0).toUpperCase() + frequency.slice(1).toLowerCase();
}

