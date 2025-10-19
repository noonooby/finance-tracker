import { BaseContextManager } from './BaseContextManager';
import { CONTEXT_CONFIGS } from './contextConfig';
import { contextToFormData, formDataToContext, validateContext } from './shared';

const manager = new BaseContextManager(
  CONTEXT_CONFIGS.giftCardPurchase.tableName,
  CONTEXT_CONFIGS.giftCardPurchase.triggerField
);

const FIELD_MAPPING = CONTEXT_CONFIGS.giftCardPurchase.formMapping;

/**
 * Get gift card purchase context for a specific card name
 */
export async function getGiftCardPurchaseContext(cardName) {
  if (!cardName?.trim()) return null;
  return await manager.getContext(cardName.trim());
}

/**
 * Save gift card purchase context
 */
export async function saveGiftCardPurchaseContext(cardName, formData) {
  if (!cardName?.trim()) throw new Error('Card name required');
  const context = formDataToContext(formData, FIELD_MAPPING);
  const errors = validateContext(context, CONTEXT_CONFIGS.giftCardPurchase.contextFields);
  if (errors.length > 0) throw new Error(`Invalid context: ${errors.join(', ')}`);
  return await manager.saveContext(cardName.trim(), context);
}

/**
 * Get recent gift card names (for quick-select buttons)
 */
export async function getRecentGiftCardNames(limit = 5) {
  return await manager.getRecentTriggers(limit);
}

/**
 * Get last used gift card purchase context
 */
export async function getLastUsedGiftCardContext() {
  return await manager.getMostRecentContext();
}

/**
 * Delete gift card purchase context
 */
export async function deleteGiftCardPurchaseContext(cardName) {
  if (!cardName?.trim()) throw new Error('Card name required');
  return await manager.deleteContext(cardName.trim());
}

/**
 * Apply gift card purchase context to form data
 */
export function applyGiftCardPurchaseContext(context) {
  if (!context) return {};
  return contextToFormData(context, FIELD_MAPPING);
}
