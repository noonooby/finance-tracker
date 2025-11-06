# Recurring Schedule Architecture Migration Plan

## Overview
Migrate from "moving date" pattern to "schedule + occurrences" pattern for Income, Loans, and Credit Cards.

## Current Problems
1. ❌ Recurring income date moves forward, breaking undo
2. ❌ Loan payment dates mutate, losing history
3. ❌ Credit card payments don't track history
4. ❌ Can't view payment history easily
5. ❌ Undo breaks everything

## New Architecture

### Pattern: Schedule + Occurrences
```
SCHEDULE (template)          OCCURRENCES (history)
├─ What: Salary              ├─ Oct 30: $2,564.86 ✓
├─ When: Bi-weekly           ├─ Oct 16: $2,564.86 ✓
├─ Where: Tangerine          ├─ Oct 2: $2,564.86 ✓
└─ Next: Nov 13              └─ Sep 18: $2,564.86 ✓
```

## Database Changes

### New Tables
1. **`income_schedules`** - Recurring income templates
2. **`loan_payments`** - Loan payment history
3. **`credit_card_payments`** - Credit card payment history

### Modified Tables
1. **`income`** - Add `schedule_id`, `is_manual` columns
2. **`loans`** - Keep schedule info, use for next payment calculation
3. **`credit_cards`** - Keep due_date, use for reminders

## Implementation Phases

### Phase 1: Database Setup (30 min)
**File:** `/migrations/008_recurring_schedules.sql`

✅ Run the migration SQL (provided above)
- Create `income_schedules` table
- Create `loan_payments` table  
- Create `credit_card_payments` table
- Add columns to `income` table
- Set up indexes and RLS policies

### Phase 2: Data Migration Script (1 hour)
**File:** `/src/utils/migrations/migrateToSchedulePattern.js`

**What it does:**
1. Convert existing recurring income → `income_schedules`
2. Keep existing income records, link to schedules
3. Set `is_manual = true` for one-time income
4. Mark completed if recurring ended

**Data flow:**
```javascript
// For each recurring income:
income.frequency !== 'onetime' 
  → Create income_schedule
  → Link existing income record to schedule
  → Mark income as occurrence

// For one-time income:
income.frequency === 'onetime'
  → Mark as is_manual = true
  → No schedule needed
```

### Phase 3: New Utility Functions (2 hours)
**Files:**
- `/src/utils/incomeSchedules.js` - CRUD for schedules
- `/src/utils/loanPayments.js` - Loan payment processing
- `/src/utils/creditCardPayments.js` - CC payment processing
- `/src/utils/recurringProcessor.js` - Auto-deposit/payment engine

**Key functions:**

#### Income Schedules
```javascript
// Create schedule
createIncomeSchedule(scheduleData)

// Process due schedules (replaces autoDepositDueIncome)
processDueIncomeSchedules()
  → Check schedules where next_date <= today
  → Create income occurrence record
  → Deposit to bank/cash
  → Update schedule.next_date
  → Increment occurrences_completed

// Get schedule with history
getIncomeScheduleWithHistory(scheduleId)
  → Returns schedule + all income occurrences

// Undo income occurrence
undoIncomeOccurrence(incomeId)
  → Delete income record
  → Reverse bank/cash deposit
  → Decrement schedule.occurrences_completed
  → Roll back schedule.next_date
```

#### Loan Payments
```javascript
// Process overdue loans (replaces processOverdueLoans)
processOverdueLoanPayments()
  → Check loans where next_payment_date <= today
  → Create loan_payment record
  → Deduct from payment source
  → Reduce loan.balance
  → Update loan.next_payment_date
  → Create transaction

// Get loan payment history
getLoanPaymentHistory(loanId)
  → Returns all payments for loan

// Undo loan payment
undoLoanPayment(paymentId)
  → Mark payment as undone
  → Restore loan balance
  → Refund payment source
  → Roll back next_payment_date
```

#### Credit Card Payments
```javascript
// Process overdue cards (replaces processOverdueCreditCards)
processOverdueCreditCardPayments()
  → Check cards where due_date <= today
  → Create credit_card_payment record
  → Pay from payment source
  → Clear card.balance
  → Update card.due_date to next month
  → Create transaction

// Get card payment history
getCreditCardPaymentHistory(cardId)
  → Returns all payments for card

// Undo card payment
undoCreditCardPayment(paymentId)
  → Mark payment as undone
  → Restore card balance
  → Refund payment source
```

### Phase 4: Update Auto-Processing (1 hour)
**File:** `/src/utils/autoPay.js`

**Replace:**
- ❌ `autoDepositDueIncome()` 
- ✅ `processDueIncomeSchedules()`

- ❌ `processOverdueLoans()`
- ✅ `processOverdueLoanPayments()`

- ❌ `processOverdueCreditCards()`
- ✅ `processOverdueCreditCardPayments()`

### Phase 5: Update UI Components (3 hours)

#### Income.js
**Changes:**
- Show schedules separate from one-time income
- Add "Income Schedules" section with next payment dates
- Add "Income History" section with past occurrences
- Link occurrences to their schedule
- Edit schedule (not occurrence)
- Delete occurrence vs delete schedule

#### Loans.js
**Changes:**
- Add "Payment History" tab for each loan
- Show past payments with dates and amounts
- Show next scheduled payment prominently
- Undo individual payments

#### CreditCards.js
**Changes:**
- Add "Payment History" tab for each card
- Show past payments with dates and amounts
- Show next due date prominently
- Undo individual payments

### Phase 6: Update Activity Logger (1 hour)
**File:** `/src/utils/activityLogger.js`

**New activity types:**
- `'create_income_schedule'` - Created recurring income
- `'edit_income_schedule'` - Modified schedule
- `'income_occurrence'` - Income received (from schedule)
- `'loan_payment'` - Loan payment made
- `'credit_card_payment'` - CC payment made

**Undo logic:**
- `'create_income_schedule'` → Delete schedule + all occurrences
- `'income_occurrence'` → Undo single occurrence, adjust schedule
- `'loan_payment'` → Undo single payment, restore balance
- `'credit_card_payment'` → Undo single payment, restore balance

### Phase 7: Update Hooks (2 hours)
**Files:**
- `/src/hooks/transactions/useIncomeSchedules.js` - New hook
- `/src/hooks/transactions/useIncomeOperations.js` - Update for schedules
- `/src/hooks/transactions/useLoanPayments.js` - New hook
- `/src/hooks/transactions/useCreditCardPayments.js` - New hook

### Phase 8: Testing & Migration (2 hours)
1. **Backup database** - Critical!
2. **Run migration script** - Convert existing data
3. **Test auto-processing** - Verify schedules work
4. **Test undo** - Verify doesn't break schedules
5. **Test UI** - All pages work correctly

## Total Estimated Time: 12-15 hours

## Benefits After Migration

✅ **Undo works perfectly** - Only affects single occurrence
✅ **Full payment history** - See all past payments
✅ **Clean architecture** - Schedule vs occurrence separation
✅ **Better reporting** - Track payment patterns
✅ **Pause/resume schedules** - Stop temporarily without deleting
✅ **Edit future payments** - Change amount without losing history
✅ **Predictable behavior** - No more "moving dates"

## Rollback Plan

If something goes wrong:
1. Restore database backup
2. Keep old code in git branch
3. Migration script is idempotent (can run multiple times safely)

## Next Steps

1. Review this plan - any questions?
2. Run database migration SQL in Supabase
3. I'll create the migration script
4. I'll build new utility functions
5. Update UI components
6. Test thoroughly
7. Deploy!

Ready to proceed?
