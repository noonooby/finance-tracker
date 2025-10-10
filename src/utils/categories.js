import { supabase } from './supabase';
import { DEFAULT_CATEGORIES } from './helpers';

/**
 * Categories Utility
 * Handles category CRUD operations with database
 */

// Fetch all categories for user
export const fetchCategories = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('No user found, returning default categories');
      return DEFAULT_CATEGORIES;
    }

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},is_system.eq.true`)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching categories:', error);
      return DEFAULT_CATEGORIES;
    }

    // If no categories found, return defaults as fallback
    if (!data || data.length === 0) {
      console.log('No categories in DB, returning defaults');
      return DEFAULT_CATEGORIES;
    }

    return data;
  } catch (error) {
    console.error('Error in fetchCategories:', error);
    return DEFAULT_CATEGORIES;
  }
};

// Fetch categories by type (expense or income)
export const fetchCategoriesByType = async (isIncome = false) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return DEFAULT_CATEGORIES.filter(cat => cat.is_income === isIncome);
    }

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},is_system.eq.true`)
      .eq('is_income', isIncome)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching categories by type:', error);
      return DEFAULT_CATEGORIES.filter(cat => cat.is_income === isIncome);
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchCategoriesByType:', error);
    return DEFAULT_CATEGORIES.filter(cat => cat.is_income === isIncome);
  }
};

// Add new category
export const addCategory = async (categoryData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('categories')
      .insert({
        id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user_id: user.id,
        name: categoryData.name,
        color: categoryData.color || '#6b7280',
        icon: categoryData.icon || '📦',
        is_income: categoryData.is_income || false,
        is_system: false,
        parent_id: categoryData.parent_id || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding category:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in addCategory:', error);
    throw error;
  }
};

// Update category
export const updateCategory = async (categoryId, updates) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('categories')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating category:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in updateCategory:', error);
    throw error;
  }
};

// Delete category
export const deleteCategory = async (categoryId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if it's a system category
    const { data: category } = await supabase
      .from('categories')
      .select('is_system')
      .eq('id', categoryId)
      .single();

    if (category?.is_system) {
      throw new Error('Cannot delete system categories');
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting category:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    throw error;
  }
};

// Seed default categories for new user
export const seedDefaultCategories = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check if user already has categories
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log('User already has categories, skipping seed');
      return true;
    }

    // Insert default categories for this user
    const categoriesToInsert = DEFAULT_CATEGORIES.map(cat => ({
      id: `${cat.id}_${user.id.slice(0, 8)}`,
      user_id: user.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon || '📦',
      is_income: cat.is_income || false,
      is_system: false,
      created_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('categories')
      .insert(categoriesToInsert);

    if (error) {
      console.error('Error seeding categories:', error);
      return false;
    }

    console.log('Successfully seeded default categories');
    return true;
  } catch (error) {
    console.error('Error in seedDefaultCategories:', error);
    return false;
  }
};

// Get category by ID
export const getCategoryById = async (categoryId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', categoryId)
      .single();

    if (error) {
      console.error('Error getting category:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getCategoryById:', error);
    return null;
  }
};
