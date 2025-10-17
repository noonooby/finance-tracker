# 🎯 Form Context System - Complete Implementation Plan

## **📋 Executive Summary**

This document provides a complete, production-ready plan to implement an intelligent form context system across all data entry points in the finance tracker app. The system learns user preferences and provides smart defaults, quick-select buttons, and auto-fill capabilities to dramatically improve data entry speed and user experience.

---

## **🎨 Design Philosophy**

### **Core Principles:**
1. **Learn from usage** - System adapts to user behavior automatically
2. **Context-aware** - Different triggers = different defaults
3. **Minimal friction** - Quick-select buttons + auto-fill + auto-highlight
4. **Type-safe** - Proper database schema with validation
5. **Maintainable** - Shared patterns, minimal code duplication
6. **Extensible** - Easy to add new form types

### **User Experience:**
- **Quick-select buttons** show 5 most recent values
- **Auto-fill** applies saved context when trigger value selected
- **Auto-highlight** text in pre-filled fields for easy override
- **Smart defaults** adapt based on usage patterns

---

## **📊 PART 1: COMPLETE FORM INVENTORY**

### **All Data Entry Forms in the App:**

| # | Form | Component File | Purpose |
|---|------|----------------|---------|
| 1 | **Income** | `Income.js` | Log income received |
| 2 | **Expense** | `AddTransaction.js` | Record expenses |
| 3 | **Payment** | `AddTransaction.js` | Pay credit cards/loans |
| 4 | **Credit Card** | `CreditCards.js` | Add/edit cards |
| 5 | **Loan** | `Loans.js` | Add/edit loans |
| 6 | **Reserved Fund** | `ReservedFunds.js` | Create savings funds |
| 7 | **Bank Account** | `BankAccounts.js` | Add bank accounts |
| 8 | **Gift Card Purchase** | `CreditCards.js` | Buy gift cards |

---

## **🔍 PART 2: DETAILED FIELD ANALYSIS**

### **Form 1: INCOME (Income.js)**

**Current Fields:**
```javascript
{
  source: 'Salary',              // SmartInput - user types
  amount: '',                     // Number input
  date: 'YYYY-MM-DD',            // Date picker - defaults to today
  frequency: 'biweekly',         // Dropdown: weekly, biweekly, monthly, onetime
  depositTarget: 'bank',         // Radio: 'bank' or 'cash_in_hand'
  depositAccountId: '',          // Dropdown: bank accounts list
  recurringDurationType: 'indefinite',
  recurringUntilDate: '',
  recurringOccurrences: '',
  reservedAmount: ''             // Optional - for creating reserved fund
}
```

**What Should Be Learned:**

| Trigger Field | When User Types This | Remember These Fields |
|---------------|---------------------|----------------------|
| `source` | "Salary" | `depositTarget: 'bank'`<br>`depositAccountId: 'td-checking-uuid'`<br>`frequency: 'biweekly'` |
| `source` | "Freelance" | `depositTarget: 'bank'`<br>`depositAccountId: 'business-account-uuid'`<br>`frequency: 'onetime'` |
| `source` | "Friend Transfer" | `depositTarget: 'cash_in_hand'`<br>`depositAccountId: null`<br>`frequency: 'onetime'` |

**Smart Behaviors:**
- ✅ Last used source pre-filled and auto-highlighted
- ✅ Selecting "Salary" button → auto-fills TD Checking + Biweekly
- ✅ Date always defaults to today
- ✅ Amount field is next focus after source

**Database Table Needed:** `income_source_contexts`

---

### **Form 2: EXPENSE (AddTransaction.js - Expense Tab)**

**Current Fields:**
```javascript
{
  type: 'expense',
  description: '',               // SmartInput - user types
  amount: '',                    // Number input
  date: 'YYYY-MM-DD',           // Date picker
  categoryId: '',                // Dropdown: categories
  paymentMethod: 'bank_account', // Complex: cash_in_hand, bank_account:ID, credit_card:ID
  paymentMethodId: '',
  notes: ''                      // Textarea - optional
}
```

**What Should Be Learned:**

| Trigger Field | When User Types This | Remember These Fields |
|---------------|---------------------|----------------------|
| `description` | "Coffee" | `categoryId: 'food-drinks-uuid'`<br>`paymentMethod: 'credit_card'`<br>`paymentMethodId: 'rogers-card-uuid'` |
| `description` | "Gas" | `categoryId: 'transportation-uuid'`<br>`paymentMethod: 'credit_card'`<br>`paymentMethodId: 'rogers-card-uuid'` |
| `description` | "Rent" | `categoryId: 'housing-uuid'`<br>`paymentMethod: 'bank_account'`<br>`paymentMethodId: 'td-checking-uuid'` |

**Smart Behaviors:**
- ✅ Last used description pre-filled and auto-highlighted
- ✅ Recent categories shown with ⏱️ icon (already exists)
- ✅ Selecting "Coffee" button → auto-fills Food category + Rogers card
- ✅ Date defaults to today
- ✅ Payment method shows recent items first (already exists)

**Database Table Needed:** `expense_description_contexts`

---

### **Form 3: PAYMENT (AddTransaction.js - Payment Tab)**

**Current Fields:**
```javascript
{
  type: 'payment',
  paymentMethod: 'credit_card',  // Toggle: 'credit_card' or 'loan'
  paymentMethodId: '',           // Which card/loan to pay
  amount: '',
  date: 'YYYY-MM-DD',
  paymentSource: 'cash_in_hand', // Where money comes from
  paymentSourceId: '',
  notes: ''
}
```

**What Should Be Learned:**

| Trigger Field | When Paying This Entity | Remember These Fields |
|---------------|------------------------|----------------------|
| `paymentMethodId` | Rogers Mastercard | `paymentSource: 'bank_account'`<br>`paymentSourceId: 'td-checking-uuid'` |
| `paymentMethodId` | TD Visa | `paymentSource: 'reserved_fund'`<br>`paymentSourceId: 'credit-fund-uuid'` |
| `paymentMethodId` | Car Loan | `paymentSource: 'bank_account'`<br>`paymentSourceId: 'td-checking-uuid'` |

**Smart Behaviors:**
- ✅ When selecting Rogers card → auto-fills "TD Checking" as payment source
- ✅ Date defaults to today
- ✅ Amount has "Full Balance" quick button (already exists)

**Database Tables Needed:** 
- `card_payment_contexts`
- `loan_payment_contexts`

---

### **Form 4: CREDIT CARD (CreditCards.js)**

**Current Fields:**
```javascript
{
  name: '',                      // SmartInput
  balance: '',
  isGiftCard: false,             // Toggle
  
  // For credit cards:
  creditLimit: '',
  dueDate: '',
  statementDay: '',
  interestRate: '',
  alertDays: 7,
  
  // For gift cards:
  purchaseAmount: '',
  purchaseDate: 'YYYY-MM-DD',
  giftCardPaymentMethod: 'cash', // How user paid for gift card
  hasExpiry: false,
  expiryDate: ''
}
```

**What Should Be Learned:**

For **GIFT CARD PURCHASES** specifically:

| Trigger Field | When User Buys | Remember These Fields |
|---------------|---------------|----------------------|
| `name` | "Amazon Gift Card" | `purchaseAmount: 100`<br>`giftCardPaymentMethod: 'credit_card:rogers-uuid'`<br>`hasExpiry: false` |
| `name` | "Starbucks Gift Card" | `purchaseAmount: 50`<br>`giftCardPaymentMethod: 'bank_account:td-uuid'`<br>`hasExpiry: true` |

**Smart Behaviors:**
- ✅ When typing "Amazon Gift Card" → suggests $100, Rogers card
- ✅ Purchase date defaults to today
- ✅ Less important for regular credit cards (one-time setup)

**Database Table Needed:** `gift_card_purchase_contexts` (OPTIONAL - low priority)

---

### **Form 5: LOAN (Loans.js)**

**Current Fields:**
```javascript
{
  name: '',                      // SmartInput
  principal: '',
  balance: '',
  interestRate: '',
  paymentAmount: '',
  frequency: 'monthly',
  nextPaymentDate: '',
  alertDays: 7,
  recurringDurationType: 'indefinite',
  recurringUntilDate: '',
  recurringOccurrences: ''
}
```

**Analysis:**
- Loans are typically created **once** and rarely edited
- No patterns to learn (each loan is unique)
- **Skip context learning for loan creation**

**Database Table Needed:** ❌ **NONE** (not worth it)

---

### **Form 6: RESERVED FUND (ReservedFunds.js)**

Let me check the structure:

<function_calls>
<invoke name="Filesystem:read_file">
<parameter name="path">/Users/Rithul/Documents/finance-tracker/src/components/ReservedFunds.js