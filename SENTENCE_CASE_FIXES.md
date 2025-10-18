# Sentence Case Fixes - Complete Guide

## 🎯 Problem
Activity descriptions and UI text are not consistently following Sentence Case formatting.

**Examples of issues:**
- ❌ "Payment for card Rogers Master Card from Cash"
- ❌ "Added credit card 'Name' - Frequency onetime"
- ❌ "Transferred from Bank Account"
- ❌ "Reserved Fund Applied: Rent"

**Should be:**
- ✅ "Payment for 'Rogers Master Card' from cash"
- ✅ "Added credit card 'Name' - Frequency One Time"
- ✅ "Transferred from bank account"
- ✅ "Reserved fund applied: Rent"

## 📋 Global Changes Needed

### Rule 1: Descriptions Start with Capital Letter
✅ First word capitalized: "Payment", "Added", "Updated", "Deleted"

### Rule 2: Entity Types are Lowercase (in middle of sentence)
- ❌ "Payment for card" 
- ✅ "Payment for 'CardName' from cash"

- ❌ "from Reserved Fund"
- ✅ "from reserved fund"

- ❌ "from Bank Account"  
- ✅ "from bank account"

- ❌ "from Credit Card"
- ✅ "from credit card"

### Rule 3: Frequency Values Must Be Formatted
- ❌ `onetime` → ✅ `One Time`
- ❌ `weekly` → ✅ `Weekly`
- ❌ `biweekly` → ✅ `Bi-Weekly`
- ❌ `monthly` → ✅ `Monthly`
- ❌ `bimonthly` → ✅ `Bi-Monthly`

### Rule 4: "from" is Lowercase (middle of sentence)
- ❌ "Payment from Cash"
- ✅ "Payment from cash"

## 🔧 Implementation

### Step 1: Import Helper Function
Add to each component that creates descriptions:

```javascript
import { formatFrequency, formatPaymentSource, buildPaymentDescription } from '../utils/sentenceCase';
```

### Step 2: Fix Payment Descriptions

**CreditCards.js** - Line ~950 (in handlePayment):
```javascript
// OLD:
description: `Payment for card ${card.name}${sourceName ? ` from ${sourceName}` : ''}`

// NEW:
description: `Payment for '${card.name}' from ${sourceName.toLowerCase()}`
```

**And in activity log** - Line ~960:
```javascript
// OLD:
`Made payment of ${formatCurrency(paymentAmount)} for '${card.name}' from ${sourceName} - Balance...`

// NEW:
`Made payment of ${formatCurrency(paymentAmount)} for '${card.name}' from ${sourceName.toLowerCase()} - Balance...`
```

**Loans.js** - Similar changes in handlePayment:
```javascript
// OLD:
description: `Payment for loan ${loan.name}${sourceName ? ` from ${sourceName}` : ''}`

// NEW:
description: `Payment for '${loan.name}' from ${sourceName.toLowerCase()}`
```

### Step 3: Fix Source Names

All places where we set `sourceName`, ensure proper casing:

```javascript
// When setting sourceName from payment methods:

// For cash:
sourceName = 'cash'; // lowercase

// For cash in hand:
sourceName = 'cash in hand'; // lowercase

// For reserved funds:
sourceName = fund.name; // keep as-is (it's a proper noun)

// For bank accounts:
sourceName = account.name; // keep as-is (it's a proper noun)

// For credit cards:
sourceName = card.name; // keep as-is (it's a proper noun)
```

### Step 4: Fix Frequency Display

**In all components that show frequency**, wrap with formatFrequency:

```javascript
// OLD:
{loan.frequency}
<option value="onetime">One-time</option>
Frequency ${fund.frequency}

// NEW:
{formatFrequency(loan.frequency)}
<option value="onetime">One Time</option>
Frequency {formatFrequency(fund.frequency)}
```

### Step 5: Fix Transaction Descriptions

**In db.js** - Reserved fund transaction descriptions:
```javascript
// OLD:
description: `Reserved fund applied: ${fund.name}`

// NEW:  
description: `Reserved fund applied: ${fund.name}`
// (This one is actually correct - starts with capital, entity type is lowercase)
```

**In BankAccounts.js** - Transfer descriptions:
```javascript
// OLD:
description: `Transferred ${formatCurrency(transferResult.amount)} from '${transferResult.fromAccount}' to '${transferResult.toAccount}'...`

// NEW: (This is correct)
description: `Transferred ${formatCurrency(transferResult.amount)} from '${transferResult.fromAccount}' to '${transferResult.toAccount}'...`
```

### Step 6: Fix Activity Logging

**Common patterns to fix:**

```javascript
// OLD:
`Added credit card '${name}' - Balance ${amount} • Limit ${limit} • Rate ${rate}% • Due ${date}`

// KEEP AS-IS - This is correct (starts with capital, property names are fine)

// OLD:
`Frequency ${frequency}`

// NEW:
`Frequency ${formatFrequency(frequency)}`
```

## 📝 Files to Update

### Priority 1: Payment Descriptions
1. **CreditCards.js**
   - Line ~916: Transaction description in handlePayment
   - Line ~960: Activity log description
   - Line ~370: Gift card purchase description

2. **Loans.js**
   - Line ~853: Transaction description in handlePayment
   - Line ~967: Activity log description

### Priority 2: Entity Type References
3. **CreditCards.js**
   - Any "Payment for card" → "Payment for"
   - Any "from Cash" → "from cash"
   - Any "from Reserved Fund" → "from reserved fund"

4. **Loans.js**
   - Any "Payment for loan" → "Payment for"
   - Similar source fixes

5. **BankAccounts.js**
   - Check transfer descriptions
   - Check cash operation descriptions

### Priority 3: Frequency Display
6. **All Components** that display frequency:
   - Replace raw frequency values with `formatFrequency(value)`
   - Update select option labels

### Priority 4: Add/Edit/Delete Descriptions
7. **All Components**:
   - Check activity log descriptions
   - Ensure entity types are lowercase in middle of sentences
   - Ensure frequencies use formatFrequency()

## 🧪 Test Cases

After fixes, verify these outputs:

### Payment Descriptions:
```
✅ "Payment for 'Rogers Master Card' from cash in hand"
✅ "Payment for 'Car Loan' from reserved fund: Rent"
✅ "Payment for 'Visa' from bank account: Tangerine Checking"
```

### Frequency Display:
```
✅ "Frequency One Time"
✅ "Frequency Weekly"
✅ "Frequency Bi-Weekly"
✅ "Frequency Monthly"
```

### Add Descriptions:
```
✅ "Added credit card 'Rogers' - Balance $500 • Limit $5000 • Rate 19.99% • Frequency Monthly"
✅ "Added loan 'Car Loan' - Principal $20000 • Balance $18000 • Payment $500 Monthly"
✅ "Added reserved fund 'Rent' - Amount $1200 • Due 01/01/2025 • Frequency Monthly"
```

### Transfer Descriptions:
```
✅ "Transferred $500.00 from 'Checking' to 'Savings' on 10/18/2025"
✅ "Deposited $100.00 from cash in hand to 'Tangerine Checking'"
✅ "Withdrew $50.00 from 'Savings' to cash in hand"
```

## 🚀 Quick Implementation

I'll create specific edit instructions for each file with exact line changes to make this easier.

### Automated Approach:
Import the helper and use it consistently:

```javascript
import { formatFrequency } from '../utils/sentenceCase';

// In descriptions:
`Frequency ${formatFrequency(loan.frequency)}`

// In activity logs:
`Added loan '${name}' - Frequency ${formatFrequency(frequency)}`
```

### Manual Approach:
Search and replace patterns:
- Find: `from Cash`
- Replace: `from cash`

- Find: `from Reserved Fund`
- Replace: `from reserved fund`

- Find: `Payment for card`
- Replace: `Payment for`

- Find: `Payment for loan`
- Replace: `Payment for`

---

**Ready to implement?** I can apply these changes systematically across all files!
