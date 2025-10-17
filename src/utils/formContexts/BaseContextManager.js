import { supabase } from '../supabase';

export class BaseContextManager {
  constructor(tableName, triggerColumn) {
    if (!tableName || !triggerColumn) {
      throw new Error('BaseContextManager requires tableName and triggerColumn');
    }
    this.tableName = tableName;
    this.triggerColumn = triggerColumn;
  }

  async getContext(triggerValue) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (!triggerValue) return null;

      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', user.id)
        .eq(this.triggerColumn, triggerValue)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error getting context from ${this.tableName}:`, error);
      return null;
    }
  }

  async saveContext(triggerValue, contextData) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (!triggerValue) throw new Error('Trigger value is required');

      const existing = await this.getContext(triggerValue);
      const timestamp = new Date().toISOString();

      if (existing) {
        const { data, error } = await supabase
          .from(this.tableName)
          .update({
            ...contextData,
            usage_count: (existing.usage_count || 0) + 1,
            last_used_at: timestamp,
            updated_at: timestamp
          })
          .eq('user_id', user.id)
          .eq(this.triggerColumn, triggerValue)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from(this.tableName)
          .insert({
            user_id: user.id,
            [this.triggerColumn]: triggerValue,
            ...contextData,
            usage_count: 1,
            last_used_at: timestamp,
            created_at: timestamp,
            updated_at: timestamp
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error(`Error saving context to ${this.tableName}:`, error);
      throw error;
    }
  }

  async getRecentTriggers(limit = 5) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', user.id)
        .order('last_used_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error getting recent triggers from ${this.tableName}:`, error);
      return [];
    }
  }

  async getMostRecentContext() {
    try {
      const recent = await this.getRecentTriggers(1);
      return recent.length > 0 ? recent[0] : null;
    } catch (error) {
      console.error(`Error getting most recent context:`, error);
      return null;
    }
  }

  async deleteContext(triggerValue) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('user_id', user.id)
        .eq(this.triggerColumn, triggerValue);

      if (error) throw error;
    } catch (error) {
      console.error(`Error deleting context from ${this.tableName}:`, error);
      throw error;
    }
  }

  async getAllContexts() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', user.id)
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error getting all contexts from ${this.tableName}:`, error);
      return [];
    }
  }
}
