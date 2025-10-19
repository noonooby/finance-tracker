export const CONTEXT_CONFIGS = {
  income: {
    tableName: 'income_source_contexts',
    triggerField: 'source_name',
    displayName: 'Income Source',
    contextFields: {
      destination: { type: 'TEXT', required: true },
      accountId: { type: 'UUID', dbColumn: 'account_id', nullable: true },
      frequency: { type: 'TEXT', required: true, default: 'onetime' }
    },
    formMapping: {
      destination: 'depositTarget',
      account_id: 'depositAccountId',
      frequency: 'frequency'
    }
  },
  
  expense: {
    tableName: 'expense_description_contexts',
    triggerField: 'description',
    displayName: 'Expense Description',
    contextFields: {
      categoryId: { type: 'UUID', dbColumn: 'category_id', nullable: true },
      paymentMethod: { type: 'TEXT', dbColumn: 'payment_method', required: true },
      paymentMethodId: { type: 'UUID', dbColumn: 'payment_method_id', nullable: true }
    },
    formMapping: {
      category_id: 'categoryId',
      payment_method: 'paymentMethod',
      payment_method_id: 'paymentMethodId'
    }
  },
  
  cardPayment: {
    tableName: 'card_payment_contexts',
    triggerField: 'card_id',
    contextFields: {
      paymentSource: { type: 'TEXT', dbColumn: 'payment_source', required: true },
      paymentSourceId: { type: 'UUID', dbColumn: 'payment_source_id', nullable: true },
      amountMode: { type: 'TEXT', dbColumn: 'amount_mode', required: true, default: 'full_balance' }
    }
  },
  
  loanPayment: {
    tableName: 'loan_payment_contexts',
    triggerField: 'loan_id',
    contextFields: {
      paymentSource: { type: 'TEXT', dbColumn: 'payment_source', required: true },
      paymentSourceId: { type: 'UUID', dbColumn: 'payment_source_id', nullable: true },
      amountMode: { type: 'TEXT', dbColumn: 'amount_mode', required: true, default: 'full_payment' }
    }
  },
  
  loanCreation: {
    tableName: 'loan_creation_contexts',
    triggerField: 'loan_name',
    displayName: 'Loan Template',
    contextFields: {
      principal: { type: 'NUMERIC', required: true },
      interestRate: { type: 'NUMERIC', dbColumn: 'interest_rate', nullable: true },
      paymentAmount: { type: 'NUMERIC', dbColumn: 'payment_amount', required: true },
      frequency: { type: 'TEXT', required: true, default: 'monthly' }
    },
    formMapping: {
      principal: 'principal',
      interest_rate: 'interestRate',
      payment_amount: 'paymentAmount',
      frequency: 'frequency'
    }
  },
  
  transfer: {
    tableName: 'transfer_description_contexts',
    triggerField: 'description',
    displayName: 'Transfer Description',
    contextFields: {
      fromAccountId: { type: 'UUID', dbColumn: 'from_account_id', nullable: true },
      toAccountId: { type: 'UUID', dbColumn: 'to_account_id', nullable: true },
      fromAccountName: { type: 'TEXT', dbColumn: 'from_account_name', nullable: true },
      toAccountName: { type: 'TEXT', dbColumn: 'to_account_name', nullable: true }
    },
    formMapping: {
      from_account_id: 'fromAccountId',
      to_account_id: 'toAccountId',
      from_account_name: 'fromAccountName',
      to_account_name: 'toAccountName'
    }
  },
  
  giftCardPurchase: {
    tableName: 'gift_card_purchase_contexts',
    triggerField: 'card_name',
    displayName: 'Gift Card Purchase',
    contextFields: {
      originalValue: { type: 'NUMERIC', dbColumn: 'original_value', required: true },
      purchaseAmount: { type: 'NUMERIC', dbColumn: 'purchase_amount', required: true },
      paymentSource: { type: 'TEXT', dbColumn: 'payment_source', required: true },
      paymentSourceId: { type: 'TEXT', dbColumn: 'payment_source_id', nullable: true }
    },
    formMapping: {
      original_value: 'originalValue',
      purchase_amount: 'purchaseAmount',
      payment_source: 'paymentSource',
      payment_source_id: 'paymentSourceId'
    }
  },
  
  giftCardPurchase: {
    tableName: 'gift_card_purchase_contexts',
    triggerField: 'card_name',
    displayName: 'Gift Card Purchase',
    contextFields: {
      originalValue: { type: 'NUMERIC', dbColumn: 'original_value', required: true },
      purchaseAmount: { type: 'NUMERIC', dbColumn: 'purchase_amount', required: true },
      paymentSource: { type: 'TEXT', dbColumn: 'payment_source', required: true },
      paymentSourceId: { type: 'TEXT', dbColumn: 'payment_source_id', nullable: true }
    },
    formMapping: {
      original_value: 'originalValue',
      purchase_amount: 'purchaseAmount',
      payment_source: 'paymentSource',
      payment_source_id: 'paymentSourceId'
    }
  }
};

export function getContextConfig(type) {
  return CONTEXT_CONFIGS[type];
}
