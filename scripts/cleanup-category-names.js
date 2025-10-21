/**
 * ONE-TIME CLEANUP SCRIPT
 * Run this in browser console to clean category names
 * 
 * This will:
 * 1. Remove all emojis from category names
 * 2. Remove duplicate words (e.g., "Coffee ☕ Coffee" -> "Coffee")
 * 3. Update transaction cache with clean names
 */

async function cleanupCategoryNames() {
  console.log('🧹 Starting category cleanup...');
  
  try {
    // Import Supabase
    const { supabase } = await import('./src/utils/supabase.js');
    
    // Get all categories
    const { data: categories, error: fetchError } = await supabase
      .from('categories')
      .select('*');
    
    if (fetchError) throw fetchError;
    
    console.log(`📊 Found ${categories.length} categories`);
    
    let updatedCount = 0;
    
    for (const category of categories) {
      const originalName = category.name;
      
      // Remove emojis
      let cleaned = originalName.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
      
      // Remove duplicate words
      const words = cleaned.split(/\s+/);
      if (words.length >= 2) {
        if (words[0].toLowerCase() === words[words.length - 1].toLowerCase()) {
          cleaned = words.slice(0, -1).join(' ').trim();
        }
      }
      
      // Clean up multiple spaces
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      
      // Update if changed
      if (cleaned !== originalName) {
        console.log(`✏️  "${originalName}" -> "${cleaned}"`);
        
        const { error: updateError } = await supabase
          .from('categories')
          .update({ name: cleaned })
          .eq('id', category.id);
        
        if (updateError) {
          console.error(`❌ Failed to update ${originalName}:`, updateError);
        } else {
          updatedCount++;
        }
      }
    }
    
    console.log(`✅ Updated ${updatedCount} categories`);
    
    // Now update transaction category_name cache
    console.log('🔄 Updating transaction cache...');
    
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, category_id');
    
    if (txError) throw txError;
    
    let txUpdated = 0;
    
    for (const tx of transactions) {
      if (tx.category_id) {
        const category = categories.find(c => c.id === tx.category_id);
        if (category) {
          // Get cleaned name
          let cleaned = category.name.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
          const words = cleaned.split(/\s+/);
          if (words.length >= 2 && words[0].toLowerCase() === words[words.length - 1].toLowerCase()) {
            cleaned = words.slice(0, -1).join(' ').trim();
          }
          cleaned = cleaned.replace(/\s+/g, ' ').trim();
          
          const { error: txUpdateError } = await supabase
            .from('transactions')
            .update({ category_name: cleaned })
            .eq('id', tx.id);
          
          if (!txUpdateError) txUpdated++;
        }
      }
    }
    
    console.log(`✅ Updated ${txUpdated} transaction records`);
    console.log('🎉 Cleanup complete! Refresh the page.');
    
    alert(`✅ Cleanup complete!\n\nUpdated ${updatedCount} categories\nUpdated ${txUpdated} transactions\n\nPlease refresh the page.`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    alert(`❌ Cleanup failed: ${error.message}`);
  }
}

// Run it
cleanupCategoryNames();
