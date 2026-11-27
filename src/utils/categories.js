import { server } from './server';
import { DEFAULT_CATEGORIES } from './helpers';

/**
 * Categories Utility
 * Handles category CRUD operations with database
 */

// Fetch all categories for user
export const fetchCategories = async () => {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) {
      console.warn('No user found, returning default categories');
      return DEFAULT_CATEGORIES;
    }

    const { data, error } = await server
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
      return DEFAULT_CATEGORIES;
    }

    return data;
  } catch (error) {
    console.error('Error in fetchCategories:', error);
    return DEFAULT_CATEGORIES;
  }
};

// Add new category
export const addCategory = async (categoryData) => {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('categories')
      .insert({
        id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user_id: user.id,
        name: categoryData.name,
        color: categoryData.color || '#6b7280',
        icon: categoryData.icon || 'Package',
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
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
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
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if it's a system category
    const { data: category } = await server
      .from('categories')
      .select('is_system')
      .eq('id', categoryId)
      .single();

    if (category?.is_system) {
      throw new Error('Cannot delete system categories');
    }

    const { error } = await server
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
    const { data: { user } } = await server.auth.getUser();
    if (!user) return false;

    // Check if user already has categories
    const { data: existing } = await server
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return true;
    }

    // Insert default categories for this user
    const categoriesToInsert = DEFAULT_CATEGORIES.map(cat => ({
      id: `${cat.id}_${user.id.slice(0, 8)}`,
      user_id: user.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon || 'Package',
      is_income: cat.is_income || false,
      is_system: false,
      created_at: new Date().toISOString()
    }));

    const { error } = await server
      .from('categories')
      .insert(categoriesToInsert);

    if (error) {
      console.error('Error seeding categories:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in seedDefaultCategories:', error);
    return false;
  }
};

