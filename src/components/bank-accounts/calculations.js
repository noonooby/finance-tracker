// Pure calculations for the Bank Accounts page. No data access, no React.
import { formatCurrency, formatDate, localDate } from '../../utils/helpers';

export const EMPTY_ACCOUNT_FORM = {
  name: '',
  balance: '',
  account_type: 'checking',
  is_primary: false,
  institution: '',
  allows_overdraft: false,
  overdraft_limit: ''
};

export const emptyTransferData = () => ({
  fromAccount: '',
  toAccount: '',
  amount: '',
  description: 'Account Transfer',
  date: localDate()
});

export const accountToFormData = (account) => ({
  name: account.name,
  balance: account.balance.toString(),
  account_type: account.account_type || 'checking',
  is_primary: account.is_primary || false,
  institution: account.institution || '',
  allows_overdraft: account.allows_overdraft || false,
  overdraft_limit: account.overdraft_limit?.toString() || ''
});

export const normalizeId = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    if (value.id !== undefined) return String(value.id);
    if (value.value !== undefined) return String(value.value);
    return null;
  }
  return String(value);
};

export const sumBalances = (accounts) =>
  accounts.reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0);

export const getLinkedEntities = (accountId, loans, creditCards) => {
  const linkedLoans = (loans || []).filter(loan =>
    loan.connected_payment_source === 'bank_account' &&
    String(loan.connected_payment_source_id) === String(accountId)
  );
  const linkedCards = (creditCards || []).filter(card =>
    card.connected_payment_source === 'bank_account' &&
    String(card.connected_payment_source_id) === String(accountId)
  );
  return { linkedLoans, linkedCards };
};

// Group by institution; within each, primary first, then pinned, then the rest.
export const groupAccountsByInstitution = (bankAccounts, pinnedAccounts) => {
  const groups = {};
  bankAccounts.forEach(account => {
    const institution = account.institution?.trim() || 'Other Accounts';
    if (!groups[institution]) groups[institution] = [];
    groups[institution].push(account);
  });
  Object.keys(groups).forEach(institution => {
    groups[institution].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      const aIsPinned = pinnedAccounts.includes(a.id);
      const bIsPinned = pinnedAccounts.includes(b.id);
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      return 0;
    });
  });
  return groups;
};

// Preview of balances after a cash withdraw/deposit, or null when not applicable.
export const getCashPreview = (bankAccounts, cashFormData, cashOperation, cashInHand) => {
  if (!cashFormData.accountId || !cashFormData.amount) return null;
  const selectedAccount = bankAccounts.find(acc => acc.id === cashFormData.accountId);
  const amount = parseFloat(cashFormData.amount) || 0;
  if (!selectedAccount || amount <= 0) return null;
  const currentBankBalance = Number(selectedAccount.balance) || 0;
  const currentCash = Number(cashInHand) || 0;
  return {
    selectedAccount,
    currentBankBalance,
    currentCash,
    newBankBalance: cashOperation === 'withdraw' ? currentBankBalance - amount : currentBankBalance + amount,
    newCashInHand: cashOperation === 'withdraw' ? currentCash + amount : currentCash - amount
  };
};

export const buildAccountPayload = (formData, editingItem, accountId) => {
  const balance = parseFloat(formData.balance) || 0;
  return {
    id: accountId,
    name: formData.name.trim(),
    balance: balance,
    account_type: formData.account_type,
    is_primary: formData.is_primary,
    institution: formData.institution.trim(),
    allows_overdraft: formData.allows_overdraft || false,
    overdraft_limit: formData.allows_overdraft ? (parseFloat(formData.overdraft_limit) || 0) : 0,
    created_at: editingItem?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
};

export const describeAccountEdit = (editingItem, savedAccount) => {
  const oldBalance = parseFloat(editingItem.balance) || 0;
  const newBalance = parseFloat(savedAccount.balance) || 0;
  const oldType = editingItem.account_type || 'checking';
  const newType = savedAccount.account_type || 'checking';
  const oldInstitution = editingItem.institution || '';
  const newInstitution = savedAccount.institution || '';
  const oldName = editingItem.name || '';
  const newName = savedAccount.name || '';
  const oldPrimary = editingItem.is_primary || false;
  const newPrimary = savedAccount.is_primary || false;
  const oldAllowsOverdraft = editingItem.allows_overdraft || false;
  const newAllowsOverdraft = savedAccount.allows_overdraft || false;
  const oldOverdraftLimit = parseFloat(editingItem.overdraft_limit) || 0;
  const newOverdraftLimit = parseFloat(savedAccount.overdraft_limit) || 0;

  let details = '';
  if (oldName !== newName) details += `Name "${oldName}" → "${newName}" • `;
  if (oldBalance !== newBalance) details += `Balance ${formatCurrency(oldBalance)} → ${formatCurrency(newBalance)} • `;
  if (oldType !== newType) details += `Type ${oldType} → ${newType} • `;
  if (oldInstitution !== newInstitution) {
    if (oldInstitution && newInstitution) {
      details += `Institution "${oldInstitution}" → "${newInstitution}" • `;
    } else if (newInstitution) {
      details += `Institution added "${newInstitution}" • `;
    } else if (oldInstitution) {
      details += `Institution removed "${oldInstitution}" • `;
    }
  }
  if (oldPrimary !== newPrimary) details += newPrimary ? 'Set as primary account • ' : 'Removed primary status • ';
  if (oldAllowsOverdraft !== newAllowsOverdraft) details += newAllowsOverdraft ? 'Enabled overdraft • ' : 'Disabled overdraft • ';
  if (newAllowsOverdraft && oldOverdraftLimit !== newOverdraftLimit) {
    details += `Overdraft limit ${formatCurrency(oldOverdraftLimit)} → ${formatCurrency(newOverdraftLimit)} • `;
  }
  details = details.replace(/ • $/, '');

  return details
    ? `Updated bank account '${savedAccount.name}' - ${details.trim()}`
    : `Updated bank account '${savedAccount.name}'`;
};

export const describeAccountAdd = (savedAccount, balance) => {
  let description = `Added bank account '${savedAccount.name}' - Balance ${formatCurrency(balance)} • Type ${savedAccount.account_type}`;
  if (savedAccount.institution) description += ` • Institution ${savedAccount.institution}`;
  if (savedAccount.is_primary) description += ` • Primary account`;
  return description;
};

export const describeAccountDelete = (account) => {
  let description = `Deleted bank account '${account.name}' - Balance ${formatCurrency(account.balance)} • Type ${account.account_type}`;
  if (account.institution) description += ` • Institution ${account.institution}`;
  return description;
};

export const describeTransfer = (transferResult, transferData) =>
  `Transferred ${formatCurrency(transferResult.amount)} from '${transferResult.fromAccount}' to '${transferResult.toAccount}' on ${formatDate(transferData.date)}${transferData.description !== 'Account Transfer' ? ` - Note: ${transferData.description}` : ''}`;

export const cashLogDetails = (opResult) => ({
  accountId: opResult.accountId,
  accountName: opResult.accountName,
  amount: opResult.amount,
  previousBankBalance: opResult.previousBankBalance,
  newBankBalance: opResult.newBankBalance,
  previousCashInHand: opResult.previousCashInHand,
  newCashInHand: opResult.newCashInHand,
  transactionId: opResult.transactionId
});
