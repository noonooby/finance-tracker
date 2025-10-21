import { BaseContextManager } from './BaseContextManager';

/**
 * Gift Card Add Balance Context Manager
 * Learns and remembers: amount, payment source, category
 */
class GiftCardAddBalanceContextManager extends BaseContextManager {
  constructor() {
    super('gift_card_add_balance', ['gift_card_id']);
  }

  extractContext(formData, giftCard) {
    return {
      gift_card_id: giftCard.id,
      gift_card_name: giftCard.name,
      amount: Number(formData.amount) || 0,
      payment_source: formData.paymentSource,
      payment_source_id: formData.paymentSourceId,
      category_id: formData.category,
      timestamp: new Date().toISOString()
    };
  }

  applyContext(context) {
    return {
      amount: context.amount || '',
      paymentSource: context.payment_source || 'cash_in_hand',
      paymentSourceId: context.payment_source_id || null,
      category: context.category_id || ''
    };
  }
}

/**
 * Gift Card Use Balance Context Manager
 * Learns and remembers: amount, category, notes pattern
 */
class GiftCardUseBalanceContextManager extends BaseContextManager {
  constructor() {
    super('gift_card_use_balance', ['gift_card_id']);
  }

  extractContext(formData, giftCard) {
    return {
      gift_card_id: giftCard.id,
      gift_card_name: giftCard.name,
      amount: Number(formData.amount) || 0,
      category_id: formData.category,
      notes: formData.notes || '',
      timestamp: new Date().toISOString()
    };
  }

  applyContext(context) {
    return {
      amount: context.amount || '',
      category: context.category_id || '',
      notes: context.notes || ''
    };
  }
}

// Singleton instances
const addBalanceManager = new GiftCardAddBalanceContextManager();
const useBalanceManager = new GiftCardUseBalanceContextManager();

/**
 * Save gift card add balance context
 */
export async function saveGiftCardAddBalanceContext(formData, giftCard) {
  try {
    const context = addBalanceManager.extractContext(formData, giftCard);
    await addBalanceManager.saveContext(context);
    console.log('✅ Gift card add balance context saved for', giftCard.name);
  } catch (error) {
    console.error('❌ Failed to save gift card add balance context:', error);
  }
}

/**
 * Get gift card add balance context (last used for this card)
 */
export async function getGiftCardAddBalanceContext(giftCardId) {
  try {
    const context = await addBalanceManager.getContext({ gift_card_id: giftCardId });
    if (context) {
      console.log('✅ Found gift card add balance context for card:', giftCardId);
      return addBalanceManager.applyContext(context);
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to get gift card add balance context:', error);
    return null;
  }
}

/**
 * Save gift card use balance context
 */
export async function saveGiftCardUseBalanceContext(formData, giftCard) {
  try {
    const context = useBalanceManager.extractContext(formData, giftCard);
    await useBalanceManager.saveContext(context);
    console.log('✅ Gift card use balance context saved for', giftCard.name);
  } catch (error) {
    console.error('❌ Failed to save gift card use balance context:', error);
  }
}

/**
 * Get gift card use balance context (last used for this card)
 */
export async function getGiftCardUseBalanceContext(giftCardId) {
  try {
    const context = await useBalanceManager.getContext({ gift_card_id: giftCardId });
    if (context) {
      console.log('✅ Found gift card use balance context for card:', giftCardId);
      return useBalanceManager.applyContext(context);
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to get gift card use balance context:', error);
    return null;
  }
}

/**
 * Get recent amounts used for this gift card (for quick suggestions)
 */
export async function getRecentGiftCardAmounts(giftCardId, limit = 5) {
  try {
    const addContexts = await addBalanceManager.getAllContexts({ gift_card_id: giftCardId });
    const useContexts = await useBalanceManager.getAllContexts({ gift_card_id: giftCardId });
    
    const allAmounts = [
      ...addContexts.map(c => ({ amount: c.amount, timestamp: c.timestamp, type: 'add' })),
      ...useContexts.map(c => ({ amount: c.amount, timestamp: c.timestamp, type: 'use' }))
    ];
    
    // Sort by timestamp, most recent first
    allAmounts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Get unique amounts
    const uniqueAmounts = [];
    const seen = new Set();
    
    for (const item of allAmounts) {
      if (!seen.has(item.amount) && item.amount > 0) {
        uniqueAmounts.push(item.amount);
        seen.add(item.amount);
      }
      if (uniqueAmounts.length >= limit) break;
    }
    
    return uniqueAmounts;
  } catch (error) {
    console.error('❌ Failed to get recent gift card amounts:', error);
    return [];
  }
}
