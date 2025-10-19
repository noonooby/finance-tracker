import { supabase } from './supabase';

/**
 * Migration utility to convert emoji icons to Lucide icon names
 * This ensures all existing categories display proper Lucide icons
 */

// Mapping of common emoji icons to Lucide icon names
const EMOJI_TO_LUCIDE_MAP = {
  // Finance & Money
  '💰': 'DollarSign',
  '💵': 'Banknote',
  '💳': 'CreditCard',
  '🏦': 'Building2',
  '💼': 'Briefcase',
  '📊': 'BarChart3',
  '📈': 'TrendingUp',
  '📉': 'TrendingDown',
  
  // Shopping & Retail
  '🛒': 'ShoppingCart',
  '🛍️': 'ShoppingBag',
  '🏪': 'Store',
  '🏬': 'Store',
  '🎁': 'Gift',
  '📦': 'Package',
  
  // Food & Dining
  '🍽️': 'Utensils',
  '🍕': 'Pizza',
  '☕': 'Coffee',
  '🍔': 'UtensilsCrossed',
  '🥗': 'Apple',
  '🍜': 'Utensils',
  
  // Transportation
  '🚗': 'Car',
  '🚕': 'Car',
  '🚌': 'Bus',
  '🚇': 'Train',
  '✈️': 'Plane',
  '🚲': 'Bike',
  '⛽': 'Fuel',
  '🅿️': 'ParkingCircle',
  
  // Home & Living
  '🏠': 'Home',
  '🏡': 'Home',
  '🏢': 'Building',
  '🏥': 'Heart',
  '🏫': 'GraduationCap',
  '⚡': 'Zap',
  
  // Utilities
  '💡': 'Lightbulb',
  '💧': 'Droplet',
  '🔥': 'Flame',
  '📱': 'Smartphone',
  '💻': 'Laptop',
  '🖥️': 'Monitor',
  '⌚': 'Watch',
  '📷': 'Camera',
  
  // Entertainment
  '🎮': 'Gamepad2',
  '🎬': 'Film',
  '🎵': 'Music',
  '🎸': 'Music',
  '🎨': 'Palette',
  '📚': 'BookOpen',
  '✏️': 'PenTool',
  '📝': 'FileText',
  
  // Fashion & Beauty
  '👕': 'Shirt',
  '👔': 'Shirt',
  '👗': 'Shirt',
  '👠': 'Shirt',
  '👟': 'Shirt',
  '🎒': 'Backpack',
  '👜': 'ShoppingBag',
  '💄': 'Sparkles',
  
  // Health & Fitness
  '🏋️': 'Dumbbell',
  '⚽': 'Activity',
  '🏀': 'Activity',
  '🎾': 'Activity',
  
  // Pets & Nature
  '🐕': 'Dog',
  '🐈': 'Cat',
  '🐾': 'Footprints',
  '🌳': 'TreePine',
  '🌻': 'Flower',
  '🌺': 'Flower',
  
  // Miscellaneous
  '📮': 'Mail',
  '✉️': 'Mail',
  '📞': 'Phone',
  '☎️': 'Phone',
  '🔧': 'Wrench',
  '🔨': 'Hammer',
  '🔩': 'Wrench',
  '📋': 'Clipboard',
  '📄': 'FileText',
  '🎉': 'PartyPopper',
  '🎊': 'PartyPopper',
  '🎯': 'Target',
  '🏆': 'Trophy',
  '⭐': 'Star',
  '🌟': 'Star',
  '❤️': 'Heart',
  '💙': 'Heart',
  '💚': 'Heart',
  '💛': 'Heart',
  '💜': 'Heart'
};

/**
 * Migrate all categories from emoji icons to Lucide icon names
 * Safe to run multiple times - only updates categories with emoji icons
 */
export async function migrateCategoryIconsToLucide() {
  try {
    console.log('🔄 Starting category icon migration...');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('No user found, skipping migration');
      return { success: false, message: 'Not authenticated' };
    }

    // Get all categories for this user
    const { data: categories, error: fetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id);

    if (fetchError) {
      console.error('Error fetching categories:', fetchError);
      return { success: false, message: fetchError.message };
    }

    if (!categories || categories.length === 0) {
      console.log('No categories to migrate');
      return { success: true, message: 'No categories found', updated: 0 };
    }

    console.log(`Found ${categories.length} categories to check`);

    let updatedCount = 0;
    const updates = [];

    for (const category of categories) {
      const currentIcon = category.icon;
      
      // Check if icon is an emoji (needs migration)
      const isEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(currentIcon);
      
      if (isEmoji) {
        // Map emoji to Lucide icon name
        const lucideIcon = EMOJI_TO_LUCIDE_MAP[currentIcon] || 'Package';
        
        console.log(`  Migrating "${category.name}": ${currentIcon} → ${lucideIcon}`);
        
        updates.push({
          id: category.id,
          icon: lucideIcon
        });
        
        updatedCount++;
      } else if (!currentIcon || currentIcon === '') {
        // Handle empty icons
        console.log(`  Setting default icon for "${category.name}"`);
        updates.push({
          id: category.id,
          icon: 'Package'
        });
        updatedCount++;
      } else {
        // Already a Lucide icon name, skip
        console.log(`  ✓ "${category.name}" already has Lucide icon: ${currentIcon}`);
      }
    }

    // Batch update all categories
    if (updates.length > 0) {
      console.log(`\n📝 Updating ${updates.length} categories...`);
      
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('categories')
          .update({ 
            icon: update.icon,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id)
          .eq('user_id', user.id);

        if (updateError) {
          console.error(`Error updating category ${update.id}:`, updateError);
        }
      }
      
      console.log(`✅ Migration complete! Updated ${updatedCount} categories`);
      return { 
        success: true, 
        message: `Successfully migrated ${updatedCount} categories to Lucide icons`,
        updated: updatedCount 
      };
    } else {
      console.log('✅ All categories already using Lucide icons');
      return { 
        success: true, 
        message: 'All categories already up to date',
        updated: 0 
      };
    }
    
  } catch (error) {
    console.error('Migration error:', error);
    return { 
      success: false, 
      message: error.message,
      updated: 0 
    };
  }
}

/**
 * Check if migration is needed
 * Returns count of categories that need migration
 */
export async function checkMigrationNeeded() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { data: categories } = await supabase
      .from('categories')
      .select('icon')
      .eq('user_id', user.id);

    if (!categories) return 0;

    const needsMigration = categories.filter(cat => {
      const icon = cat.icon;
      return /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(icon) || !icon;
    });

    return needsMigration.length;
  } catch (error) {
    console.error('Error checking migration:', error);
    return 0;
  }
}
