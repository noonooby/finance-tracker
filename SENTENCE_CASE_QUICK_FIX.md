# Sentence Case - Quick Fix Script

## Apply These Edits to Each File:

### 1. CreditCards.js
Already started - continue with:
- [x] Import formatFrequency
- [x] sourceName = 'cash' (lowercase)
- [x] sourceName = 'cash in hand' (lowercase)  
- [x] Transaction description fixed
- [ ] Activity log description (line ~960)

**Remaining fix:**
```javascript
// Line ~960 in activity log:
`Made payment of ${formatCurrency(paymentAmount)} for '${card.name}' from ${sourceName} - Balance...`
// (Already correct since sourceName is now lowercase)
```

### 2. Loans.js

**Add import:**
```javascript
import { formatFrequency } from '../utils/sentenceCase';
```

**Fix source names (around line 730):**
```javascript
let sourceName = 'cash'; // Change from 'Cash'
```

**Fix cash in hand (around line 870):**
```javascript
sourceName = 'cash in hand'; // Change from 'Cash in Hand'
```

**Fix final else cash (around line 880):**
```javascript
sourceName = 'cash'; // Change from 'Cash'
```

**Fix transaction description (around line 890):**
```javascript
description: `Payment for '${loan.name}' from ${sourceName}`,
// Change from: `Payment for loan ${loan.name}${sourceName ? ` from ${sourceName}` : ''}`
```

### 3. BankAccounts.js

**Add import:**
```javascript
import { formatFrequency } from '../utils/sentenceCase';
```

**Cash withdrawal descriptions are already correct:**
- Uses actual account names (proper nouns)
- "Withdrew $X from 'AccountName' to cash in hand" ✅

**Transfer descriptions are already correct:**
- "Transferred $X from 'AccountA' to 'AccountB'" ✅

### 4. ReservedFunds.js

**Add import:**
```javascript
import { formatFrequency } from '../utils/sentenceCase';
```

**Fix frequency display (multiple locations):**

Find all instances of:
```javascript
{fund.frequency}
${fund.frequency}
Frequency ${fund.frequency || 'N/A'}
```

Replace with:
```javascript
{formatFrequency(fund.frequency)}
${formatFrequency(fund.frequency)}
Frequency ${formatFrequency(fund.frequency) || 'N/A'}
```

**In activity logs (around line 160):**
```javascript
`Added reserved fund '${savedFund.name}' - Amount ${formatCurrency(savedFund.amount)} • Due ${formatDate(savedFund.due_date)} • Frequency ${formatFrequency(savedFund.frequency) || 'N/A'}`
```

**In delete description (around line 380):**
```javascript
`Deleted reserved fund '${fund.name}' - Amount ${formatCurrency(fund.amount)} • Due ${formatDate(fund.due_date)} • Frequency ${formatFrequency(fund.frequency) || 'N/A'}`
```

**In UI display (around line 740):**
```javascript
<span className="capitalize">Recurring: {formatFrequency(fund.frequency)}</span>
```

### 5. Loans.js

**Fix frequency in activity logs (around line 530):**
```javascript
`Added loan '${savedLoan?.name || loanPayload.name}' - Principal ${formatCurrency(...)} • Balance ${formatCurrency(...)} • Payment ${formatCurrency(...)} ${formatFrequency(savedLoan?.frequency || loanPayload.frequency)}`
```

**In delete description (around line 1010):**
```javascript
`Deleted loan '${loan.name}' - Principal ${formatCurrency(loan.principal)} • Balance ${formatCurrency(loan.balance)} • Payment ${formatCurrency(loan.payment_amount)} ${formatFrequency(loan.frequency)}`
```

**In UI display (around line 1250):**
```javascript
<span className="capitalize">Frequency: {formatFrequency(loan.frequency)}</span>
```

### 6. Income.js

**Add import:**
```javascript
import { formatFrequency } from '../utils/sentenceCase';
```

**In UI display (around line 550):**
```javascript
<span className="capitalize">{formatFrequency(inc.frequency)}</span>
```

**In predicted income (around line 470):**
```javascript
{formatDate(pred.date)} • {formatFrequency(pred.frequency)}
```

---

## Quick Test:
After all changes, check one activity description:
- Should see: "Payment for 'Rogers Master Card' from cash"
- NOT: "Payment for card Rogers Master Card from Cash"

---

Ready to apply? Say "apply sentence case fixes" and I'll do them all!
