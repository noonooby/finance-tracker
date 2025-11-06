# Income Auto-Deposit Bug Fix

## Problem
Salary and other recurring income was marked as "Auto-deposited" but was NOT actually being deposited to bank accounts. Instead, it was going to the old legacy `availableCash` system which doesn't track individual bank accounts.

## Root Cause
In `/src/utils/autoPay.js`, the `autoDepositDueIncome()` function was:
1. Adding income to the old `availableCash` field (legacy system)
2. NOT checking the income's `deposit_account_id` field
3. NOT depositing to bank accounts

## Solution
Updated `autoDepositDueIncome()` to properly handle bank account deposits:

### Key Changes:
1. **Check deposit target**: Now reads `inc.deposit_account_id` from income record
2. **Deposit to bank account**: If `deposit_account_id` exists, deposits directly to that account using `updateBankAccountBalance()`
3. **Fallback to cash in hand**: If no bank account specified, keeps as cash in hand
4. **Proper transaction records**: Creates transactions with correct `payment_method` (bank_account vs cash_in_hand)
5. **Better activity logging**: Shows which account received the deposit with balance changes

### Before:
```javascript
// Old code - deposited to availableCash (wrong!)
const previousCash = availableCash;
const newCash = previousCash + amount;
await onUpdateCash(newCash, { accountId: inc.deposit_account_id });
```

### After:
```javascript
// New code - deposits to actual bank account
if (inc.deposit_account_id) {
  const targetAccount = await getBankAccount(depositAccountId);
  const previousBalance = Number(targetAccount.balance) || 0;
  const newBalance = previousBalance + amount;
  await updateBankAccountBalance(depositAccountId, newBalance);
}
```

## Files Modified
1. `/src/utils/autoPay.js` - Fixed `autoDepositDueIncome()` function
2. `/src/contexts/FinanceDataContext.js` - Updated to reload bank accounts after auto-deposits

## Testing
1. ✅ Auto-deposit on app load now deposits to correct bank account
2. ✅ Manual "Check Due Income" button deposits to correct bank account
3. ✅ Activity log shows correct account and balance changes
4. ✅ Transaction records show correct payment method
5. ✅ Bank account balances update correctly
6. ✅ Cash in hand option still works for income without deposit_account_id

## How to Verify
1. Create or edit an income source
2. Set "Deposit to Bank Account" and select an account
3. Set frequency to recurring (e.g., weekly)
4. Wait for the income to become due OR click "Check Due Income"
5. Verify the bank account balance increases by the income amount
6. Check activity feed - should show: `Income: $X from Source → Account Name ($prev → $new)`

## Breaking Changes
None - backward compatible. Income without `deposit_account_id` defaults to cash in hand.
