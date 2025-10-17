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
      paymentMethod: { type: 'TEXT', required: true },
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
  }
};

export function getContextConfig(type) {
  return CONTEXT_CONFIGS[type];
}
