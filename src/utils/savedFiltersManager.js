import { supabase } from './supabase';

/**
 * Saved Filters Manager
 * Handles saving, loading, and managing filter presets
 */

/**
 * Get all saved filters for the current user
 */
export async function getAllSavedFilters(filterType = 'transaction') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('saved_filters')
      .select('*')
      .eq('user_id', user.id)
      .eq('filter_type', filterType)
      .order('use_count', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting saved filters:', error);
    return [];
  }
}

/**
 * Get a single saved filter by ID
 */
export async function getSavedFilter(filterId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('saved_filters')
      .select('*')
      .eq('id', filterId)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting saved filter:', error);
    return null;
  }
}

/**
 * Get pinned filters
 */
export async function getPinnedFilters(filterType = 'transaction') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('saved_filters')
      .select('*')
      .eq('user_id', user.id)
      .eq('filter_type', filterType)
      .eq('is_pinned', true)
      .order('use_count', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting pinned filters:', error);
    return [];
  }
}

/**
 * Save a new filter preset
 */
export async function saveFilter(filterData) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Validate required fields
    if (!filterData.name || !filterData.filters) {
      throw new Error('Filter name and filters are required');
    }

    // Check if filter with same name exists
    const { data: existing } = await supabase
      .from('saved_filters')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', filterData.name)
      .eq('filter_type', filterData.filter_type || 'transaction')
      .maybeSingle();

    if (existing) {
      throw new Error('A filter with this name already exists');
    }

    const insertData = {
      user_id: user.id,
      name: filterData.name.trim(),
      filter_type: filterData.filter_type || 'transaction',
      filters: filterData.filters,
      is_pinned: filterData.is_pinned || false,
      use_count: 0,
      last_used: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('saved_filters')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;


    return data;
  } catch (error) {
    console.error('Error saving filter:', error);
    throw error;
  }
}

/**
 * Update an existing filter
 */
export async function updateSavedFilter(filterId, updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.user_id;
    delete updateData.created_at;
    delete updateData.use_count;
    delete updateData.last_used;

    const { data, error } = await supabase
      .from('saved_filters')
      .update(updateData)
      .eq('id', filterId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;


    return data;
  } catch (error) {
    console.error('Error updating filter:', error);
    throw error;
  }
}

/**
 * Delete a saved filter
 */
export async function deleteSavedFilter(filterId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('saved_filters')
      .delete()
      .eq('id', filterId)
      .eq('user_id', user.id);

    if (error) throw error;


    return true;
  } catch (error) {
    console.error('Error deleting filter:', error);
    throw error;
  }
}

/**
 * Toggle pin status
 */
export async function toggleFilterPin(filterId, isPinned) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('saved_filters')
      .update({ 
        is_pinned: isPinned,
        updated_at: new Date().toISOString()
      })
      .eq('id', filterId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;


    return data;
  } catch (error) {
    console.error('Error toggling filter pin:', error);
    throw error;
  }
}

/**
 * Track filter usage (increment use_count and update last_used)
 */
export async function trackFilterUsage(filterId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get current use_count
    const { data: current } = await supabase
      .from('saved_filters')
      .select('use_count')
      .eq('id', filterId)
      .eq('user_id', user.id)
      .single();

    const newCount = (current?.use_count || 0) + 1;

    const { data, error } = await supabase
      .from('saved_filters')
      .update({ 
        use_count: newCount,
        last_used: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', filterId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;


    return data;
  } catch (error) {
    console.error('Error tracking filter usage:', error);
    // Don't throw - usage tracking shouldn't break the app
    return null;
  }
}

/**
 * Duplicate a filter
 */
export async function duplicateFilter(filterId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get the original filter
    const original = await getSavedFilter(filterId);
    if (!original) throw new Error('Filter not found');

    // Create a copy with a new name
    let copyName = `${original.name} (Copy)`;
    let counter = 1;

    // Check if copy name exists, increment counter if needed
    while (true) {
      const { data: existing } = await supabase
        .from('saved_filters')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', copyName)
        .eq('filter_type', original.filter_type)
        .maybeSingle();

      if (!existing) break;
      counter++;
      copyName = `${original.name} (Copy ${counter})`;
    }

    const duplicateData = {
      name: copyName,
      filter_type: original.filter_type,
      filters: original.filters,
      is_pinned: false
    };

    return await saveFilter(duplicateData);
  } catch (error) {
    console.error('Error duplicating filter:', error);
    throw error;
  }
}

/**
 * Get filter statistics
 */
export async function getFilterStats(filterType = 'transaction') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('saved_filters')
      .select('is_pinned, use_count, name')
      .eq('user_id', user.id)
      .eq('filter_type', filterType);

    if (error) throw error;

    const stats = {
      total: data.length,
      pinned: data.filter(f => f.is_pinned).length,
      totalUses: 0,
      mostUsed: null
    };

    // Calculate total uses
    data.forEach(filter => {
      stats.totalUses += filter.use_count || 0;
    });

    // Find most used
    if (data.length > 0) {
      stats.mostUsed = data.reduce((prev, current) => 
        (current.use_count || 0) > (prev.use_count || 0) ? current : prev
      );
    }

    return stats;
  } catch (error) {
    console.error('Error getting filter stats:', error);
    return {
      total: 0,
      pinned: 0,
      totalUses: 0,
      mostUsed: null
    };
  }
}

/**
 * Check if current filters match a saved filter
 */
export function findMatchingFilter(currentFilters, savedFilters) {
  if (!savedFilters || savedFilters.length === 0) return null;
  
  // Create normalized version of current filters for comparison
  const normalizedCurrent = JSON.stringify(currentFilters);
  
  return savedFilters.find(saved => {
    const normalizedSaved = JSON.stringify(saved.filters);
    return normalizedCurrent === normalizedSaved;
  });
}

/**
 * Get quick filter suggestions based on usage
 */
export async function getQuickFilterSuggestions(filterType = 'transaction', limit = 5) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get most used filters (pinned first, then by use count)
    const { data: pinned, error: pinnedError } = await supabase
      .from('saved_filters')
      .select('*')
      .eq('user_id', user.id)
      .eq('filter_type', filterType)
      .eq('is_pinned', true)
      .order('use_count', { ascending: false });

    if (pinnedError) throw pinnedError;

    const { data: frequent, error: frequentError } = await supabase
      .from('saved_filters')
      .select('*')
      .eq('user_id', user.id)
      .eq('filter_type', filterType)
      .eq('is_pinned', false)
      .order('use_count', { ascending: false })
      .limit(limit);

    if (frequentError) throw frequentError;

    // Combine pinned and frequent, remove duplicates
    const suggestions = [...(pinned || []), ...(frequent || [])]
      .filter((filter, index, self) => 
        index === self.findIndex(f => f.id === filter.id)
      )
      .slice(0, limit);

    return suggestions;
  } catch (error) {
    console.error('Error getting filter suggestions:', error);
    return [];
  }
}
