# Async Action System - Usage Guide

This guide shows how to use the new async action system with ActionButton and toast notifications.

## 📦 What's Included

1. **useAsyncAction Hook** - Manages async state and prevents duplicates
2. **ActionButton Component** - Smart button with loading states
3. **Toast System** - Beautiful notifications
4. **ToastContainer** - Global toast provider (already added to App.js)

## 🚀 Quick Start

### Basic Example

```javascript
import { useState } from 'react';
import useAsyncAction from '../hooks/useAsyncAction';
import ActionButton from '../components/shared/ActionButton';
import { showToast } from '../utils/toast';

function MyComponent() {
  const { executeAction, isProcessing } = useAsyncAction();

  const handleSave = async () => {
    const result = await executeAction('save-item', async () => {
      // Your async logic here
      await saveToDatabase();
      return { itemId: 123 };
    });

    if (result.success) {
      showToast.success('Item saved successfully!');
    } else {
      showToast.error(`Failed to save: ${result.error.message}`);
    }
  };

  return (
    <ActionButton
      onClick={handleSave}
      processing={isProcessing('save-item')}
      variant="primary"
      processingText="Saving..."
      idleText="Save Item"
    />
  );
}
```

## 📚 Complete Examples

### Example 1: Credit Card Payment

```javascript
import useAsyncAction from '../hooks/useAsyncAction';
import ActionButton from '../components/shared/ActionButton';
import { showToast } from '../utils/toast';
import { formatCurrency } from '../utils/helpers';

function CreditCards() {
  const { executeAction, isProcessing } = useAsyncAction();
  const [payingCard, setPayingCard] = useState(null);

  const handlePayment = async (cardId, amount) => {
    const result = await executeAction(`pay-${cardId}`, async () => {
      // Get card details
      const card = creditCards.find(c => c.id === cardId);
      
      // Update card balance
      const updatedCard = {
        ...card,
        balance: card.balance - amount
      };
      await dbOperation('creditCards', 'put', updatedCard);
      
      // Create transaction
      const transaction = {
        type: 'payment',
        card_id: cardId,
        amount: amount,
        date: new Date().toISOString().split('T')[0]
      };
      await dbOperation('transactions', 'put', transaction);
      
      // Log activity
      await logActivity('payment', 'card', cardId, card.name, 
        `Made payment of ${formatCurrency(amount)}`);
      
      // Refresh data
      await onUpdate();
      
      return { cardId, amount, cardName: card.name };
    });

    if (result.success) {
      showToast.success(
        `Payment of ${formatCurrency(result.data.amount)} processed for ${result.data.cardName}`
      );
      setPayingCard(null);
    } else {
      showToast.error(`Payment failed: ${result.error.message}`);
    }
  };

  return (
    <div>
      {creditCards.map(card => (
        <div key={card.id}>
          {payingCard === card.id ? (
            // Payment form
            <ActionButton
              onClick={() => handlePayment(card.id, paymentAmount)}
              processing={isProcessing(`pay-${card.id}`)}
              variant="success"
              processingText="Processing Payment..."
              idleText="Confirm Payment"
              fullWidth
            />
          ) : (
            <ActionButton
              onClick={() => setPayingCard(card.id)}
              variant="primary"
              idleText="Make Payment"
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

### Example 2: Delete Operation

```javascript
const handleDelete = async (itemId) => {
  if (!window.confirm('Are you sure you want to delete this item?')) {
    return;
  }

  const result = await executeAction(`delete-${itemId}`, async () => {
    await dbOperation('items', 'delete', itemId);
    await onUpdate();
    return { itemId };
  });

  if (result.success) {
    showToast.success('Item deleted successfully');
  } else {
    showToast.error(`Failed to delete: ${result.error.message}`);
  }
};

// In JSX:
<ActionButton
  onClick={() => handleDelete(item.id)}
  processing={isProcessing(`delete-${item.id}`)}
  variant="danger"
  processingText="Deleting..."
  idleText="Delete"
  size="sm"
/>
```

### Example 3: Add/Edit Form

```javascript
const handleSave = async () => {
  // Validation
  if (!formData.name || !formData.amount) {
    showToast.error('Please fill in all required fields');
    return;
  }

  const actionId = editingItem ? `edit-${editingItem.id}` : 'add-new';
  
  const result = await executeAction(actionId, async () => {
    const item = {
      id: editingItem?.id || generateId(),
      name: formData.name,
      amount: parseFloat(formData.amount)
    };
    
    await dbOperation('items', 'put', item);
    await logActivity(
      editingItem ? 'edit' : 'add',
      'item',
      item.id,
      item.name,
      editingItem ? 'Updated item' : 'Added new item'
    );
    await onUpdate();
    
    return { item, isNew: !editingItem };
  });

  if (result.success) {
    showToast.success(
      result.data.isNew ? 'Item added successfully' : 'Item updated successfully'
    );
    resetForm();
  } else {
    showToast.error(`Failed to save: ${result.error.message}`);
  }
};

// In JSX:
<div className="flex gap-2">
  <ActionButton
    onClick={handleSave}
    processing={isProcessing(editingItem ? `edit-${editingItem.id}` : 'add-new')}
    variant="primary"
    processingText={editingItem ? 'Updating...' : 'Adding...'}
    idleText={editingItem ? 'Update' : 'Add'}
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

### Example 4: Transfer Between Accounts

```javascript
const handleTransfer = async () => {
  const result = await executeAction('transfer', async () => {
    const result = await transferBetweenAccounts(
      transferData.fromAccount,
      transferData.toAccount,
      transferData.amount
    );
    
    await logActivity('transfer', 'bank_account', 
      result.fromAccountId, result.fromAccount,
      `Transferred ${formatCurrency(result.amount)} to ${result.toAccount}`
    );
    
    await onUpdate();
    return result;
  });

  if (result.success) {
    showToast.success(
      `Successfully transferred ${formatCurrency(result.data.amount)}`
    );
    setShowTransferForm(false);
  } else {
    showToast.error(`Transfer failed: ${result.error.message}`);
  }
};
```

## 🎨 ActionButton Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onClick` | Function | required | Click handler |
| `processing` | Boolean | false | Loading state |
| `variant` | String | 'primary' | Button style (primary, success, danger, secondary, warning, ghost) |
| `size` | String | 'md' | Button size (sm, md, lg) |
| `icon` | ReactNode | null | Icon to show when idle |
| `processingText` | String | 'Processing...' | Text when processing |
| `idleText` | String | required | Text when idle |
| `disabled` | Boolean | false | Additional disabled state |
| `fullWidth` | Boolean | false | Make button full width |
| `className` | String | '' | Additional CSS classes |

## 🎨 Button Variants

- **primary** (blue) - Main actions, saves, confirmations
- **success** (green) - Payments, successful actions
- **danger** (red) - Deletes, destructive actions
- **secondary** (gray) - Cancel, secondary actions
- **warning** (orange) - Caution, warning actions
- **ghost** (transparent) - Subtle, less prominent actions

## 📢 Toast Methods

```javascript
import { showToast } from '../utils/toast';

// Success toast (3 seconds)
showToast.success('Operation completed successfully!');

// Error toast (5 seconds)
showToast.error('Something went wrong');

// Info toast (3 seconds)
showToast.info('Here is some information');

// Loading toast (manual dismiss)
const toastId = showToast.loading('Processing...');
// Later: showToast.dismiss(toastId);

// Promise-based toast
showToast.promise(
  asyncOperation(),
  {
    loading: 'Processing...',
    success: 'Done!',
    error: 'Failed'
  }
);

// Dismiss specific toast
showToast.dismiss(toastId);

// Dismiss all toasts
showToast.dismissAll();
```

## ✅ Best Practices

1. **Unique Action IDs**: Use descriptive, unique IDs for each action
   - Good: `pay-${cardId}`, `delete-${itemId}`, `transfer-accounts`
   - Bad: `action`, `submit`, `save`

2. **Error Handling**: Always check `result.success` and show appropriate toast

3. **Return Data**: Return useful data from executeAction for success messages

4. **Validation First**: Validate before calling executeAction to avoid unnecessary processing

5. **Keep Actions Pure**: Put all your logic inside the async function passed to executeAction

6. **User Feedback**: Always show a toast after an operation completes

## 🔧 Migration Checklist

For each button that performs async operations:

- [ ] Import `useAsyncAction` hook
- [ ] Import `ActionButton` component
- [ ] Import `showToast` utility
- [ ] Add `const { executeAction, isProcessing } = useAsyncAction()` at component top
- [ ] Wrap async handler with `executeAction`
- [ ] Replace button with `ActionButton`
- [ ] Replace `alert()` with `showToast.success()` or `showToast.error()`
- [ ] Test duplicate click prevention
- [ ] Test error scenarios

## 🎯 Priority Order

Apply these changes in this order for maximum impact:

1. ✅ Payment buttons (Cards, Loans)
2. ✅ Delete buttons
3. ✅ Add/Edit form submissions
4. ✅ Transfer operations
5. ✅ Cash operations
6. ✅ Process Due Payments buttons
7. ✅ Bulk operations

## 📝 Notes

- The system automatically prevents duplicate actions
- Processing state is managed automatically
- Toasts are positioned at top-center
- Success toasts dismiss after 3 seconds
- Error toasts dismiss after 5 seconds
- Spinner is 14px and positioned on the left
- Buttons gray slightly when processing
- All state is cleaned up automatically

## 🚨 Important

**Run this first:**
```bash
npm install react-hot-toast
```

Then restart your dev server!
