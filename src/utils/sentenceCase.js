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
    'bimonthly': 'Bi-Monthly',
    'bi-monthly': 'Bi-Monthly',
    'quarterly': 'Quarterly',
    'yearly': 'Yearly',
    'annual': 'Annual',
    'daily': 'Daily'
  };
  
  return frequencyMap[frequency.toLowerCase()] || frequency.charAt(0).toUpperCase() + frequency.slice(1).toLowerCase();
}

/**
 * Format payment source for descriptions (lowercase)
 * @param {string} sourceName - The source name
 * @param {string} sourceType - The source type (optional)
 * @returns {string} Formatted source
 */
export function formatPaymentSource(sourceName, sourceType = null) {
  if (!sourceName) return '';
  
  // Source type prefixes should be lowercase
  const typeMap = {
    'cash': 'cash',
    'cash_in_hand': 'cash in hand',
    'bank_account': 'bank account',
    'credit_card': 'credit card',
    'reserved_fund': 'reserved fund'
  };
  
  if (sourceType && typeMap[sourceType]) {
    return `${typeMap[sourceType]}: ${sourceName}`;
  }
  
  // Just the name
  return sourceName;
}

/**
 * Format account type for display (Sentence Case)
 * @param {string} type - The account type
 * @returns {string} Formatted type
 */
export function formatAccountType(type) {
  if (!type) return '';
  
  const typeMap = {
    'checking': 'Checking',
    'savings': 'Savings',
    'investment': 'Investment',
    'cash': 'Cash',
    'credit_card': 'Credit Card',
    'loan': 'Loan',
    'bank_account': 'Bank Account'
  };
  
  return typeMap[type.toLowerCase()] || type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

/**
 * Format entity type for descriptions (lowercase in middle of sentence)
 * @param {string} type - The entity type
 * @returns {string} Formatted type
 */
export function formatEntityType(type) {
  if (!type) return '';
  
  const typeMap = {
    'card': 'card',
    'credit_card': 'credit card',
    'loan': 'loan',
    'fund': 'fund',
    'reserved_fund': 'reserved fund',
    'income': 'income',
    'bank_account': 'bank account',
    'transaction': 'transaction',
    'category': 'category'
  };
  
  return typeMap[type.toLowerCase()] || type.toLowerCase().replace('_', ' ');
}

/**
 * Build a payment description in proper Sentence Case
 * @param {number} amount - Payment amount
 * @param {string} entityName - Name of card/loan being paid
 * @param {string} sourceName - Name of payment source
 * @returns {string} Properly formatted description
 */
export function buildPaymentDescription(amount, entityName, sourceName) {
  // Format: "Payment of $X for 'EntityName' from source"
  // Note: "from" is lowercase as it's in the middle of the sentence
  return `Payment of $${amount.toFixed(2)} for '${entityName}' from ${sourceName}`;
}

/**
 * Build a transaction description in proper Sentence Case
 * @param {string} action - The action (added, updated, deleted, etc.)
 * @param {string} entityType - Type of entity
 * @param {string} entityName - Name of entity
 * @param {string} details - Additional details (optional)
 * @returns {string} Properly formatted description
 */
export function buildDescription(action, entityType, entityName, details = '') {
  // Action should be capitalized (start of sentence)
  const capitalizedAction = action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
  
  // Entity type should be lowercase
  const formattedType = formatEntityType(entityType);
  
  // Format: "Action entityType 'EntityName' - details"
  let description = `${capitalizedAction} ${formattedType} '${entityName}'`;
  
  if (details) {
    description += ` - ${details}`;
  }
  
  return description;
}

/**
 * Format a change description (for edits)
 * @param {string} field - Field name
 * @param {any} oldValue - Old value
 * @param {any} newValue - New value
 * @returns {string} Formatted change description
 */
export function formatChange(field, oldValue, newValue) {
  // Field names should be in Sentence Case
  const formattedField = field.charAt(0).toUpperCase() + field.slice(1).toLowerCase().replace('_', ' ');
  
  return `${formattedField} ${oldValue} → ${newValue}`;
}

/**
 * Capitalize first letter only (Sentence Case)
 * @param {string} text - Text to format
 * @returns {string} Sentence case text
 */
export function toSentenceCase(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
