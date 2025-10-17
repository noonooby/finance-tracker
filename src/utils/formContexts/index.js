export { BaseContextManager } from './BaseContextManager';
export { CONTEXT_CONFIGS, getContextConfig } from './contextConfig';
export { contextToFormData, formDataToContext, selectAllText, validateContext } from './shared';

export {
  getIncomeSourceContext,
  saveIncomeSourceContext,
  getRecentIncomeSources,
  getLastUsedIncomeContext,
  deleteIncomeSourceContext,
  applyIncomeContext
} from './incomeContexts';

export {
  getExpenseContext,
  saveExpenseContext,
  getRecentExpenseDescriptions,
  getLastUsedExpenseContext,
  deleteExpenseContext,
  applyExpenseContext
} from './expenseContexts';

export {
  getCardPaymentContext,
  saveCardPaymentContext
} from './cardPaymentContexts';

export {
  getLoanPaymentContext,
  saveLoanPaymentContext
} from './loanPaymentContexts';
