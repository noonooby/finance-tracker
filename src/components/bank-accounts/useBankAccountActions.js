// State and data access for the Bank Accounts page.
// All money changes go through utils/db and utils/money, as before.
import { useState, useEffect, useRef, useMemo } from 'react';
import { formatCurrency, generateId, validateBankAccountData, localDate } from '../../utils/helpers';
import useAsyncAction from '../../hooks/useAsyncAction';
import { showToast } from '../../utils/toast';
import {
  upsertBankAccount,
  deleteBankAccount,
  transferBetweenAccounts,
  withdrawCashFromBank,
  depositCashToBank,
  dbOperation
} from '../../utils/db';
import { logActivity } from '../../utils/activityLogger';
import { recordAdjustment } from '../../utils/money';
import { getUserPreferences, togglePinnedBankAccount } from '../../utils/userPreferencesManager';
import { saveTransferContext, getRecentTransferDescriptions } from '../../utils/formContexts';
import {
  EMPTY_ACCOUNT_FORM,
  emptyTransferData,
  accountToFormData,
  groupAccountsByInstitution,
  buildAccountPayload,
  describeAccountEdit,
  describeAccountAdd,
  describeAccountDelete,
  describeTransfer,
  cashLogDetails
} from './calculations';

export default function useBankAccountActions({
  bankAccounts,
  creditCards,
  onUpdate,
  cashInHand,
  onReloadAll
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pinnedAccounts, setPinnedAccounts] = useState([]);

  const { executeAction, isProcessing: isActionProcessing } = useAsyncAction();

  const [showCashModal, setShowCashModal] = useState(false);
  const [cashOperation, setCashOperation] = useState('withdraw');
  const [cashFormData, setCashFormData] = useState({ accountId: '', amount: '' });

  const [collapsedInstitutions, setCollapsedInstitutions] = useState([]);
  const toggleInstitution = (institution) => {
    setCollapsedInstitutions(prev =>
      prev.includes(institution)
        ? prev.filter(i => i !== institution)
        : [...prev, institution]
    );
  };

  const [formData, setFormData] = useState(EMPTY_ACCOUNT_FORM);
  const [recentAccountNames, setRecentAccountNames] = useState([]);
  const accountNameInputRef = useRef(null);

  const [transferData, setTransferData] = useState(emptyTransferData);
  const [recentTransfers, setRecentTransfers] = useState([]);

  const loadRecentTransfers = async () => {
    try {
      const recent = await getRecentTransferDescriptions(5);
      setRecentTransfers(recent);
    } catch (error) {
      console.error('Error loading recent transfers:', error);
    }
  };

  const loadRecentAccountNames = async () => {
    try {
      const { fetchSuggestions } = await import('../../utils/knownEntities');
      const recent = await fetchSuggestions('bank_account', '', 5);
      setRecentAccountNames(recent);
    } catch (error) {
      console.error('Error loading recent account names:', error);
    }
  };

  const loadPinnedAccounts = async () => {
    try {
      const prefs = await getUserPreferences();
      setPinnedAccounts(prefs.pinned_bank_accounts || []);
    } catch (error) {
      console.error('Error loading pinned accounts:', error);
    }
  };

  useEffect(() => {
    loadPinnedAccounts();
    loadRecentTransfers();
    loadRecentAccountNames();
  }, []);

  const handleSelectAccountName = (accountEntity) => {
    setFormData(prev => ({ ...prev, name: accountEntity.name }));
    setTimeout(() => {
      const balanceInput = document.querySelector('input[placeholder="0.00"]');
      if (balanceInput) balanceInput.focus();
    }, 50);
  };

  const handleTogglePin = async (accountId) => {
    try {
      await togglePinnedBankAccount(accountId);
      await loadPinnedAccounts();
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  const groupedAccounts = useMemo(
    () => groupAccountsByInstitution(bankAccounts, pinnedAccounts),
    [bankAccounts, pinnedAccounts]
  );

  const resetForm = () => {
    setFormData(EMPTY_ACCOUNT_FORM);
    setShowAddForm(false);
    setEditingItem(null);
    loadRecentAccountNames().catch(console.error);
  };

  const handleEdit = (account) => {
    setFormData(accountToFormData(account));
    setEditingItem(account);
    setShowAddForm(true);
  };

  const handleAdd = async () => {
    if (saving) return;

    const errors = validateBankAccountData({
      name: formData.name,
      balance: formData.balance,
      account_type: formData.account_type
    });
    if (errors.length > 0) {
      showToast.error(errors.join('\n'));
      return;
    }

    // Warn when a manual balance change does not match transaction history
    if (editingItem) {
      const oldBalance = parseFloat(editingItem.balance) || 0;
      const newBalance = parseFloat(formData.balance) || 0;
      const balanceChange = newBalance - oldBalance;

      if (Math.abs(balanceChange) > 0.01) {
        try {
          const transactions = await dbOperation('transactions', 'getAll');
          const accountTransactions = (transactions || []).filter(t =>
            t.payment_method_id === editingItem.id ||
            t.from_account_id === editingItem.id ||
            t.to_account_id === editingItem.id
          );
          if (accountTransactions.length > 0 && Math.abs(balanceChange) > 1) {
            const proceed = window.confirm(
              `Balance Traceability Warning\n\n` +
              `You're changing the balance by ${formatCurrency(Math.abs(balanceChange))}.\n\n` +
              `This account has ${accountTransactions.length} transaction(s) in history.\n` +
              `Manual balance changes may cause discrepancies in your records.\n\n` +
              `Consider:\n` +
              `- Adding income if you received money\n` +
              `- Using Transfer if moving between accounts\n` +
              `- Using Cash Operations if withdrawing/depositing\n\n` +
              `Continue with manual balance change?`
            );
            if (!proceed) return;
          }
        } catch (error) {
          console.warn('Unable to validate balance change:', error);
        }
      }
    }

    setSaving(true);

    const actionId = editingItem ? `edit-account-${editingItem.id}` : 'add-account';

    const result = await executeAction(actionId, async () => {
      const accountId = editingItem?.id || generateId();
      const accountPayload = buildAccountPayload(formData, editingItem, accountId);
      const savedAccount = await upsertBankAccount(accountPayload);

      if (editingItem) {
        await logActivity(
          'edit',
          'bank_account',
          savedAccount.id,
          savedAccount.name,
          describeAccountEdit(editingItem, savedAccount),
          {
            previous: { ...editingItem, id: editingItem?.id || savedAccount.id, name: editingItem?.name || savedAccount.name },
            updated: { ...savedAccount, id: savedAccount?.id, name: savedAccount?.name }
          }
        );
      } else {
        await logActivity(
          'add',
          'bank_account',
          savedAccount.id,
          savedAccount.name,
          describeAccountAdd(savedAccount, accountPayload.balance),
          savedAccount
        );
      }

      if (accountPayload.name) {
        const { upsertKnownEntity } = await import('../../utils/knownEntities');
        upsertKnownEntity('bank_account', accountPayload.name).catch(err =>
          console.warn('Failed to track account name:', err)
        );
      }

      await onUpdate();
      resetForm();
      setSaving(false);

      return { accountName: savedAccount.name, isNew: !editingItem };
    });

    if (result.success) {
      const action = result.data.isNew ? 'added' : 'updated';
      showToast.success(`Bank account '${result.data.accountName}' ${action} successfully`);
    } else {
      showToast.error(`Failed to save account: ${result.error.message}`);
    }
  };

  const handleCashOperation = async () => {
    if (!cashFormData.accountId || !cashFormData.amount) {
      showToast.error('Please select an account and enter an amount');
      return;
    }
    const amount = parseFloat(cashFormData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast.error('Please enter a valid amount');
      return;
    }

    const actionId = `cash-${cashOperation}-${cashFormData.accountId}`;

    const actionResult = await executeAction(actionId, async () => {
      let opResult;
      if (cashOperation === 'withdraw') {
        opResult = await withdrawCashFromBank(cashFormData.accountId, amount);
        await logActivity(
          'cash_withdrawal',
          'bank_account',
          opResult.accountId,
          opResult.accountName,
          `Withdrew ${formatCurrency(opResult.amount)} from '${opResult.accountName}' to cash in hand`,
          cashLogDetails(opResult)
        );
      } else {
        opResult = await depositCashToBank(cashFormData.accountId, amount);
        await logActivity(
          'cash_deposit',
          'bank_account',
          opResult.accountId,
          opResult.accountName,
          `Deposited ${formatCurrency(opResult.amount)} from cash in hand to '${opResult.accountName}'`,
          cashLogDetails(opResult)
        );
      }

      if (onReloadAll) await onReloadAll();

      setCashFormData({ accountId: '', amount: '' });
      setShowCashModal(false);

      return { operation: cashOperation, accountName: opResult.accountName, amount: opResult.amount };
    });

    if (actionResult.success) {
      const operationText = actionResult.data.operation === 'withdraw' ? 'withdrawn from' : 'deposited to';
      showToast.success(
        `${formatCurrency(actionResult.data.amount)} ${operationText} ${actionResult.data.accountName}`
      );
    } else {
      showToast.error(`Cash operation failed: ${actionResult.error.message}`);
    }
  };

  // Correct the cash-in-hand figure; recorded as an adjustment so it shows in history and can be undone.
  const handleEditCashInHand = async () => {
    const newAmount = prompt(`Enter new cash in hand amount:`, (cashInHand || 0).toString());
    if (newAmount === null) return;

    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 0) {
      showToast.error('Please enter a valid amount');
      return;
    }

    const oldAmount = Number(cashInHand) || 0;
    try {
      const res = await recordAdjustment(
        { target: 'cash_in_hand', newBalance: amount, current: oldAmount, date: localDate(), description: 'Cash in hand correction' },
        { bankAccounts, creditCards }
      );
      if (res.transaction) {
        await logActivity(
          'cash_adjustment',
          'cash_in_hand',
          'cash-in-hand',
          'Cash in Hand',
          `Updated cash in hand from ${formatCurrency(oldAmount)} to ${formatCurrency(amount)}`,
          { previousValue: oldAmount, newValue: amount, transactionId: res.transaction.id }
        );
      }
      if (onReloadAll) await onReloadAll(); else await onUpdate();
    } catch (err) {
      showToast.error(err.message || 'Could not update cash in hand');
      return;
    }

    showToast.success('Cash in hand updated');
  };

  const handleDelete = async (accountId) => {
    const account = bankAccounts.find(acc => acc.id === accountId);
    if (!account) return;

    if (account.is_primary) {
      showToast.error('Cannot delete the primary account. Set another account as primary first, then delete this one.');
      return;
    }

    if (!window.confirm(`Delete bank account "${account.name}"?\n\nThis action cannot be undone. Any reserved funds or income linked to this account will be unlinked.`)) {
      return;
    }

    const result = await executeAction(`delete-account-${accountId}`, async () => {
      // Log before deletion so it can be undone
      await logActivity('delete', 'bank_account', accountId, account.name, describeAccountDelete(account), account);
      await deleteBankAccount(accountId);
      await onUpdate();
      return { accountName: account.name };
    });

    if (result.success) {
      showToast.success(`${result.data.accountName} deleted successfully`);
    } else {
      showToast.error(`Failed to delete account: ${result.error.message}`);
    }
  };

  const handleSetPrimary = async (account) => {
    if (account.is_primary) return;

    try {
      const updatedAccount = { ...account, is_primary: true };
      await upsertBankAccount(updatedAccount);
      await logActivity(
        'edit',
        'bank_account',
        account.id,
        account.name,
        `Set '${account.name}' as primary account`,
        { previous: account, updated: updatedAccount }
      );
      await onUpdate();
    } catch (error) {
      console.error('Error setting primary account:', error);
      showToast.error(`Failed to set primary account: ${error.message}`);
    }
  };

  const resetTransferForm = () => {
    setTransferData(emptyTransferData());
    setShowTransferForm(false);
  };

  const handleTransfer = async () => {
    if (saving) return;

    if (!transferData.fromAccount || !transferData.toAccount) {
      showToast.error('Please select both source and destination accounts');
      return;
    }
    if (transferData.fromAccount === transferData.toAccount) {
      showToast.error('Cannot transfer to the same account');
      return;
    }

    const rawAmount = parseFloat(transferData.amount);
    const amount = Math.round(rawAmount * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast.error('Please enter a valid transfer amount');
      return;
    }

    const sourceAccount = bankAccounts.find(a => String(a.id) === String(transferData.fromAccount));
    const destinationAccount = bankAccounts.find(a => String(a.id) === String(transferData.toAccount));
    if (!sourceAccount || !destinationAccount) {
      showToast.error('Unable to load selected accounts. Please refresh and try again.');
      return;
    }

    const sourceBalance = Number(sourceAccount.balance) || 0;
    const destinationBalance = Number(destinationAccount.balance) || 0;

    // The server checks the balance and overdraft limit when the transfer is recorded.
    setSaving(true);

    const result = await executeAction('transfer-accounts', async () => {
      const transferResult = await transferBetweenAccounts(
        transferData.fromAccount,
        transferData.toAccount,
        amount,
        transferData.description,
        transferData.date
      );

      await logActivity(
        'transfer',
        'bank_account',
        transferResult.fromAccountId || transferData.fromAccount,
        transferResult.fromAccount,
        describeTransfer(transferResult, transferData),
        {
          fromAccount: transferResult.fromAccountId || transferData.fromAccount,
          toAccount: transferResult.toAccountId || transferData.toAccount,
          fromAccountName: transferResult.fromAccount,
          toAccountName: transferResult.toAccount,
          amount: transferResult.amount,
          description: transferData.description,
          date: transferData.date,
          transactionId: transferResult.transactionId,
          fromPreviousBalance: sourceBalance,
          toPreviousBalance: destinationBalance,
          fromNewBalance: transferResult.fromBalance,
          toNewBalance: transferResult.toBalance
        }
      );

      await onUpdate();
      resetTransferForm();

      if (transferData.description) {
        saveTransferContext(transferData.description, {
          fromAccountId: transferData.fromAccount,
          toAccountId: transferData.toAccount,
          fromAccountName: transferResult.fromAccount,
          toAccountName: transferResult.toAccount
        }).catch(err => console.warn('Failed to save transfer context:', err));
      }

      return {
        amount: transferResult.amount,
        fromAccount: transferResult.fromAccount,
        toAccount: transferResult.toAccount
      };
    });

    setSaving(false);

    if (result.success) {
      showToast.success(
        `${formatCurrency(result.data.amount)} transferred from ${result.data.fromAccount} to ${result.data.toAccount}`
      );
    } else {
      showToast.error(`Transfer failed: ${result.error.message}`);
    }
  };

  const closeCashForm = () => {
    setCashFormData({ accountId: '', amount: '' });
    setShowCashModal(false);
  };

  return {
    // state
    showAddForm, setShowAddForm,
    editingItem, setEditingItem,
    showTransferForm, setShowTransferForm,
    pinnedAccounts,
    showCashModal, setShowCashModal,
    cashOperation, setCashOperation,
    cashFormData, setCashFormData,
    collapsedInstitutions, toggleInstitution,
    formData, setFormData,
    recentAccountNames, accountNameInputRef,
    transferData, setTransferData,
    recentTransfers,
    groupedAccounts,
    isActionProcessing,
    // handlers
    handleSelectAccountName,
    handleTogglePin,
    resetForm,
    handleEdit,
    handleAdd,
    handleCashOperation,
    handleEditCashInHand,
    handleDelete,
    handleSetPrimary,
    handleTransfer,
    resetTransferForm,
    closeCashForm
  };
}
