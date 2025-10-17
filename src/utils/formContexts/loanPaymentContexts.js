import { BaseContextManager } from './BaseContextManager';
import { CONTEXT_CONFIGS } from './contextConfig';
import { validateContext } from './shared';

const manager = new BaseContextManager(
  CONTEXT_CONFIGS.loanPayment.tableName,
  CONTEXT_CONFIGS.loanPayment.triggerField
);

export async function getLoanPaymentContext(loanId) {
  if (!loanId) return null;
  return await manager.getContext(loanId);
}

export async function saveLoanPaymentContext(loanId, paymentData) {
  if (!loanId) throw new Error('Loan ID required');
  const context = {
    payment_source: paymentData.paymentSource || paymentData.source,
    payment_source_id: paymentData.paymentSourceId || paymentData.sourceId || null,
    amount_mode: paymentData.amountMode || 'full_payment'
  };
  const errors = validateContext(context, CONTEXT_CONFIGS.loanPayment.contextFields);
  if (errors.length > 0) throw new Error(`Invalid context: ${errors.join(', ')}`);
  return await manager.saveContext(loanId, context);
}
