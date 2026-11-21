// Pure helpers for the credit cards page: no state, no data access.
import { formatCurrency, formatDate, getDaysUntil, localDate, defaultBankAccount } from '../../utils/helpers';

export function emptyCardForm(defaultDays, bankAccounts) {
  const account = defaultBankAccount(bankAccounts);
  return {
    name: '',
    balance: '',
    creditLimit: '',
    dueDate: localDate(),
    statementDay: '',
    interestRate: '',
    alertDays: defaultDays || 7,
    isGiftCard: false,
    purchaseDate: localDate(),
    purchaseAmount: '',
    purchaseAmountPaid: '',
    giftCardPaymentMethod: account ? 'bank_account' : '',
    giftCardPaymentMethodId: account?.id || null,
    hasExpiry: false,
    expiryDate: '',
    connectedPaymentSource: null,
    connectedPaymentSourceId: null,
    autopayMode: 'statement',
    autopayFixed: '',
    minimumPayment: '',
    promoRate: '',
    promoEnd: '',
    cashRate: '',
    annualFee: '',
    ratesSource: '',
    ratesChecked: ''
  };
}

export function formFromCard(card, defaultDays, bankAccounts) {
  const account = defaultBankAccount(bankAccounts);
  return {
    name: card.name,
    balance: (parseFloat(card.balance) || 0).toFixed(2),
    creditLimit: card.credit_limit ? (parseFloat(card.credit_limit)).toFixed(2) : '',
    dueDate: card.due_date || '',
    statementDay: card.statement_day?.toString() || '',
    interestRate: card.interest_rate ? (parseFloat(card.interest_rate)).toFixed(2) : '',
    alertDays: card.alert_days?.toString() || (defaultDays || 7).toString(),
    isGiftCard: card.is_gift_card || false,
    purchaseDate: card.purchase_date || localDate(),
    purchaseAmount: card.purchase_amount ? (parseFloat(card.purchase_amount)).toFixed(2) : '',
    purchaseAmountPaid: card.purchase_amount_paid ? (parseFloat(card.purchase_amount_paid)).toFixed(2) : card.purchase_amount ? (parseFloat(card.purchase_amount)).toFixed(2) : '',
    giftCardPaymentMethod: account ? 'bank_account' : '',
    giftCardPaymentMethodId: account?.id || null,
    hasExpiry: card.has_expiry || false,
    expiryDate: card.expiry_date || '',
    connectedPaymentSource: card.connected_payment_source || null,
    connectedPaymentSourceId: card.connected_payment_source_id || null,
    autopayMode: card.autopay_mode || 'statement',
    autopayFixed: card.autopay_fixed ? String(card.autopay_fixed) : '',
    minimumPayment: card.minimum_payment ? String(card.minimum_payment) : '',
    promoRate: card.promo_rate != null && card.promo_rate !== '' ? String(card.promo_rate) : '',
    promoEnd: card.promo_end || '',
    cashRate: card.cash_rate ? String(card.cash_rate) : '',
    annualFee: card.annual_fee ? String(card.annual_fee) : '',
    ratesSource: card.rates_source || '',
    ratesChecked: card.rates_checked || ''
  };
}

// Returns an error message, or null when the form can be saved.
export function validateCardForm(formData, isEditing = false) {
  if (!formData.name || !formData.balance) return 'Fill in required fields: Name and Balance';
  if (!formData.isGiftCard && !formData.dueDate) return 'Credit cards require a Due Date';
  if (formData.isGiftCard && !formData.purchaseAmount) return 'Gift cards require an Original Value';
  if (formData.isGiftCard && !formData.purchaseAmountPaid) return 'Gift cards require a Purchase Amount Paid';
  if (formData.isGiftCard && !isEditing && !formData.giftCardPaymentMethodId) return 'Choose how you paid for the gift card';
  if (formData.isGiftCard && formData.hasExpiry && !formData.expiryDate) {
    return 'Specify the expiry date or uncheck "has expiry"';
  }
  return null;
}

export function cardFromForm(formData, { id, createdAt, defaultDays }) {
  const gift = formData.isGiftCard;
  return {
    id,
    name: formData.name,
    balance: parseFloat(formData.balance) || 0,
    credit_limit: gift ? 0 : (parseFloat(formData.creditLimit) || 0),
    due_date: gift ? null : (formData.dueDate || null),
    statement_day: gift ? 0 : (parseInt(formData.statementDay) || 0),
    interest_rate: gift ? 0 : (parseFloat(formData.interestRate) || 0),
    alert_days: gift ? 0 : (parseInt(formData.alertDays) || defaultDays),
    is_gift_card: gift || false,
    purchase_date: gift ? (formData.purchaseDate || null) : null,
    purchase_amount: gift ? (parseFloat(formData.purchaseAmount) || 0) : 0,
    purchase_amount_paid: gift ? (parseFloat(formData.purchaseAmountPaid) || 0) : 0,
    has_expiry: gift ? (formData.hasExpiry || false) : false,
    expiry_date: gift && formData.hasExpiry ? (formData.expiryDate || null) : null,
    connected_payment_source: gift ? null : (formData.connectedPaymentSource || null),
    connected_payment_source_id: gift ? null : (formData.connectedPaymentSourceId || null),
    autopay_mode: gift ? null : (formData.autopayMode || 'statement'),
    autopay_fixed: gift ? 0 : (parseFloat(formData.autopayFixed) || 0),
    minimum_payment: gift ? 0 : (parseFloat(formData.minimumPayment) || 0),
    promo_rate: gift || formData.promoRate === '' ? null : (parseFloat(formData.promoRate) || 0),
    promo_end: gift ? null : (formData.promoEnd || null),
    cash_rate: gift ? 0 : (parseFloat(formData.cashRate) || 0),
    annual_fee: gift ? 0 : (parseFloat(formData.annualFee) || 0),
    rates_source: gift ? null : (formData.ratesSource || null),
    rates_checked: gift ? null : (formData.ratesChecked || null),
    created_at: createdAt || new Date().toISOString()
  };
}

export function describeNewCard(savedCard, name) {
  return `Added credit card '${name}' - Balance ${formatCurrency(savedCard.balance)} • Limit ${formatCurrency(savedCard.credit_limit)} • Rate ${savedCard.interest_rate || 0}% • Due ${savedCard.due_date ? formatDate(savedCard.due_date) : 'N/A'}`;
}

export function describeCardEdit(editingItem, savedCard, newCard, isGiftCard) {
  const oldName = editingItem.name || '';
  const newName = savedCard?.name || newCard.name || '';
  const oldBalance = parseFloat(editingItem.balance) || 0;
  const newBalance = parseFloat(savedCard.balance) || 0;
  const oldLimit = parseFloat(editingItem.credit_limit) || 0;
  const newLimit = parseFloat(savedCard.credit_limit) || 0;
  const oldDueDate = editingItem.due_date || '';
  const newDueDate = savedCard.due_date || newCard.due_date || '';
  const oldStatementDay = parseInt(editingItem.statement_day) || 0;
  const newStatementDay = parseInt(savedCard.statement_day) || parseInt(newCard.statement_day) || 0;
  const oldInterestRate = parseFloat(editingItem.interest_rate) || 0;
  const newInterestRate = parseFloat(savedCard.interest_rate) || parseFloat(newCard.interest_rate) || 0;
  const oldAlertDays = parseInt(editingItem.alert_days) || 7;
  const newAlertDays = parseInt(savedCard.alert_days) || parseInt(newCard.alert_days) || 7;
  const oldExpiryDate = editingItem.expiry_date || '';
  const newExpiryDate = savedCard.expiry_date || newCard.expiry_date || '';
  const oldHasExpiry = editingItem.has_expiry || false;
  const newHasExpiry = savedCard.has_expiry || newCard.has_expiry || false;

  let details = '';
  if (oldName !== newName) details += `Name "${oldName}" → "${newName}" • `;
  if (oldBalance !== newBalance) details += `Balance ${formatCurrency(oldBalance)} → ${formatCurrency(newBalance)} • `;
  if (!isGiftCard && oldLimit !== newLimit) details += `Limit ${formatCurrency(oldLimit)} → ${formatCurrency(newLimit)} • `;
  if (!isGiftCard && oldDueDate !== newDueDate) details += `Due date ${oldDueDate ? formatDate(oldDueDate) : 'None'} → ${newDueDate ? formatDate(newDueDate) : 'None'} • `;
  if (!isGiftCard && oldStatementDay !== newStatementDay) details += `Statement day ${oldStatementDay || 'None'} → ${newStatementDay || 'None'} • `;
  if (!isGiftCard && oldInterestRate !== newInterestRate) details += `Interest rate ${oldInterestRate}% → ${newInterestRate}% • `;
  if (!isGiftCard && oldAlertDays !== newAlertDays) details += `Alert days ${oldAlertDays} → ${newAlertDays} • `;
  if (isGiftCard && (oldHasExpiry !== newHasExpiry || (newHasExpiry && oldExpiryDate !== newExpiryDate))) {
    if (!oldHasExpiry && newHasExpiry) {
      details += `Added expiry date ${formatDate(newExpiryDate)} • `;
    } else if (oldHasExpiry && !newHasExpiry) {
      details += `Removed expiry date • `;
    } else if (oldExpiryDate !== newExpiryDate) {
      details += `Expiry date ${formatDate(oldExpiryDate)} → ${formatDate(newExpiryDate)} • `;
    }
  }
  details = details.replace(/ • $/, '');

  const cardType = isGiftCard ? 'gift card' : 'credit card';
  const name = savedCard?.name || newCard.name;
  return details
    ? `Updated ${cardType} '${name}' - ${details}`
    : `Updated ${cardType} '${name}'`;
}

export function describeDeletedCard(card, cardType) {
  return `Deleted ${cardType} '${card.name}' - Balance ${formatCurrency(card.balance)}${!card.is_gift_card ? ` • Limit ${formatCurrency(card.credit_limit)} • Rate ${card.interest_rate || 0}% • Due ${card.due_date ? formatDate(card.due_date) : 'N/A'}` : ''}`;
}

export function normalizeId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    if (value.id !== undefined) return String(value.id);
    if (value.value !== undefined) return String(value.value);
    return null;
  }
  return String(value);
}

export function sortPinnedFirst(cards, pinnedIds) {
  return [...cards].sort((a, b) => {
    const aIsPinned = pinnedIds.includes(a.id);
    const bIsPinned = pinnedIds.includes(b.id);
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });
}

export function paymentSourceOptions(bankAccounts) {
  const sources = [{ value: '', label: 'None (Manual Payment)' }];
  if (bankAccounts && bankAccounts.length > 0) {
    bankAccounts.forEach(account => {
      sources.push({
        value: `bank_account:${account.id}`,
        label: `Account: ${account.name}${account.is_primary ? ' (Primary)' : ''}`
      });
    });
  }
  return sources;
}

export function paymentSourceValue(formData) {
  // A source with no account (cash before it was an account) counts as none.
  if (!formData.connectedPaymentSource || !formData.connectedPaymentSourceId) return '';
  return `${formData.connectedPaymentSource}:${formData.connectedPaymentSourceId}`;
}

export function parsePaymentSource(value) {
  if (!value) return { connectedPaymentSource: null, connectedPaymentSourceId: null };
  const [sourceType, sourceId] = value.includes(':') ? value.split(':') : [value, null];
  return { connectedPaymentSource: sourceType, connectedPaymentSourceId: sourceId };
}

export function giftCardReloadText(card, amountAdded, amountPaid) {
  const differs = amountPaid !== amountAdded;
  return {
    description: differs
      ? `Gift Card Reload: ${card.name} (${formatCurrency(amountPaid)} paid, ${formatCurrency(amountAdded)} loaded)`
      : `Gift Card Reload: ${card.name}`,
    notes: differs
      ? `Added ${formatCurrency(amountAdded)} to ${card.name} (paid ${formatCurrency(amountPaid)})`
      : `Added ${formatCurrency(amountAdded)} to ${card.name}`
  };
}

export function expiryStatus(expiryDate) {
  const days = getDaysUntil(expiryDate);
  if (days < 0) return { tone: 'expired', text: 'EXPIRED' };
  if (days < 30) return { tone: 'soon', text: `Expires in ${days} days` };
  return { tone: 'normal', text: `Expires: ${formatDate(expiryDate)}` };
}
