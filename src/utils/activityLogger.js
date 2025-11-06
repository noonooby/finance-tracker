import { supabase } from './supabase';
import { dbOperation } from './db';

/**
 * Helper to update bank account balance directly
 */
async function updateBankAccountBalance(accountId, newBalance) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('bank_accounts')
    .update({
      balance: newBalance,
      updated_at: new Date().toISOString()
    })
    .eq('id', accountId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Logs an activity to the Supabase "activities" table.
 * @param {string} actionType - add | edit | delete | payment
 * @param {string} entityType - card | loan | fund | income
 * @param {string} entityId - affected record ID
 * @param {string} entityName - human-readable entity name
 * @param {string} description - readable description for activity feed
 * @param {object|null} snapshot - optional object with previous state for undo
 */
export const logActivity = async (
  actionType,
  entityType,
  entityId,
  entityName,
  description,
  snapshot = null
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const activity = {
      id: crypto.randomUUID(),
      user_id: user.id,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      description,
      snapshot,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('activities').insert(activity);
    if (error) throw error;

  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

/**
 * Undoes a previously logged activity by restoring or deleting data
 * depending on the original action.
 * Used when the user clicks "Undo" in the Activity Feed.
 */
export const undoActivity = async (activity, onUpdate) => {
  try {
    const { action_type, entity_type, entity_id, snapshot } = activity;

    const markTransactionUndone = async (transactionId) => {
      if (!transactionId) return;
      try {
        const transaction = await dbOperation('transactions', 'get', transactionId);
        if (transaction) {
          await dbOperation('transactions', 'put', {
            ...transaction,
            status: 'undone',
            undone_at: new Date().toISOString()
          }, { skipActivityLog: true });
        }
      } catch (transactionError) {
        console.warn('Unable to mark transaction as undone:', transactionError);
      }
    };

    switch (action_type) {
      case 'add':
        if (entity_type === 'bank_account') {
          // Undo bank account add = delete the bank account
          try {
            const { deleteBankAccount } = await import('./db');
            await deleteBankAccount(entity_id);
          } catch (error) {
            console.error('Error undoing bank account add:', error);
          }
        } else if (entity_type === 'income') {
          // Undo income add = delete income AND restore bank/cash balance
          await dbOperation('income', 'delete', entity_id, { skipActivityLog: true });
          
          if (snapshot) {
            // Reverse the deposit
            if (snapshot.depositTarget === 'bank' && snapshot.depositAccountId) {
              try {
                const { getBankAccount } = await import('./db');
                const bankAccount = await getBankAccount(snapshot.depositAccountId);
                if (bankAccount) {
                  const currentBalance = Number(bankAccount.balance) || 0;
                  const amount = Number(snapshot.amount) || 0;
                  const restoredBalance = Math.max(0, currentBalance - amount);
                  await updateBankAccountBalance(snapshot.depositAccountId, restoredBalance);
                  console.log('✅ Bank account balance restored after undoing income add');
                }
              } catch (error) {
                console.error('Error restoring bank account for income add undo:', error);
              }
            } else if (snapshot.depositTarget === 'cash_in_hand') {
              try {
                const { getCashInHand, updateCashInHand } = await import('./db');
                const currentCashInHand = await getCashInHand();
                const amount = Number(snapshot.amount) || 0;
                const restoredCashInHand = Math.max(0, currentCashInHand - amount);
                await updateCashInHand(restoredCashInHand);
                console.log('✅ Cash in hand restored after undoing income add');
              } catch (error) {
                console.error('Error restoring cash in hand for income add undo:', error);
              }
            }
            
            if (snapshot.transactionId) {
              await markTransactionUndone(snapshot.transactionId);
            }
          }
        } else if (entity_type === 'card' && snapshot?.isGiftCard) {
          // Delete the gift card
          await dbOperation('creditCards', 'delete', entity_id, { skipActivityLog: true });

          if (snapshot.amount) {
            const amount = Number(snapshot.amount) || 0;
            const paymentType = snapshot.paymentMethodType || (snapshot.paymentMethod === 'Cash' ? 'cash' : null);

            // Refund based on payment method type
            if (paymentType === 'cash') {
              // Refund to cash
              const cashSetting = await dbOperation('settings', 'get', 'availableCash');
              const currentCash = Number(cashSetting?.value) || 0;
              await dbOperation('settings', 'put', {
                key: 'availableCash',
                value: currentCash + amount
              });
            } else if (paymentType === 'bank_account' && snapshot.paymentMethodId) {
              // Refund to bank account
              try {
                const { getBankAccount } = await import('./db');
                const bankAccount = await getBankAccount(snapshot.paymentMethodId);
                if (bankAccount) {
                  const currentBalance = Number(bankAccount.balance) || 0;
                  const newBalance = currentBalance + amount;
                  await updateBankAccountBalance(snapshot.paymentMethodId, newBalance);
                  console.log(`✅ Refunded ${amount} to bank account ${bankAccount.name}`);
                }
              } catch (error) {
                console.error('Error refunding to bank account:', error);
              }
            } else if (paymentType === 'credit_card' && snapshot.paymentMethodId) {
              // Refund to credit card or gift card
              try {
                const paymentCard = await dbOperation('creditCards', 'get', snapshot.paymentMethodId);
                if (paymentCard) {
                  const currentBalance = Number(paymentCard.balance) || 0;
                  // If paid with gift card, add balance back
                  // If paid with credit card, reduce the balance (reverse the charge)
                  const newBalance = paymentCard.is_gift_card
                    ? currentBalance + amount
                    : currentBalance - amount;

                  await dbOperation('creditCards', 'put', {
                    ...paymentCard,
                    balance: Math.max(0, newBalance)
                  }, { skipActivityLog: true });
                  console.log(`✅ Refunded ${amount} to card ${paymentCard.name}`);
                }
              } catch (error) {
                console.error('Error refunding to payment card:', error);
              }
            }
          }

          if (snapshot.transactionId) {
            await markTransactionUndone(snapshot.transactionId);
          }
        } else {
          await dbOperation(getStoreNameFromEntityType(entity_type), 'delete', entity_id, { skipActivityLog: true });
        }
        break;

      case 'edit':
        // Undo edit = restore previous snapshot
        if (snapshot) {
          if (entity_type === 'bank_account' && snapshot.previous) {
            // Undo bank account edit = restore previous state
            try {
              const { upsertBankAccount } = await import('./db');
              await upsertBankAccount(snapshot.previous);
            } catch (error) {
              console.error('Error undoing bank account edit:', error);
            }
          } else {
            // Determine correct snapshot to restore (some edits use {previous, updated})
            const previousState = snapshot.previous || snapshot;
            const restored = { ...previousState };

            if (!restored.id && entity_id) {
              restored.id = entity_id;
            }
            if (!restored.name && activity.entity_name) {
              restored.name = activity.entity_name;
            }

            await dbOperation(getStoreNameFromEntityType(entity_type), 'put', restored, { skipActivityLog: true });
          }
        }
        break;

      case 'delete':
        // Undo delete = reinsert deleted snapshot
        if (snapshot) {
          let snapshotData = snapshot;
          if (entity_type === 'income') {
            // Remove non-database fields from income snapshot
            const { 
              previousCash, 
              linkedTransactions, 
              depositTarget, 
              depositAccountId,
              depositAccountName, 
              depositDestination,
              previousBalance, 
              newBalance, 
              incomeId,
              transactionId,
              ...restoredIncome 
            } = snapshot;
            snapshotData = restoredIncome;
          }

          if (entity_type === 'bank_account') {
            // Undo bank account delete = restore the account
            try {
              const { upsertBankAccount } = await import('./db');
              await upsertBankAccount(snapshotData);
            } catch (error) {
              console.error('Error undoing bank account delete:', error);
            }
          } else {
            // Ensure the restored snapshot has an id for Supabase
            const restored = { ...snapshotData };
            if (!restored.id && entity_id) {
              restored.id = entity_id;
            }
            await dbOperation(getStoreNameFromEntityType(entity_type), 'put', restored, { skipActivityLog: true });
          }

          if (entity_type === 'transaction') {
            await applyTransactionEffects(snapshot);
          }

          if (entity_type === 'income') {
            if (snapshot.depositTarget === 'bank' && snapshot.depositAccountId) {
              try {
                const { getBankAccount } = await import('./db');
                const bankAccount = await getBankAccount(snapshot.depositAccountId);
                if (bankAccount) {
                  const currentBalance = Number(bankAccount.balance) || 0;
                  const amount = Number(snapshot.amount) || 0;
                  const restoredBalance = currentBalance + amount;
                  await updateBankAccountBalance(snapshot.depositAccountId, restoredBalance);
                }
              } catch (error) {
                console.error('Error restoring bank account for income delete undo:', error);
              }
            } else if (snapshot.depositTarget === 'cash_in_hand') {
              try {
                const { getCashInHand, updateCashInHand } = await import('./db');
                const currentCashInHand = await getCashInHand();
                const amount = Number(snapshot.amount) || 0;
                const restoredCashInHand = currentCashInHand + amount;
                await updateCashInHand(restoredCashInHand);
              } catch (error) {
                console.error('Error restoring cash in hand for income delete undo:', error);
              }
            }
            
            if (snapshot.linkedTransactions?.length) {
              for (const trx of snapshot.linkedTransactions) {
                try {
                  await dbOperation('transactions', 'put', {
                    ...trx,
                    status: 'active',
                    undone_at: null
                  }, { skipActivityLog: true });
                } catch (transactionError) {
                  console.warn('Failed to restore linked income transaction:', transactionError);
                }
              }
            }
            if (snapshot.previousCash !== undefined) {
              await dbOperation('settings', 'put', {
                key: 'availableCash',
                value: snapshot.previousCash,
              });
            }
          }
          
          // For gift cards: When undoing deletion, reactivate the purchase transaction
          // (The refund already happened during deletion, so we don't refund again)
          if (entity_type === 'card' && snapshot.is_gift_card) {
            try {
              // Find the purchase transaction and reactivate it
              const allTransactions = await dbOperation('transactions', 'getAll');
              const purchaseTransaction = allTransactions.find(t => 
                t.description === `Gift Card Purchase: ${snapshot.name}` &&
                t.type === 'expense' &&
                t.status === 'undone'
              );
              
              if (purchaseTransaction) {
                console.log('🔄 Reactivating gift card purchase transaction:', purchaseTransaction.id);
                
                // Reactivate the transaction
                await dbOperation('transactions', 'put', {
                  ...purchaseTransaction,
                  status: 'active',
                  undone_at: null
                }, { skipActivityLog: true });
                
                // Reverse the refund that happened during deletion
                const amount = Number(purchaseTransaction.amount) || 0;
                const paymentMethod = purchaseTransaction.payment_method;
                const paymentMethodId = purchaseTransaction.payment_method_id;
                
                if (paymentMethod === 'cash_in_hand') {
                  const { getCashInHand, updateCashInHand } = await import('./db');
                  const currentCash = await getCashInHand();
                  await updateCashInHand(currentCash - amount);
                  console.log('✅ Deducted', amount, 'from cash in hand');
                  
                } else if (paymentMethod === 'bank_account' && paymentMethodId) {
                  const { getBankAccount } = await import('./db');
                  const bankAccount = await getBankAccount(paymentMethodId);
                  if (bankAccount) {
                    const currentBalance = Number(bankAccount.balance) || 0;
                    await updateBankAccountBalance(paymentMethodId, currentBalance - amount);
                    console.log('✅ Deducted', amount, 'from bank account', bankAccount.name);
                  }
                  
                } else if (paymentMethod === 'credit_card' && paymentMethodId) {
                  const paymentCard = await dbOperation('creditCards', 'get', paymentMethodId);
                  if (paymentCard) {
                    const currentBalance = Number(paymentCard.balance) || 0;
                    // Gift card: subtract balance. Credit card: add balance (charge it again)
                    const newBalance = paymentCard.is_gift_card
                      ? Math.max(0, currentBalance - amount)
                      : currentBalance + amount;
                      
                    await dbOperation('creditCards', 'put', {
                      ...paymentCard,
                      balance: newBalance
                    }, { skipActivityLog: true });
                    console.log('✅ Charged', amount, 'to card', paymentCard.name);
                  }
                }
                
                console.log('✅ Gift card purchase transaction reactivated and payment re-applied');
              }
            } catch (error) {
              console.error('⚠️ Error reactivating gift card purchase transaction:', error);
              // Don't fail the undo if transaction reactivation fails
            }
          }
        }
        break;

      case 'expense':
        if (snapshot) {
          if (entity_type === 'card' && snapshot.cardId) {
            try {
              const card = await dbOperation('creditCards', 'get', snapshot.cardId);
              if (card) {
                const previousBalance = snapshot.previousBalance;
                const amount = Number(snapshot.amount) || 0;
                const currentBalance = Number(card.balance) || 0;
                const newBalance = previousBalance !== undefined
                  ? Number(previousBalance)
                  : Math.max(0, currentBalance - amount);
                await dbOperation('creditCards', 'put', { ...card, balance: newBalance }, { skipActivityLog: true });
              }
            } catch (cardError) {
              console.warn('Unable to restore card balance while undoing expense:', cardError);
            }
          }

          if (snapshot.previousCash !== undefined) {
            await dbOperation('settings', 'put', {
              key: 'availableCash',
              value: snapshot.previousCash,
            });
          }

          if (snapshot.transactionId) {
            await markTransactionUndone(snapshot.transactionId);
          }
        }
        break;

      case 'income_occurrence':
        // Undo income occurrence - uses new schedule system
        try {
          const { undoIncomeOccurrence } = await import('./schedules');
          await undoIncomeOccurrence(entity_id);
          console.log('✅ Income occurrence undone successfully');
        } catch (error) {
          console.error('Error undoing income occurrence:', error);
          throw error;
        }
        break;

      case 'create_income_schedule':
        // Undo schedule creation = delete schedule and all occurrences
        try {
          const { deleteIncomeSchedule } = await import('./schedules');
          await deleteIncomeSchedule(entity_id);
          console.log('✅ Income schedule deleted');
        } catch (error) {
          console.error('Error undoing income schedule creation:', error);
          throw error;
        }
        break;

      case 'loan_payment':
        // Undo loan payment
        try {
          const { undoLoanPayment } = await import('./schedules');
          await undoLoanPayment(entity_id);
          console.log('✅ Loan payment undone successfully');
        } catch (error) {
          console.error('Error undoing loan payment:', error);
          throw error;
        }
        break;

      case 'credit_card_payment':
        // Undo credit card payment
        try {
          const { undoCreditCardPayment } = await import('./schedules');
          await undoCreditCardPayment(entity_id);
          console.log('✅ Credit card payment undone successfully');
        } catch (error) {
          console.error('Error undoing credit card payment:', error);
          throw error;
        }
        break;

      case 'income':
        // Check if this is an auto-deposited income occurrence from a schedule
        if (snapshot?.isAutoDeposit && snapshot?.scheduleId) {
          // This is a schedule occurrence - undo it properly
          console.log('🔄 Undoing income occurrence from schedule');
          try {
            const { undoIncomeOccurrence } = await import('./schedules');
            await undoIncomeOccurrence(entity_id);
            console.log('✅ Income occurrence undone successfully');
          } catch (error) {
            console.error('❌ Error undoing income occurrence:', error);
            throw error;
          }
        } else {
          // This is manual income - delete it
          console.log('🔄 Undoing manual income (deleting)');
          await dbOperation('income', 'delete', entity_id, { skipActivityLog: true });
          
          if (snapshot) {
            // Handle undo based on where income was deposited
            if (snapshot.depositTarget === 'cash_in_hand') {
              try {
                const { getCashInHand, updateCashInHand } = await import('./db');
                const currentCashInHand = await getCashInHand();
                const amount = Number(snapshot.amount) || 0;
                const restoredCashInHand = Math.max(0, currentCashInHand - amount);
                await updateCashInHand(restoredCashInHand);
                console.log('✅ Cash in hand restored after undoing income');
              } catch (error) {
                console.error('Error restoring cash in hand for income undo:', error);
              }
            } else if (snapshot.depositTarget === 'bank' && snapshot.depositAccountId) {
              try {
                const { getBankAccount } = await import('./db');
                const bankAccount = await getBankAccount(snapshot.depositAccountId);
                if (bankAccount) {
                  const currentBalance = Number(bankAccount.balance) || 0;
                  const amount = Number(snapshot.amount) || 0;
                  const restoredBalance = Math.max(0, currentBalance - amount);
                  await updateBankAccountBalance(snapshot.depositAccountId, restoredBalance);
                  console.log('✅ Bank account balance restored after undoing income');
                }
              } catch (error) {
                console.error('Error restoring bank account for income undo:', error);
              }
            } else if (snapshot.previousCash !== undefined) {
              await dbOperation('settings', 'put', {
                key: 'availableCash',
                value: snapshot.previousCash,
              });
            }

            if (snapshot.transactionId) {
              await markTransactionUndone(snapshot.transactionId);
            }
          }
        }
        break;

      case 'payment':
        // Undo payment = restore loan, reserved fund, and cash
        if (snapshot) {
          console.log('🔄 Undoing payment for', entity_type, entity_id);
          console.log('📊 Snapshot data:', {
            hasEntity: !!snapshot.entity,
            affectedFunds: snapshot.affectedFunds?.length || 0,
            bankAdjustments: snapshot.bankAdjustments?.length || 0
          });

          // Restore the loan or card entity
          if (snapshot.entity) {
            console.log('💾 Restoring', entity_type, 'entity');
            await dbOperation(getStoreNameFromEntityType(entity_type), 'put', snapshot.entity, { skipActivityLog: true });
            console.log('✅', entity_type, 'entity restored');
          }

          // Restore the user's available cash
          if (snapshot.previousCash !== undefined) {
            await dbOperation('settings', 'put', {
              key: 'availableCash',
              value: snapshot.previousCash,
            });
          }
          
          // Restore credit card balance if payment was made with a card
          if (snapshot.cardEffect && snapshot.cardEffect.cardId && snapshot.cardEffect.delta) {
            try {
              console.log('💳 Undoing credit card effect:', snapshot.cardEffect);
              const card = await dbOperation('creditCards', 'get', snapshot.cardEffect.cardId);
              if (card) {
                const currentBalance = Number(card.balance) || 0;
                // Reverse the card charge: if we added to card balance, subtract it back
                const restoredBalance = currentBalance - snapshot.cardEffect.delta;
                await dbOperation('creditCards', 'put', {
                  ...card,
                  balance: Math.max(0, restoredBalance)
                }, { skipActivityLog: true });
                console.log('✅ Credit card balance restored:', card.name, 'to', restoredBalance);
              }
            } catch (cardError) {
              console.error('❌ Error restoring credit card during loan payment undo:', cardError);
            }
          }

          const resolveFundId = (fund) => {
            if (!fund) return null;
            if (fund.id !== undefined && fund.id !== null) return String(fund.id);
            if (fund.fund_id !== undefined && fund.fund_id !== null) return String(fund.fund_id);
            if (fund.uuid !== undefined && fund.uuid !== null) return String(fund.uuid);
            return null;
          };

          const fundAdjustments = new Map();

          const queueFundRestoration = (fundEntry, amountUsed) => {
            if (!fundEntry) {
              console.log('⚠️ queueFundRestoration: fundEntry is null/undefined');
              return;
            }
            const fundSnapshot = fundEntry.fund || fundEntry;
            const fundId = resolveFundId(fundSnapshot);
            if (!fundId) {
              console.log('⚠️ queueFundRestoration: Could not resolve fund ID from snapshot');
              return;
            }

            console.log('📝 Queueing fund restoration:', fundSnapshot.name, 'ID:', fundId, 'Amount:', fundSnapshot.amount);

            const numericAmount = Number(amountUsed) || 0;
            const existing = fundAdjustments.get(fundId) || { fund: fundSnapshot, amount: 0 };

            // Prefer the most complete snapshot if multiple provided
            if (!existing.fund && fundSnapshot) {
              existing.fund = fundSnapshot;
            }
            existing.amount += numericAmount;
            fundAdjustments.set(fundId, existing);
          };

          if (Array.isArray(snapshot.affectedFunds) && snapshot.affectedFunds.length > 0) {
            for (const entry of snapshot.affectedFunds) {
              if (!entry) continue;
              const amountUsed = entry.amountUsed ?? snapshot.paymentAmount ?? entry.amount ?? 0;
              queueFundRestoration(entry, amountUsed);
            }
          } else if (snapshot.affectedFund) {
            const amountUsed =
              snapshot.affectedFundAmountUsed ??
              snapshot.paymentAmount ??
              snapshot.amount ??
              0;
            queueFundRestoration(snapshot.affectedFund, amountUsed);
          }

          if (fundAdjustments.size > 0) {
            console.log('🔄 Undoing payment - restoring', fundAdjustments.size, 'fund(s)');
            for (const { fund, amount } of fundAdjustments.values()) {
              try {
                console.log('💾 Restoring reserved fund:', fund.name, 'with amount:', fund.amount);

                // Remove display-only fields that don't exist in database schema
                const { source_account_name, ...fundToRestore } = fund;

                await dbOperation('reservedFunds', 'put', fundToRestore, { skipActivityLog: true });
                console.log('✅ Reserved fund restored successfully');
              } catch (fundError) {
                console.error('❌ Error restoring reserved fund during undo:', fundError);
              }

              const amountToRestore = Number(amount) || 0;
              if (fund?.source_account_id && amountToRestore > 0) {
                try {
                  const { getBankAccount } = await import('./db');
                  const bankAccount = await getBankAccount(fund.source_account_id);
                  if (bankAccount) {
                    const currentBalance = Number(bankAccount.balance) || 0;
                    const restoredBalance = Math.round((currentBalance + amountToRestore) * 100) / 100;
                    console.log('💰 Restoring bank account balance:', bankAccount.name, 'from', currentBalance, 'to', restoredBalance);
                    await updateBankAccountBalance(bankAccount.id, restoredBalance);
                    console.log('✅ Bank account balance restored');
                  }
                } catch (bankError) {
                  console.error('❌ Error restoring bank account for reserved fund undo:', bankError);
                }
              }
            }
          }

          const bankAdjustmentsList = Array.isArray(snapshot.bankAdjustments) ? snapshot.bankAdjustments : [];
          if (bankAdjustmentsList.length > 0) {
            const { getBankAccount } = await import('./db');
            for (const adjustment of bankAdjustmentsList) {
              if (!adjustment) continue;
              const { accountId, previousBalance } = adjustment;
              if (!accountId || previousBalance === undefined || previousBalance === null) continue;
              try {
                const account = await getBankAccount(accountId);
                if (!account) continue;
                const balanceValue = Number(previousBalance);
                const targetBalance = Number.isFinite(balanceValue) ? balanceValue : Number(account.balance) || 0;
                await updateBankAccountBalance(accountId, targetBalance);
              } catch (bankError) {
                console.error('Error restoring bank account during undo:', bankError);
              }
            }
          }

          // Mark related transaction as undone for visibility in history
          if (snapshot.transactionId) {
            await markTransactionUndone(snapshot.transactionId);
          }
          if (Array.isArray(snapshot.fundTransactionIds) && snapshot.fundTransactionIds.length > 0) {
            for (const fundTransactionId of snapshot.fundTransactionIds) {
              if (!fundTransactionId) continue;
              await markTransactionUndone(fundTransactionId);
            }
          }
    }
        break;

      case 'transfer':
        // Undo bank account transfer - reverse the transfer amounts
        if (snapshot && snapshot.fromAccount && snapshot.toAccount && snapshot.amount) {
          try {
            const { getBankAccount } = await import('./db');

            const amount = Number(snapshot.amount) || 0;
            if (!(amount > 0)) break;

            const [fromAccount, toAccount] = await Promise.all([
              getBankAccount(snapshot.fromAccount),
              getBankAccount(snapshot.toAccount)
            ]);

            if (fromAccount) {
              const fromBalance = Number(fromAccount.balance) || 0;
              const targetBalance =
                snapshot.fromPreviousBalance !== undefined && snapshot.fromPreviousBalance !== null
                  ? Number(snapshot.fromPreviousBalance) || 0
                  : Math.round((fromBalance + amount) * 100) / 100;
              await updateBankAccountBalance(snapshot.fromAccount, Math.max(0, Math.round(targetBalance * 100) / 100));
            }

            if (toAccount) {
              const toBalance = Number(toAccount.balance) || 0;
              const targetBalance =
                snapshot.toPreviousBalance !== undefined && snapshot.toPreviousBalance !== null
                  ? Number(snapshot.toPreviousBalance) || 0
                  : Math.round((toBalance - amount) * 100) / 100;
              await updateBankAccountBalance(snapshot.toAccount, Math.max(0, Math.round(targetBalance * 100) / 100));
            }

            // Mark the transfer transaction as undone
            if (snapshot.transactionId) {
              await markTransactionUndone(snapshot.transactionId);
            }
          } catch (error) {
            console.error('Error undoing bank account transfer:', error);
          }
        }
        break;

      case 'recalculate_cash':
        // Undo recalculate cash operation - restore previous value
        if (snapshot && snapshot.previousValue !== undefined) {
          try {
            console.log('🔄 Undoing recalculate cash - restoring previous value:', snapshot.previousValue);
            await dbOperation('settings', 'put', {
              key: 'availableCash',
              value: snapshot.previousValue
            });
            console.log('✅ Available cash restored to:', snapshot.previousValue);
          } catch (error) {
            console.error('Error undoing recalculate cash:', error);
          }
        }
        break;
      
      case 'cash_withdrawal':
        // Undo cash withdrawal - reverse: add back to bank, deduct from cash in hand
        if (snapshot && snapshot.accountId && snapshot.amount) {
          try {
            const { updateCashInHand } = await import('./db');
            
            // Restore bank account balance
            if (snapshot.previousBankBalance !== undefined) {
              await updateBankAccountBalance(snapshot.accountId, snapshot.previousBankBalance);
            }
            
            // Restore cash in hand balance
            if (snapshot.previousCashInHand !== undefined) {
              await updateCashInHand(snapshot.previousCashInHand);
            }
            
            // Mark transaction as undone
            if (snapshot.transactionId) {
              await markTransactionUndone(snapshot.transactionId);
            }
            
            console.log('✅ Cash withdrawal undone successfully');
          } catch (error) {
            console.error('Error undoing cash withdrawal:', error);
          }
        }
        break;
        
      case 'cash_deposit':
        // Undo cash deposit - reverse: deduct from bank, add back to cash in hand
        if (snapshot && snapshot.accountId && snapshot.amount) {
          try {
            const { updateCashInHand } = await import('./db');
            
            // Restore bank account balance
            if (snapshot.previousBankBalance !== undefined) {
              await updateBankAccountBalance(snapshot.accountId, snapshot.previousBankBalance);
            }
            
            // Restore cash in hand balance
            if (snapshot.previousCashInHand !== undefined) {
              await updateCashInHand(snapshot.previousCashInHand);
            }
            
            // Mark transaction as undone
            if (snapshot.transactionId) {
              await markTransactionUndone(snapshot.transactionId);
            }
            
            console.log('✅ Cash deposit undone successfully');
          } catch (error) {
            console.error('Error undoing cash deposit:', error);
          }
        }
        break;
      
      case 'gift_card_reload':
        // Undo gift card reload - reverse: restore card balance, refund payment source
        if (snapshot && snapshot.card) {
          try {
            const card = await dbOperation('creditCards', 'get', snapshot.card.id);
            if (card) {
              // Restore previous gift card balance (undo the amountAdded)
              const previousBalance = Number(snapshot.previousBalance) || 0;
              await dbOperation('creditCards', 'put', {
                ...card,
                balance: previousBalance
              }, { skipActivityLog: true });
              console.log('✅ Gift card balance restored to', previousBalance);
              
              // Refund payment source (refund the amountPaid)
              // Use amountPaid if available (bonus scenarios), otherwise fall back to amount
              const amountToRefund = Number(snapshot.amountPaid || snapshot.amount) || 0;
              const sourceType = snapshot.source;
              const sourceId = snapshot.sourceId;
              
              if (amountToRefund > 0) {
                if (sourceType === 'credit_card' && sourceId) {
                  const paymentCard = await dbOperation('creditCards', 'get', sourceId);
                  if (paymentCard) {
                    const currentBalance = parseFloat(paymentCard.balance) || 0;
                    await dbOperation('creditCards', 'put', {
                      ...paymentCard,
                      balance: currentBalance - amountToRefund
                    }, { skipActivityLog: true });
                    console.log('✅ Refunded', amountToRefund, 'to payment card', paymentCard.name);
                  }
                } else if (sourceType === 'bank_account' && sourceId) {
                  const { getBankAccount } = await import('./db');
                  const bankAccount = await getBankAccount(sourceId);
                  if (bankAccount) {
                    const currentBalance = parseFloat(bankAccount.balance) || 0;
                    await updateBankAccountBalance(sourceId, currentBalance + amountToRefund);
                    console.log('✅ Refunded', amountToRefund, 'to bank account', bankAccount.name);
                  }
                } else if (sourceType === 'cash_in_hand') {
                  const { getCashInHand, updateCashInHand } = await import('./db');
                  const currentCash = await getCashInHand();
                  await updateCashInHand(currentCash + amountToRefund);
                  console.log('✅ Refunded', amountToRefund, 'to cash in hand');
                }
              }
              
              // Mark transaction as undone
              if (snapshot.transactionId) {
                await markTransactionUndone(snapshot.transactionId);
              }
            }
          } catch (error) {
            console.error('Error undoing gift card reload:', error);
          }
        }
        break;
        
      case 'gift_card_usage':
        // Undo gift card usage - restore balance to card
        if (snapshot && snapshot.card) {
          try {
            const card = await dbOperation('creditCards', 'get', snapshot.card.id);
            if (card) {
              // Restore previous gift card balance
              const previousBalance = Number(snapshot.previousBalance) || 0;
              await dbOperation('creditCards', 'put', {
                ...card,
                balance: previousBalance
              }, { skipActivityLog: true });
              console.log('✅ Gift card balance restored after undoing usage');
              
              // Mark transaction as undone
              if (snapshot.transactionId) {
                await markTransactionUndone(snapshot.transactionId);
              }
            }
          } catch (error) {
            console.error('Error undoing gift card usage:', error);
          }
        }
        break;

      case 'edit_setting':
      case 'set_budget':
      case 'delete_budget':
        // Undo settings changes
        if (snapshot && snapshot.settingKey) {
          try {
            const { setSetting, setCategoryBudget, deleteCategoryBudget } = await import('./settingsManager');
            
            if (action_type === 'edit_setting') {
              // Restore previous setting value
              if (snapshot.previousValue !== undefined) {
                await setSetting(snapshot.settingKey, snapshot.previousValue);
                console.log(`✅ Setting '${snapshot.settingKey}' restored to:`, snapshot.previousValue);
              }
            } else if (action_type === 'set_budget') {
              // Undo budget set - either restore previous budget or delete it
              const categoryId = snapshot.categoryId;
              const previousBudget = snapshot.previousBudget || 0;
              
              if (previousBudget > 0) {
                await setCategoryBudget(categoryId, previousBudget);
                console.log(`✅ Category budget restored to: ${previousBudget}`);
              } else {
                await deleteCategoryBudget(categoryId);
                console.log('✅ Category budget removed');
              }
            } else if (action_type === 'delete_budget') {
              // Undo budget delete - restore the budget
              if (snapshot.categoryId && snapshot.previousBudget) {
                await setCategoryBudget(snapshot.categoryId, snapshot.previousBudget);
                console.log(`✅ Category budget restored: ${snapshot.previousBudget}`);
              }
            }
          } catch (error) {
            console.error('Error undoing setting change:', error);
          }
        }
        break;

      default:
        console.warn('Unknown action type for undo:', action_type);
        return false;
    }

    // Remove the activity entry after undo
    await supabase.from('activities').delete().eq('id', activity.id);

    // Refresh UI
    if (onUpdate) await onUpdate();

    return true;
  } catch (error) {
    console.error('Error undoing activity:', error);
    throw error;
  }
};

/**
 * Maps entity_type (as stored in activity logs) back to dbOperation store names.
 */
const getStoreNameFromEntityType = (entityType) => {
  const map = {
    card: 'creditCards',
    loan: 'loans',
    fund: 'reservedFunds',
    income: 'income',
    transaction: 'transactions',
    bank_account: 'bankAccounts',
  };
  return map[entityType] || entityType;
};

const isPaymentType = (type) =>
  type === 'payment' || type === 'loan_payment' || type === 'credit_card_payment';

const resolvePaymentSubtype = (transaction) => {
  if (transaction.subtype) return transaction.subtype;
  if (transaction.type === 'credit_card_payment') return 'credit_card';
  if (transaction.type === 'loan_payment') return 'loan';
  if (transaction.payment_method === 'credit_card') return 'credit_card';
  if (transaction.payment_method === 'loan') return 'loan';
  return null;
};

const applyTransactionEffects = async (transaction) => {
  if (!transaction || transaction.status === 'undone') return;
  const amount = Number(transaction.amount) || 0;
  if (amount <= 0) return;

  const normalizeBalance = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const updateCardBalance = async (cardId, delta) => {
    if (!cardId) return;
    let card = null;
    try {
      card = await dbOperation('creditCards', 'get', cardId);
    } catch (cardError) {
      console.warn('Unable to load card while restoring transaction:', cardError);
    }
    if (!card) return;
    const currentBalance = normalizeBalance(card.balance);
    const newBalance = Math.max(0, currentBalance + delta);
    await dbOperation('creditCards', 'put', { ...card, balance: newBalance }, { skipActivityLog: true });
  };

  const updateLoanBalance = async (loanId, delta) => {
    if (!loanId) return;
    let loan = null;
    try {
      loan = await dbOperation('loans', 'get', loanId);
    } catch (loanError) {
      console.warn('Unable to load loan while restoring transaction:', loanError);
    }
    if (!loan) return;
    const currentBalance = normalizeBalance(loan.balance);
    const newBalance = currentBalance + delta;
    await dbOperation('loans', 'put', { ...loan, balance: newBalance }, { skipActivityLog: true });
  };

  let cashDelta = 0;

  if (transaction.type === 'income') {
    cashDelta += amount;
  } else if (transaction.type === 'expense') {
    if (transaction.payment_method === 'cash') {
      cashDelta -= amount;
    } else if (transaction.payment_method === 'credit_card') {
      const cardId = transaction.card_id || transaction.payment_method_id;
      await updateCardBalance(cardId, amount);
    }
  } else if (isPaymentType(transaction.type)) {
    const paymentSubtype = resolvePaymentSubtype(transaction);
    if (paymentSubtype === 'credit_card') {
      const cardId = transaction.card_id || transaction.payment_method_id;
      await updateCardBalance(cardId, -amount);
      cashDelta -= amount;
    } else if (paymentSubtype === 'loan') {
      const loanId = transaction.loan_id || transaction.payment_method_id;
      await updateLoanBalance(loanId, -amount);
      cashDelta -= amount;
    } else if (transaction.payment_method === 'cash') {
      cashDelta -= amount;
    }
  } else {
    if (transaction.payment_method === 'cash') {
      cashDelta -= amount;
    } else if (transaction.payment_method === 'credit_card') {
      const cardId = transaction.card_id || transaction.payment_method_id;
      await updateCardBalance(cardId, amount);
    } else if (transaction.payment_method === 'loan') {
      const loanId = transaction.loan_id || transaction.payment_method_id;
      await updateLoanBalance(loanId, -amount);
      cashDelta -= amount;
    }
  }

  if (cashDelta !== 0) {
    let currentCash = 0;
    try {
      const currentCashSetting = await dbOperation('settings', 'get', 'availableCash');
      if (currentCashSetting && currentCashSetting.value !== undefined) {
        currentCash = Number(currentCashSetting.value) || 0;
      }
    } catch (cashError) {
      console.warn('Unable to load cash balance while restoring transaction:', cashError);
    }
    const newCash = currentCash + cashDelta;
    await dbOperation('settings', 'put', { key: 'availableCash', value: newCash });
  }
};