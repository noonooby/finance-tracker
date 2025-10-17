# Form Context System

Intelligent form auto-fill system that learns from user behavior to speed up data entry.

## 📁 Project Structure

```
src/utils/formContexts/
├── BaseContextManager.js      # Core context management class
├── contextConfig.js            # Configuration for all context types
├── shared.js                   # Shared utility functions
├── incomeContexts.js          # Income form context manager
├── expenseContexts.js         # Expense form context manager
├── cardPaymentContexts.js     # Card payment context manager
├── loanPaymentContexts.js     # Loan payment context manager
└── index.js                   # Public API exports

migrations/
└── form_context_system.sql    # Database schema
```

## 🎯 Features

- **Quick-Select Buttons**: Show last 5 used values for instant selection
- **Auto-Fill**: Automatically populate related fields based on context
- **Auto-Highlight**: Pre-filled text is selected for easy override
- **Context-Aware**: Different inputs remember different settings

## 🚀 Quick Start

### 1. Run Database Migration

```sql
-- In Supabase Dashboard → SQL Editor
-- Copy and run: migrations/form_context_system.sql
```

### 2. Import in Components

```javascript
import {
  getIncomeSourceContext,
  saveIncomeSourceContext,
  getRecentIncomeSources,
  applyIncomeContext
} from '../utils/formContexts';
```

### 3. Basic Usage Pattern

```javascript
// Load contexts on mount
useEffect(() => {
  const loadContexts = async () => {
    const recent = await getRecentIncomeSources(5);
    setRecentSources(recent);
    
    const lastContext = await getLastUsedIncomeContext();
    if (lastContext) {
      const contextData = applyIncomeContext(lastContext);
      setFormData(prev => ({ ...prev, ...contextData }));
    }
  };
  loadContexts();
}, []);

// Save context on submit
const handleSubmit = async () => {
  // ... save main data ...
  
  await saveIncomeSourceContext(formData.source, {
    depositTarget: formData.depositTarget,
    depositAccountId: formData.depositAccountId,
    frequency: formData.frequency
  });
};

// Apply context on selection
const handleSelectSource = async (sourceContext) => {
  const contextData = applyIncomeContext(sourceContext);
  setFormData(prev => ({ ...prev, ...contextData }));
};
```

## 📊 Database Schema

### income_source_contexts
- `source_name` → `destination` + `account_id` + `frequency`
- Tracks which bank/account and frequency user prefers for each income source

### expense_description_contexts  
- `description` → `category_id` + `payment_method` + `payment_method_id`
- Tracks category and payment method for each expense type

### card_payment_contexts
- `card_id` → `payment_source` + `payment_source_id` + `amount_mode`
- Tracks preferred payment source for each card

### loan_payment_contexts
- `loan_id` → `payment_source` + `payment_source_id` + `amount_mode`
- Tracks preferred payment source for each loan

## 🔧 API Reference

### Income Contexts

```javascript
// Get context for specific source
const context = await getIncomeSourceContext('Salary');

// Save/update context
await saveIncomeSourceContext('Salary', formData);

// Get recent sources (for quick-select buttons)
const recent = await getRecentIncomeSources(5);

// Get last used context (for pre-fill)
const last = await getLastUsedIncomeContext();

// Convert DB context to form data
const formData = applyIncomeContext(context);

// Delete context
await deleteIncomeSourceContext('Salary');
```

### Expense Contexts

```javascript
const context = await getExpenseContext('Groceries');
await saveExpenseContext('Groceries', formData);
const recent = await getRecentExpenseDescriptions(5);
const last = await getLastUsedExpenseContext();
const formData = applyExpenseContext(context);
await deleteExpenseContext('Groceries');
```

### Card/Loan Payment Contexts

```javascript
const context = await getCardPaymentContext(cardId);
await saveCardPaymentContext(cardId, paymentData);

const context = await getLoanPaymentContext(loanId);
await saveLoanPaymentContext(loanId, paymentData);
```

## 🎨 UI Components

### Quick-Select Buttons

```jsx
{recentSources.length > 0 && (
  <div>
    <label>Recent Sources</label>
    <div className="flex gap-2 flex-wrap">
      {recentSources.map(source => (
        <button
          key={source.source_name}
          onClick={() => handleSelectSource(source)}
          className={formData.source === source.source_name ? 'active' : ''}
        >
          {source.source_name}
          {source.usage_count > 10 && ' ⭐'}
        </button>
      ))}
    </div>
  </div>
)}
```

### Auto-Highlighting Input

```jsx
const sourceInputRef = useRef(null);

<input
  ref={sourceInputRef}
  value={formData.source}
  onChange={(e) => handleSourceChange(e.target.value)}
  onBlur={handleSourceBlur}
  autoFocus={!editingItem}
/>

// After pre-fill
setTimeout(() => {
  if (sourceInputRef.current) {
    sourceInputRef.current.select();
    sourceInputRef.current.focus();
  }
}, 100);
```

## ⚠️ Important Notes

### Error Handling
Always wrap context operations in try-catch. **Never block main operations** if context save fails:

```javascript
// ✅ Good
try {
  await saveIncomeSourceContext(source, data);
} catch (err) {
  console.warn('Failed to save context:', err);
  // Continue with main operation
}

// ❌ Bad - Don't let context errors block user
await saveIncomeSourceContext(source, data); // Throws on error
```

### Timing Considerations
Auto-highlight may need timing adjustment (100-200ms) for different browsers:

```javascript
setTimeout(() => {
  inputRef.current?.select();
}, 100); // Adjust if needed
```

### Mobile Support
- Quick-select buttons should wrap on mobile
- Touch-friendly button sizes (min 44x44px)
- Test keyboard behavior on mobile

## 🧪 Testing

### Infrastructure Test
```javascript
// Browser console
import { saveIncomeSourceContext, getIncomeSourceContext } 
  from './utils/formContexts';

await saveIncomeSourceContext('Test', { 
  depositTarget: 'bank', 
  frequency: 'monthly' 
});

const ctx = await getIncomeSourceContext('Test');
console.log('Context:', ctx);
```

### Integration Checklist
- [ ] Form loads with last context pre-filled
- [ ] Quick-select buttons appear after 2+ uses
- [ ] Clicking button auto-fills all fields
- [ ] New entries save context
- [ ] Context persists across page reloads
- [ ] Different inputs have different contexts
- [ ] No console errors

## 📈 Usage Statistics

Contexts track usage patterns:
- `usage_count`: How many times used
- `last_used_at`: When last used
- Star (⭐) appears for usage_count > 10

## 🔒 Security

- Row Level Security (RLS) enabled on all tables
- Users can only access their own contexts
- Contexts cascade delete when user is deleted
- Account references null on account deletion

## 🎯 Integration Status

- ✅ Infrastructure complete (8 files)
- ✅ Database migration ready
- ⏳ Income form integration pending
- ⏳ Expense form integration pending
- ⏳ Card payment integration pending
- ⏳ Loan payment integration pending

## 📚 Related Documentation

- See `FORM_CONTEXT_QUICK_REFERENCE.md` for detailed setup guide
- See `IMPLEMENTATION_STATUS.md` for current progress
- See `migrations/form_context_system.sql` for database schema
