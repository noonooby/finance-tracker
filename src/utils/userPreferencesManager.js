import { supabase } from './supabase';

/**
 * User Preferences Manager
 * Handles dashboard customization, recent items, favorites, and Settings UI state
 */

/**
 * Get user preferences (creates default if doesn't exist)
 */
export async function getUserPreferences() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;

    // Return existing preferences or defaults
    if (data) {
      return {
        ...getDefaultPreferences(),
        ...data
      };
    }

    // Create default preferences for new user
    return await createDefaultPreferences();
  } catch (error) {
    console.error('Error getting user preferences:', error);
    return getDefaultPreferences();
  }
}

/**
 * Default preferences structure
 */
function getDefaultPreferences() {
  return {
    // Dashboard customization
    dashboard_layout: 'grid',
    dashboard_compact_mode: false,
    visible_dashboard_widgets: [
      'cash_balance',
      'upcoming_obligations',
      'next_income',
      'recent_activity',
      'debt_summary'
    ],
    collapsed_dashboard_sections: [],
    dashboard_widget_order: [],
    
    // Settings page UI state
    collapsed_settings_sections: [],
    
    // Recent items (for quick access)
    recent_transactions: [],
    recent_categories: [],
    recent_payment_methods: [],
    
    // Favorites/Pinned items
    favorite_categories: [],
    pinned_credit_cards: [],
    pinned_loans: [],
    pinned_bank_accounts: [],
    
    // Activity feed preferences
    activity_show_edits: true,
    activity_show_deletions: true,
    activity_show_additions: true,
    activity_show_system: false,
    activities_per_page: 25
  };
}

/**
 * Create default preferences for a new user
 */
async function createDefaultPreferences() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const defaults = getDefaultPreferences();
    
    const { data, error } = await supabase
      .from('user_preferences')
      .insert({
        user_id: user.id,
        ...defaults,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating default preferences:', error);
    return getDefaultPreferences();
  }
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if preferences exist
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    // Remove fields that shouldn't be updated
    delete updateData.user_id;
    delete updateData.created_at;

    if (existing) {
      // Update existing preferences
      const { data, error } = await supabase
        .from('user_preferences')
        .update(updateData)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Insert new preferences
      const { data, error } = await supabase
        .from('user_preferences')
        .insert({
          user_id: user.id,
          ...updateData
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('Error updating user preferences:', error);
    throw error;
  }
}

/**
 * Update dashboard widget visibility
 */
export async function updateDashboardWidgets(visibleWidgets) {
  return await updateUserPreferences({
    visible_dashboard_widgets: visibleWidgets
  });
}

/**
 * Update collapsed dashboard sections
 */
export async function updateCollapsedSections(collapsedSections) {
  return await updateUserPreferences({
    collapsed_dashboard_sections: collapsedSections
  });
}

/**
 * Toggle a dashboard section collapse state
 */
export async function toggleDashboardSection(sectionId) {
  try {
    const prefs = await getUserPreferences();
    const collapsed = prefs.collapsed_dashboard_sections || [];
    
    const newCollapsed = collapsed.includes(sectionId)
      ? collapsed.filter(id => id !== sectionId)
      : [...collapsed, sectionId];
    
    return await updateCollapsedSections(newCollapsed);
  } catch (error) {
    console.error('Error toggling dashboard section:', error);
    throw error;
  }
}

/**
 * Update collapsed Settings sections
 */
export async function updateCollapsedSettingsSections(collapsedSections) {
  return await updateUserPreferences({
    collapsed_settings_sections: collapsedSections
  });
}

/**
 * Toggle a Settings section collapse state
 */
export async function toggleSettingsSection(sectionId) {
  try {
    const prefs = await getUserPreferences();
    const collapsed = prefs.collapsed_settings_sections || [];
    
    const newCollapsed = collapsed.includes(sectionId)
      ? collapsed.filter(id => id !== sectionId)
      : [...collapsed, sectionId];
    
    return await updateCollapsedSettingsSections(newCollapsed);
  } catch (error) {
    console.error('Error toggling settings section:', error);
    throw error;
  }
}

/**
 * Update dashboard layout mode
 */
export async function updateDashboardLayout(layout) {
  return await updateUserPreferences({
    dashboard_layout: layout
  });
}

/**
 * Toggle dashboard compact mode
 */
export async function toggleCompactMode(enabled) {
  return await updateUserPreferences({
    dashboard_compact_mode: enabled
  });
}

/**
 * Add item to recent transactions (max 10)
 */
export async function addRecentTransaction(transactionId) {
  try {
    const prefs = await getUserPreferences();
    const recent = prefs.recent_transactions || [];
    
    // Remove if already exists, add to front
    const newRecent = [
      transactionId,
      ...recent.filter(id => id !== transactionId)
    ].slice(0, 10);
    
    return await updateUserPreferences({
      recent_transactions: newRecent
    });
  } catch (error) {
    console.error('Error adding recent transaction:', error);
  }
}

/**
 * Add category to recent categories (max 10)
 */
export async function addRecentCategory(categoryId) {
  try {
    const prefs = await getUserPreferences();
    const recent = prefs.recent_categories || [];
    
    const newRecent = [
      categoryId,
      ...recent.filter(id => id !== categoryId)
    ].slice(0, 10);
    
    return await updateUserPreferences({
      recent_categories: newRecent
    });
  } catch (error) {
    console.error('Error adding recent category:', error);
  }
}

/**
 * Add payment method to recent payment methods (max 10)
 * Payment method is stored as "type:id" (e.g., "credit_card:123", "bank_account:456", "cash_in_hand")
 */
export async function addRecentPaymentMethod(paymentMethodString) {
  try {
    const prefs = await getUserPreferences();
    const recent = prefs.recent_payment_methods || [];
    
    // Remove if already exists, add to front
    const newRecent = [
      paymentMethodString,
      ...recent.filter(pm => pm !== paymentMethodString)
    ].slice(0, 10);
    
    return await updateUserPreferences({
      recent_payment_methods: newRecent
    });
  } catch (error) {
    console.error('Error adding recent payment method:', error);
  }
}

/**
 * Toggle favorite category
 */
export async function toggleFavoriteCategory(categoryId) {
  try {
    const prefs = await getUserPreferences();
    const favorites = prefs.favorite_categories || [];
    
    const newFavorites = favorites.includes(categoryId)
      ? favorites.filter(id => id !== categoryId)
      : [...favorites, categoryId];
    
    return await updateUserPreferences({
      favorite_categories: newFavorites
    });
  } catch (error) {
    console.error('Error toggling favorite category:', error);
    throw error;
  }
}

/**
 * Toggle pinned credit card
 */
export async function togglePinnedCreditCard(cardId) {
  try {
    const prefs = await getUserPreferences();
    const pinned = prefs.pinned_credit_cards || [];
    
    const newPinned = pinned.includes(cardId)
      ? pinned.filter(id => id !== cardId)
      : [...pinned, cardId];
    
    return await updateUserPreferences({
      pinned_credit_cards: newPinned
    });
  } catch (error) {
    console.error('Error toggling pinned credit card:', error);
    throw error;
  }
}

/**
 * Toggle pinned loan
 */
export async function togglePinnedLoan(loanId) {
  try {
    const prefs = await getUserPreferences();
    const pinned = prefs.pinned_loans || [];
    
    const newPinned = pinned.includes(loanId)
      ? pinned.filter(id => id !== loanId)
      : [...pinned, loanId];
    
    return await updateUserPreferences({
      pinned_loans: newPinned
    });
  } catch (error) {
    console.error('Error toggling pinned loan:', error);
    throw error;
  }
}

/**
 * Toggle pinned bank account
 */
export async function togglePinnedBankAccount(accountId) {
  try {
    const prefs = await getUserPreferences();
    const pinned = prefs.pinned_bank_accounts || [];
    
    const newPinned = pinned.includes(accountId)
      ? pinned.filter(id => id !== accountId)
      : [...pinned, accountId];
    
    return await updateUserPreferences({
      pinned_bank_accounts: newPinned
    });
  } catch (error) {
    console.error('Error toggling pinned bank account:', error);
    throw error;
  }
}

/**
 * Update activity feed preferences
 */
export async function updateActivityPreferences(preferences) {
  return await updateUserPreferences({
    activity_show_edits: preferences.showEdits,
    activity_show_deletions: preferences.showDeletions,
    activity_show_additions: preferences.showAdditions,
    activity_show_system: preferences.showSystem,
    activities_per_page: preferences.perPage
  });
}

/**
 * Get dashboard widget configuration
 */
export async function getDashboardConfig() {
  try {
    const prefs = await getUserPreferences();
    
    return {
      layout: prefs.dashboard_layout || 'grid',
      compactMode: prefs.dashboard_compact_mode || false,
      visibleWidgets: prefs.visible_dashboard_widgets || [],
      collapsedSections: prefs.collapsed_dashboard_sections || [],
      widgetOrder: prefs.dashboard_widget_order || []
    };
  } catch (error) {
    console.error('Error getting dashboard config:', error);
    return {
      layout: 'grid',
      compactMode: false,
      visibleWidgets: [
        'cash_balance',
        'upcoming_obligations',
        'next_income',
        'recent_activity',
        'debt_summary'
      ],
      collapsedSections: [],
      widgetOrder: []
    };
  }
}

/**
 * Update recent transactions display settings for entity type
 */
export async function updateRecentTransactionsSettings(entityType, settings) {
  try {
    const settingsKey = `recent_transactions_${entityType}`;
    return await updateUserPreferences({
      [settingsKey]: settings
    });
  } catch (error) {
    console.error('Error updating recent transactions settings:', error);
    throw error;
  }
}

/**
 * Reset preferences to defaults
 */
export async function resetPreferences() {
  try {
    const defaults = getDefaultPreferences();
    return await updateUserPreferences(defaults);
  } catch (error) {
    console.error('Error resetting preferences:', error);
    throw error;
  }
}
