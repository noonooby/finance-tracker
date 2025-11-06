# 🚀 SCHEDULE MIGRATION COMPLETE - TESTING GUIDE

## ✅ WHAT'S BEEN COMPLETED

### Phase 1: Database ✅
- Created `income_schedules` table
- Created `loan_payments` table
- Created `credit_card_payments` table
- Added `schedule_id` and `is_manual` columns to `income`
- Set up Row Level Security policies

### Phase 2: Backend Architecture ✅
- **NEW:** `/src/utils/schedules/` - Complete schedule management system
- **NEW:** `migrateToSchedules.js` - Auto-migration script
- **NEW:** `incomeSchedules.js` - Income schedule CRUD + processing
- **NEW:** `loanPayments.js` - Loan payment history + processing
- **NEW:** `creditCardPayments.js` - Credit card payment history + processing

### Phase 3: Integration ✅
- **UPDATED:** `FinanceDataContext.js` - Auto-runs migration on app load
- **UPDATED:** `autoPay.js` - Re-exports new schedule functions
- **UPDATED:** `activityLogger.js` - Added undo for new activity types
- **UPDATED:** `useIncomeOperations.js` - Creates schedules for recurring income
- **UPDATED:** `Income.js` - Shows schedules separately from manual income

## 🧪 TESTING CHECKLIST

### Test 1: Auto-Migration (5 min)
**Goal:** Verify existing recurring income migrates to schedules

**Steps:**
1. Open browser console (Cmd+Option+J)
2. Refresh app (Cmd+Shift+R for hard refresh)
3. Watch console logs

**Expected output:**
```
📊 Phase 4: Checking schedule migration...
🔄 Found X recurring income to migrate...
✅ Migration complete: { migrated: X, errors: 0 }
📊 Phase 5: Processing due income schedules...
```

**Verify:**
- ✅ No errors in console
- ✅ Migration count matches your recurring income count
- ✅ See "Income schedule created" logs

---

### Test 2: Income Schedule Creation (5 min)
**Goal:** Create new recurring income schedule

**Steps:**
1. Go to Income page
2. Click "Add Income"
3. Enter:
   - Source: "Test Salary"
   - Amount: 100
   - Date: Today
   - Frequency: Weekly
   - Deposit to: Bank Account → (select your account)
   - ✅ Enable Auto-Deposit
4. Click "Create Schedule"

**Verify:**
- ✅ Success toast appears
- ✅ Schedule appears in "Recurring Income Schedules" section
- ✅ Shows: "Next: [today's date] • Due today!"
- ✅ Shows correct deposit account

---

### Test 3: Auto-Deposit Processing (5 min)
**Goal:** Verify income auto-deposits to correct bank account

**Steps:**
1. With "Test Salary" schedule created (due today)
2. Click "Check Due Income" button
3. Watch console logs

**Expected:**
```
💰 Deposited $100.00 to bank account: [Your Account]
✅ Processed: Test Salary - $100.00 → [Your Account]
```

**Verify:**
- ✅ Bank account balance increases by $100
- ✅ Activity feed shows: "Income: $100.00 from Test Salary → [Account] ($X → $Y)"
- ✅ Transaction created with correct payment_method (bank_account)
- ✅ Schedule's next_date moves forward by 1 week

---

### Test 4: Undo Income Occurrence (5 min)
**Goal:** Verify undo only affects one occurrence, not the schedule

**Steps:**
1. Go to Activity Feed
2. Find the "Income: $100.00 from Test Salary" entry
3. Click "Undo"
4. Return to Income page

**Verify:**
- ✅ Bank account balance decreased by $100 (reversed)
- ✅ Schedule still exists in "Recurring Income Schedules"
- ✅ Schedule's next_date is today again (rolled back)
- ✅ Transaction marked as undone
- ✅ Console shows: "✅ Income occurrence undone successfully"

---

### Test 5: Pause/Resume Schedule (2 min)
**Goal:** Verify schedule can be paused and resumed

**Steps:**
1. In "Recurring Income Schedules" section
2. Click pause icon (⏸) on Test Salary
3. Verify "Paused" badge appears
4. Click play icon (▶) to resume
5. Verify "Paused" badge disappears

**Verify:**
- ✅ Schedule shows "Paused" badge when inactive
- ✅ Auto-deposit skips paused schedules
- ✅ Can resume schedule

---

### Test 6: Delete Schedule (2 min)
**Goal:** Delete schedule and all occurrences

**Steps:**
1. Click trash icon (🗑) on Test Salary schedule
2. Confirm deletion

**Verify:**
- ✅ Schedule removed from list
- ✅ Activity log shows deletion
- ✅ All occurrences from that schedule are gone

---

### Test 7: Manual Income (3 min)
**Goal:** One-time income still works

**Steps:**
1. Click "Add Income"
2. Enter:
   - Source: "Bonus"
   - Amount: 500
   - Date: Today
   - Frequency: One-time
   - Deposit to: Bank Account
3. Click "Log Income"

**Verify:**
- ✅ Appears in "Manual Income" section
- ✅ Bank balance increases immediately
- ✅ No schedule created
- ✅ Can delete normally

---

### Test 8: Loan Auto-Payment (3 min - if you have loans)
**Goal:** Loan payments create history records

**Steps:**
1. Create a test loan with next_payment_date = today
2. Set connected_payment_source to a bank account
3. Click "Check Due Payments" from Dashboard

**Verify:**
- ✅ Loan payment record created in loan_payments table
- ✅ Loan balance decreases
- ✅ Bank account balance decreases
- ✅ Activity shows payment with source
- ✅ Can undo payment

---

### Test 9: Credit Card Auto-Payment (3 min - if you have cards)
**Goal:** Credit card payments create history records

**Steps:**
1. Create a test credit card with due_date = today
2. Add some balance to it
3. Set connected_payment_source to a bank account
4. Click "Check Due Payments"

**Verify:**
- ✅ Card payment record created
- ✅ Card balance = 0
- ✅ Bank account decreases
- ✅ Due date moves to next month
- ✅ Activity shows payment
- ✅ Can undo payment

---

## 🐛 COMMON ISSUES & FIXES

### Issue 1: Migration doesn't run
**Symptom:** Console shows "✅ No migration needed" but you have recurring income
**Fix:** Check if income already has `schedule_id` set. Run this in Supabase SQL editor:
```sql
SELECT id, source, frequency, schedule_id FROM income WHERE frequency != 'onetime';
```

### Issue 2: Import errors
**Symptom:** "Cannot find module './schedules'"
**Fix:** Restart dev server (Ctrl+C, then `npm start`)

### Issue 3: Undo doesn't work
**Symptom:** Clicking undo shows error
**Fix:** Check console for error details. May need to refresh data after undo.

### Issue 4: Bank balance doesn't update
**Symptom:** Schedule processes but balance unchanged
**Fix:** Check if deposit_account_id is valid. View console logs.

---

## 📊 DATABASE VERIFICATION QUERIES

Run these in Supabase SQL Editor to verify data:

### Check income schedules:
```sql
SELECT 
  id, source, amount, frequency, next_date, 
  is_active, deposit_target, auto_deposit
FROM income_schedules
ORDER BY next_date;
```

### Check income occurrences:
```sql
SELECT 
  id, source, amount, date, schedule_id, is_manual
FROM income
ORDER BY date DESC
LIMIT 20;
```

### Check loan payments:
```sql
SELECT 
  id, loan_id, amount, payment_date, 
  payment_source, status
FROM loan_payments
ORDER BY payment_date DESC
LIMIT 10;
```

### Check credit card payments:
```sql
SELECT 
  id, card_id, amount, payment_date,
  payment_source, status
FROM credit_card_payments
ORDER BY payment_date DESC
LIMIT 10;
```

---

## 🎉 SUCCESS CRITERIA

Migration is successful when:

✅ **All existing recurring income** migrated to schedules
✅ **Auto-deposit works** and deposits to correct bank accounts
✅ **Activity feed** shows proper descriptions with account names and balances
✅ **Undo works** without breaking schedules
✅ **Bank balances** update correctly
✅ **No console errors** during normal operations
✅ **Schedules visible** in Income page
✅ **Manual income** works independently
✅ **Pause/Resume** schedules works
✅ **Delete schedule** removes all related occurrences

---

## 🔄 ROLLBACK PLAN (if needed)

If something goes seriously wrong:

### Option A: Code Rollback
```bash
# Restore old Income.js
mv src/components/Income_OLD_BACKUP.js src/components/Income.js

# Revert FinanceDataContext changes
git checkout src/contexts/FinanceDataContext.js

# Revert activityLogger changes
git checkout src/utils/activityLogger.js
```

### Option B: Database Rollback
```sql
-- Remove new tables (WARNING: Deletes all schedule data!)
DROP TABLE IF EXISTS credit_card_payments CASCADE;
DROP TABLE IF EXISTS loan_payments CASCADE;
DROP TABLE IF EXISTS income_schedules CASCADE;

-- Remove new columns
ALTER TABLE income DROP COLUMN IF EXISTS schedule_id;
ALTER TABLE income DROP COLUMN IF EXISTS is_manual;
```

---

## 📞 SUPPORT

If you encounter issues:
1. Check console for detailed error messages
2. Check `MIGRATION_STATUS.md` for architecture details
3. Review this testing guide step-by-step
4. Backup your database before making fixes

---

## 🎯 NEXT STEPS AFTER TESTING

Once all tests pass:

1. **Remove old backup file:** `src/components/Income_OLD_BACKUP.js`
2. **Commit changes:** Git commit with descriptive message
3. **Deploy:** Push to production when ready
4. **Monitor:** Watch for any user-reported issues

---

## 💡 NEW FEATURES ENABLED

With this migration complete, you now have:

1. **Pause/Resume Income** - Temporarily stop schedules without deleting
2. **Full Payment History** - See every loan and card payment ever made
3. **Better Predictions** - Accurate income forecasting from schedules
4. **Clean Undo** - Undo one occurrence without breaking anything
5. **Schedule Management** - Edit future income without affecting history
6. **Payment Audit Trail** - Complete payment history for loans/cards

---

**Ready to test? Start with Test 1 (Auto-Migration) and work through the list!**
