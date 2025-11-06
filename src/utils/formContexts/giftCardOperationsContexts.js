import { BaseContextManager } from './BaseContextManager';

/**
 * Gift Card Add Balance Context Manager
 * Uses gift_card_purchase_contexts table to remember purchase patterns
 */
class GiftCardAddBalanceContextManager extends BaseContextManager {
  constructor() {
    super('gift_card_purchase_contexts', 'card_name');
  }

  extractContext(formData, giftCard) {
    return {
      card_name: giftCard.name,
      original_value: Number(formData.amount) || 0,
      purchase_amount: Number(formData.amount) || 0,
      payment_source: formData.paymentSource,
      payment_source_id: formData.paymentSourceId,
      metadata: {
        category_id: formData.category,
        timestamp: new Date().toISOString()
      }
    };
  }

  applyContext(context) {
    return {
      amount: context.purchase_amount || '',
      paymentSource: context.payment_source || 'cash_in_hand',
      paymentSourceId: context.payment_source_id || null,
      category: context.metadata?.category_id || ''
    };
  }
}

/**
 * Gift Card Use Balance Context Manager  
 * Uses expense_description_contexts to remember usage patterns
 */
class GiftCardUseBalanceContextManager extends BaseContextManager {
  constructor() {
    super('expense_description_contexts', 'description');
  }

  extractContext(formData, giftCard) {
    const description = `${giftCard.name} purchase`;
    return {
      description: description,
      category_id: formData.category,
      payment_method: 'credit_card',
      payment_method_id: giftCard.id,
      metadata: {
        amount: Number(formData.amount) || 0,
        notes: formData.notes || '',
        is_gift_card_usage: true,
        timestamp: new Date().toISOString()
      }
    };
  }

  applyContext(context) {
    return {
      amount: context.metadata?.amount || '',
      category: context.category_id || '',
      notes: context.metadata?.notes || ''
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
    await addBalanceManager.saveContext(giftCard.name, context);
    console.log('✅ Gift card add balance context saved for', giftCard.name);
  } catch (error) {
    console.error('❌ Failed to save gift card add balance context:', error);
  }
}

/**
 * Get gift card add balance context (last used for this card)
 */
export async function getGiftCardAddBalanceContext(giftCardName) {
  try {
    const context = await addBalanceManager.getContext(giftCardName);
    if (context) {
      console.log('✅ Found gift card add balance context for card:', giftCardName);
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
    const description = `${giftCard.name} purchase`;
    await useBalanceManager.saveContext(description, context);
    console.log('✅ Gift card use balance context saved for', giftCard.name);
  } catch (error) {
    console.error('❌ Failed to save gift card use balance context:', error);
  }
}

/**
 * Get gift card use balance context (last used for this card)
 */
export async function getGiftCardUseBalanceContext(giftCardName) {
  try {
    const description = `${giftCardName} purchase`;
    const context = await useBalanceManager.getContext(description);
    if (context) {
      console.log('✅ Found gift card use balance context for card:', giftCardName);
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
export async function getRecentGiftCardAmounts(giftCardName, limit = 5) {
  try {
    const addContexts = await addBalanceManager.getRecentTriggers(limit);
    const useContexts = await useBalanceManager.getRecentTriggers(limit);
    
    const allAmounts = [
      ...addContexts.filter(c => c.card_name === giftCardName).map(c => ({ 
        amount: c.purchase_amount, 
        timestamp: c.last_used_at, 
        type: 'add' 
      })),
      ...useContexts.filter(c => c.description.includes(giftCardName)).map(c => ({ 
        amount: c.metadata?.amount || 0, 
        timestamp: c.last_used_at, 
        type: 'use' 
      }))
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
