import { server } from './server';

/**
 * Report Templates Manager
 * Handles saving, loading, and managing report template configurations
 */

/**
 * Get all report templates for the current user
 */
export async function getAllReportTemplates() {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('report_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('last_used', { ascending: false, nullsFirst: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting report templates:', error);
    return [];
  }
}

/**
 * Get a single report template by ID
 */
async function getReportTemplate(templateId) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('report_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting report template:', error);
    return null;
  }
}

/**
 * Save a new report template
 */
export async function saveReportTemplate(templateData) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Validate required fields
    if (!templateData.name || !templateData.template_type) {
      throw new Error('Template name and type are required');
    }

    // Check if template with same name exists
    const { data: existing } = await server
      .from('report_templates')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', templateData.name)
      .maybeSingle();

    if (existing) {
      throw new Error('A template with this name already exists');
    }

    const insertData = {
      user_id: user.id,
      name: templateData.name,
      description: templateData.description || null,
      template_type: templateData.template_type,
      layout: templateData.layout || {},
      default_filters: templateData.filters || {},
      is_favorite: templateData.is_favorite || false,
      use_count: 0,
      last_used: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await server
      .from('report_templates')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error saving report template:', error);
    throw error;
  }
}

/**
 * Delete a report template
 */
export async function deleteReportTemplate(templateId) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await server
      .from('report_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', user.id);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error('Error deleting report template:', error);
    throw error;
  }
}

/**
 * Toggle favorite status
 */
export async function toggleReportTemplateFavorite(templateId, isFavorite) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await server
      .from('report_templates')
      .update({ 
        is_favorite: isFavorite,
        updated_at: new Date().toISOString()
      })
      .eq('id', templateId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error toggling template favorite:', error);
    throw error;
  }
}

/**
 * Track template usage (increment use_count and update last_used)
 */
export async function trackReportTemplateUsage(templateId) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get current use_count
    const { data: current } = await server
      .from('report_templates')
      .select('use_count')
      .eq('id', templateId)
      .eq('user_id', user.id)
      .single();

    const newCount = (current?.use_count || 0) + 1;

    const { data, error } = await server
      .from('report_templates')
      .update({ 
        use_count: newCount,
        last_used: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', templateId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error tracking template usage:', error);
    // Don't throw - usage tracking shouldn't break the app
    return null;
  }
}

/**
 * Duplicate a template
 */
export async function duplicateReportTemplate(templateId) {
  try {
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get the original template
    const original = await getReportTemplate(templateId);
    if (!original) throw new Error('Template not found');

    // Create a copy with a new name
    let copyName = `${original.name} (Copy)`;
    let counter = 1;

    // Check if copy name exists, increment counter if needed
    while (true) {
      const { data: existing } = await server
        .from('report_templates')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', copyName)
        .maybeSingle();

      if (!existing) break;
      counter++;
      copyName = `${original.name} (Copy ${counter})`;
    }

    const duplicateData = {
      name: copyName,
      description: original.description,
      template_type: original.template_type,
      layout: original.layout,
      filters: original.default_filters,
      is_favorite: false
    };

    return await saveReportTemplate(duplicateData);
  } catch (error) {
    console.error('Error duplicating report template:', error);
    throw error;
  }
}

