# LOANS.JS - Clean Implementation Steps

## ⚠️ ISSUE DETECTED
The Loans.js file may have been corrupted during the last edit. 

## 🔧 Quick Fix

Please restore Loans.js from git or use this clean approach:

### Option 1: Restore from Git (Recommended)
```bash
git checkout HEAD -- src/components/Loans.js
```

Then apply the changes below manually.

### Option 2: Manual Fix

If the file starts with corrupted text like `const loanId = editingItem?.id || generateId();import React...`, 
delete that line and ensure the file starts with:

```javascript
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
```

---

## 📝 Changes to Apply to Loans.js

### Step 1: Add Imports (at top of file, after existing imports)
```javascript
import useAsyncAction from '../hooks/useAsyncAction';
import ActionButton from './shared/ActionButton';
import { showToast } from '../utils/toast';
```

### Step 2: Add Hook (after existing useState declarations, around line 73)
```javascript
// Async action hook for handling all async operations
const { executeAction, isProcessing: isActionProcessing } = useAsyncAction();
```

### Step 3: Update handleAdd Function

Find the `handleAdd` function (around line 433) and make these changes:

**Change validation alerts to toasts:**
```javascript
// OLD:
alert('Please fill in all required fields');

// NEW:
showToast.error('Please fill in all required fields');
```

Apply to ALL alert() calls in handleAdd for validation.

**Wrap the main logic with executeAction:**

Add BEFORE creating loanPayload:
```javascript
const actionId = editingItem ? `edit-loan-${editingItem.id}` : 'add-loan';

const result = await executeAction(actionId, async () => {
  const loanId = editingItem?.id || generateId();
  
  // ... all existing loan creation logic stays here
```

Add AFTER `resetForm();` and BEFORE the final closing brace:
```javascript
  await onUpdate();
  resetForm();
  
  return {
    loanName: savedLoan?.name || loanPayload.name,
    isNew: !editingItem
  };
});

// Handle result
setSavingLoan(false);

if (result.success) {
  const action = result.data.isNew ? 'added' : 'updated';
  showToast.success(`Loan '${result.data.loanName}' ${action} successfully`);
} else {
  showToast.error(`Failed to save loan: ${result.error.message}`);
}
```

**Remove old try-catch:**
Delete the lines:
```javascript
} catch (error) {
  console.error('Error saving loan:', error);
  alert('Failed to save loan. Please try again.');
} finally {
  setSavingLoan(false);
}
```

### Step 4: Update handlePayment Function

Find `handlePayment` (around line 880).

**Change validation alerts:**
```javascript
// OLD:
alert('Loan not found');
alert('Please enter a valid payment amount');
alert('Please select a payment date');

// NEW:
showToast.error('Loan not found');
showToast.error('Please enter a valid payment amount');
showToast.error('Please select a payment date');
```

**Wrap with executeAction:**

Add AFTER validation, BEFORE `try {`:
```javascript
const result = await executeAction(`pay-loan-${loanId}`, async () => {
```

Replace the entire try-catch with:
```javascript
// All the payment logic stays exactly the same
// Just remove the try { at the start
// and at the end, BEFORE the final catch, add:

  await onUpdate();
  setPayingLoan(null);
  resetPaymentFormState();
  
  return {
    loanId,
    loanName: loan.name,
    amount: paymentAmount,
    sourceName
  };
});

// Handle result  
if (result.success) {
  showToast.success(
    `Payment of ${formatCurrency(result.data.amount)} processed for ${result.data.loanName}`
  );
} else {
  showToast.error(`Payment failed: ${result.error.message}`);
}
```

**Delete old catch block:**
```javascript
} catch (error) {
  console.error('Error processing loan payment:', error);
  alert('Failed to process payment. Please try again.');
}
```

### Step 5: Update handleDelete Function

Find `handleDelete` (around line 1180).

**Wrap with executeAction:**
```javascript
const handleDelete = async (id) => {
  if (!window.confirm('Delete this loan?')) {
    return;
  }
  
  const loan = loans.find(l => l.id === id);
  
  const result = await executeAction(`delete-loan-${id}`, async () => {
    await dbOperation('loans', 'delete', id, { skipActivityLog: true });
    
    if (loan) {
      await logActivity(
        'delete',
        'loan',
        loan.id,
        loan.name,
        `Deleted loan '${loan.name}' - Principal ${formatCurrency(loan.principal)} • Balance ${formatCurrency(loan.balance)} • Payment ${formatCurrency(loan.payment_amount)} ${loan.frequency}`,
        loan
      );
    }
    
    await onUpdate();
    return { loanName: loan?.name || 'Loan' };
  });
  
  if (result.success) {
    showToast.success(`${result.data.loanName} deleted successfully`);
  } else {
    showToast.error(`Failed to delete loan: ${result.error.message}`);
  }
};
```

### Step 6: Replace Buttons with ActionButton

**Add/Edit Form Buttons** (around line 1115):
```javascript
<div className="flex gap-2">
  <ActionButton
    onClick={handleAdd}
    processing={isActionProcessing(editingItem ? `edit-loan-${editingItem.id}` : 'add-loan')}
    variant="primary"
    processingText={editingItem ? 'Updating Loan...' : 'Adding Loan...'}
    idleText={editingItem ? 'Update Loan' : 'Add Loan'}
    fullWidth
  />
  <ActionButton
    onClick={resetForm}
    variant="secondary"
    idleText="Cancel"
    fullWidth
  />
</div>
```

**Payment Buttons** (around line 1370):
```javascript
<div className="flex gap-2">
  <ActionButton
    onClick={() => handlePayment(loan.id)}
    processing={isActionProcessing(`pay-loan-${loan.id}`)}
    variant="success"
    processingText="Processing Payment..."
    idleText="Confirm Payment"
    fullWidth
  />
  <ActionButton
    onClick={() => {
      setPayingLoan(null);
      resetPaymentFormState();
    }}
    variant="secondary"
    idleText="Cancel"
    fullWidth
  />
</div>
```

**Make Payment Button** (bottom of loan card, around line 1380):
```javascript
<ActionButton
  onClick={() => openPaymentForm(loan)}
  variant="primary"
  idleText="Make Payment"
  fullWidth
/>
```

---

## ✅ Verification

After making changes, verify:
1. File starts with `import React...`
2. No duplicate code or syntax errors
3. All imports are at the top
4. Hook is declared before use
5. All buttons use ActionButton
6. All alerts replaced with showToast

---

## 🆘 If Still Having Issues

Share the first 50 lines of your Loans.js file and I'll help debug!
