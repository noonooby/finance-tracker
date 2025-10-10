import { supabase } from './supabase';

/**
 * Known Entities Utility
 * Handles smart learning system for autocomplete suggestions
 */

// Fetch suggestions for autocomplete
export const fetchSuggestions = async (type, query = '', limit = 10) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let queryBuilder = supabase
      .from('known_entities')
      .select('id, name, usage_count, last_used_at')
      .eq('user_id', user.id)
      .eq('type', type)
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(limit);

    // Add search filter if query provided
    if (query && query.trim()) {
      queryBuilder = queryBuilder.ilike('name', `%${query.trim()}%`);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Error fetching suggestions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchSuggestions:', error);
    return [];
  }
};

// Add or update known entity (increment usage)
export const upsertKnownEntity = async (type, name) => {
  try {
    if (!name || !name.trim()) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const trimmedName = name.trim();

    // Check if exists
    const { data: existing } = await supabase
      .from('known_entities')
      .select('id, usage_count')
      .eq('user_id', user.id)
      .eq('type', type)
      .eq('name', trimmedName)
      .single();

    if (existing) {
      // Update existing - increment usage
      const { data, error } = await supabase
        .from('known_entities')
        .update({
          usage_count: existing.usage_count + 1,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating known entity:', error);
        return null;
      }

      return data;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('known_entities')
        .insert({
          user_id: user.id,
          name: trimmedName,
          type: type,
          usage_count: 1,
          last_used_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting known entity:', error);
        return null;
      }

      return data;
    }
  } catch (error) {
    console.error('Error in upsertKnownEntity:', error);
    return null;
  }
};

// Delete a suggestion
export const deleteKnownEntity = async (id) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('known_entities')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting known entity:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteKnownEntity:', error);
    return false;
  }
};

// Get all suggestions for a type (for management UI)
export const getAllSuggestions = async (type) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('known_entities')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', type)
      .order('usage_count', { ascending: false });

    if (error) {
      console.error('Error getting all suggestions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAllSuggestions:', error);
    return [];
  }
};

// Clear all suggestions for a type
export const clearAllSuggestions = async (type) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('known_entities')
      .delete()
      .eq('user_id', user.id)
      .eq('type', type);

    if (error) {
      console.error('Error clearing suggestions:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in clearAllSuggestions:', error);
    return false;
  }
};

// Batch upsert multiple entities (useful for seeding)
export const batchUpsertKnownEntities = async (entities) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const entitiesToInsert = entities.map(entity => ({
      user_id: user.id,
      name: entity.name,
      type: entity.type,
      usage_count: entity.usage_count || 1,
      last_used_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('known_entities')
      .upsert(entitiesToInsert, {
        onConflict: 'user_id,name,type'
      });

    if (error) {
      console.error('Error batch upserting known entities:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in batchUpsertKnownEntities:', error);
    return false;
  }
};

/**
 * Fetch all known entities for the current user, grouped by type
 * @returns {Promise<Object>} Object with entity types as keys and arrays of entities as values
 */
export const fetchAllKnownEntities = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {};

    const { data, error } = await supabase
      .from('known_entities')
      .select('*')
      .eq('user_id', user.id)
      .order('usage_count', { ascending: false });

    if (error) throw error;

    // Group by type
    const grouped = {};
    (data || []).forEach(entity => {
      if (!grouped[entity.entity_type]) {
        grouped[entity.entity_type] = [];
      }
      grouped[entity.entity_type].push(entity);
    });

    return grouped;
  } catch (error) {
    console.error('Error fetching all known entities:', error);
    return {};
  }
};
