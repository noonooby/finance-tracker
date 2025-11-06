# CreditCards.js Cleanup Guide

## Problem
Old `handlePayment` function still exists in file (lines ~508-688), referencing:
- `paymentForm` (undefined)
- `saveCardPaymentContext` (not imported)
- `setPayingCard` (doesn't exist)
- `resetPaymentFormState` (doesn't exist)

## Solution
Delete entire `handlePayment` function - it's no longer needed because we now use the unified AddTransaction modal for all payments.

## What to Remove
Starting after `handleEdit` function, remove everything from:
```javascript
const handlePayment = async (cardId) => {
  // ... entire function body ...
};
```

Until you reach:
```javascript
const handleAddBalance = async (formData) => {
```

This removes ~180 lines of obsolete payment processing code.

## After Removal
The flow should be:
1. `handleEdit()` - Edits card details
2. `handleAddBalance()` - Gift card balance operations (keep this!)
3. `handleUseBalance()` - Gift card usage (keep this!)
4. `handleDelete()` - Deletes card

The payment flow is now handled by Add Transaction modal opened via `handleMakePayment()`.
