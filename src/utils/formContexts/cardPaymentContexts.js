import { BaseContextManager } from './BaseContextManager';
import { CONTEXT_CONFIGS } from './contextConfig';
import { validateContext } from './shared';

const manager = new BaseContextManager(
  CONTEXT_CONFIGS.cardPayment.tableName,
  CONTEXT_CONFIGS.cardPayment.triggerField
);

export async function getCardPaymentContext(cardId) {
  if (!cardId) return null;
  return await manager.getContext(cardId);
}

export async function saveCardPaymentContext(cardId, paymentData) {
  if (!cardId) throw new Error('Card ID required');
  const context = {
    payment_source: paymentData.paymentSource || paymentData.source,
    payment_source_id: paymentData.paymentSourceId || paymentData.sourceId || null,
    amount_mode: paymentData.amountMode || 'full_balance'
  };
  const errors = validateContext(context, CONTEXT_CONFIGS.cardPayment.contextFields);
  if (errors.length > 0) throw new Error(`Invalid context: ${errors.join(', ')}`);
  return await manager.saveContext(cardId, context);
}
