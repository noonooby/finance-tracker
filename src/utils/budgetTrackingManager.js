import { supabase } from './supabase';

/**
 * Budget Tracking Manager
 * Handles historical budget tracking for trend analysis
 */

/**
 * Save a budget period with actual spending data
 * @param {Object} budgetData - Budget period data
 * @param {string} budgetData.category_id - Category ID (or null for overall budget)
 * @param {string} budgetData.period_type - 'weekly' | 'monthly' | 'quarterly' | 'yearly'
 * @param {string} budgetData.period_start - Start date (YYYY-MM-DD)
 * @param {string} budgetData.period_end - End date (YYYY-MM-DD)
 * @param {number} budgetData.budget_limit - Budget limit amount
 * @param {number} budgetData.actual_spent - Actual amount spent
 * @param {number} budgetData.percentage_used - Percentage of budget used
 * @param {boolean} budgetData.exceeded - Whether budget was exceeded
 * @param {number} budgetData.days_remaining - Days remaining in period (optional)
 * @param {number} budgetData.projected_total - Projected total spend (optional)
 * @param {string} budgetData.notes - Additional notes (optional)
 */
export async function saveBudgetPeriod(budgetData) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const {
      category_id,
      period_type = 'monthly',
      period_start,
      period_end,
      budget_limit,
      actual_spent,
      percentage_used,
      exceeded,
      days_remaining = null,
      projected_total = null,
      notes = null
    } = budgetData;

    // Validate required fields
    if (!period_start || !period_end || budget_limit === undefined || actual_spent === undefined) {
      throw new Error('Missing required fields: period_start, period_end, budget_limit, actual_spent');
    }

    const { data, error } = await supabase
      .from('budget_tracking')
      .insert({
        user_id: user.id,
        category_id: category_id || null,
        period_type,
        period_start,
        period_end,
        budget_limit,
        actual_spent,
        percentage_used: percentage_used ?? ((actual_spent / budget_limit) * 100),
        exceeded: exceeded ?? (actual_spent > budget_limit),
        days_remaining,
        projected_total,
        notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Budget period saved:', data);
    return data;
  } catch (error) {
    console.error('❌ Error saving budget period:', error);
    throw error;
  }
}

/**
 * Update an existing budget period
 * @param {string} periodId - Budget period ID
 * @param {Object} updates - Fields to update
 */
export async function updateBudgetPeriod(periodId, updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('budget_tracking')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', periodId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Budget period updated:', data);
    return data;
  } catch (error) {
    console.error('❌ Error updating budget period:', error);
    throw error;
  }
}

/**
 * Get all budget tracking records
 * @param {Object} filters - Optional filters
 * @param {string} filters.category_id - Filter by category
 * @param {string} filters.period_type - Filter by period type
 * @param {string} filters.start_date - Filter by start date (after this date)
 * @param {string} filters.end_date - Filter by end date (before this date)
 */
export async function getBudgetHistory(filters = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
      .from('budget_tracking')
      .select('*')
      .eq('user_id', user.id)
      .order('period_start', { ascending: false });

    // Apply filters
    if (filters.category_id) {
      query = query.eq('category_id', filters.category_id);
    }
    if (filters.period_type) {
      query = query.eq('period_type', filters.period_type);
    }
    if (filters.start_date) {
      query = query.gte('period_start', filters.start_date);
    }
    if (filters.end_date) {
      query = query.lte('period_end', filters.end_date);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching budget history:', error);
    throw error;
  }
}

/**
 * Get budget tracking for a specific period
 * @param {string} categoryId - Category ID (or null for overall)
 * @param {string} periodStart - Period start date
 * @param {string} periodEnd - Period end date
 */
export async function getBudgetPeriod(categoryId, periodStart, periodEnd) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
      .from('budget_tracking')
      .select('*')
      .eq('user_id', user.id)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    } else {
      query = query.is('category_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('❌ Error fetching budget period:', error);
    throw error;
  }
}

/**
 * Calculate actual spending for a category in a date range
 * @param {string} categoryId - Category ID (or null for all expenses)
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 */
export async function calculateActualSpending(categoryId, startDate, endDate) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .eq('status', 'active')
      .gte('date', startDate)
      .lte('date', endDate);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const total = (data || []).reduce((sum, transaction) => {
      return sum + (parseFloat(transaction.amount) || 0);
    }, 0);

    return total;
  } catch (error) {
    console.error('❌ Error calculating spending:', error);
    throw error;
  }
}

/**
 * Track current month's budget automatically
 * Call this when budget changes or at month end
 * @param {string} categoryId - Category ID
 * @param {number} budgetLimit - Budget limit
 */
export async function trackCurrentMonth(categoryId, budgetLimit) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    
    // Get first and last day of current month
    const periodStart = new Date(year, month, 1).toISOString().split('T')[0];
    const periodEnd = new Date(year, month + 1, 0).toISOString().split('T')[0];
    
    // Calculate actual spending
    const actualSpent = await calculateActualSpending(categoryId, periodStart, periodEnd);
    
    // Calculate percentage and check if exceeded
    const percentageUsed = (actualSpent / budgetLimit) * 100;
    const exceeded = actualSpent > budgetLimit;
    
    // Calculate days remaining in month
    const lastDay = new Date(year, month + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = lastDay - currentDay;
    
    // Calculate projected total (simple linear projection)
    const daysElapsed = currentDay;
    const projectedTotal = daysElapsed > 0 
      ? (actualSpent / daysElapsed) * lastDay 
      : actualSpent;
    
    // Check if period already exists
    const existing = await getBudgetPeriod(categoryId, periodStart, periodEnd);
    
    if (existing) {
      // Update existing period
      return await updateBudgetPeriod(existing.id, {
        budget_limit: budgetLimit,
        actual_spent: actualSpent,
        percentage_used: percentageUsed,
        exceeded,
        days_remaining: daysRemaining,
        projected_total: projectedTotal
      });
    } else {
      // Create new period
      return await saveBudgetPeriod({
        category_id: categoryId,
        period_type: 'monthly',
        period_start: periodStart,
        period_end: periodEnd,
        budget_limit: budgetLimit,
        actual_spent: actualSpent,
        percentage_used: percentageUsed,
        exceeded,
        days_remaining: daysRemaining,
        projected_total: projectedTotal
      });
    }
  } catch (error) {
    console.error('❌ Error tracking current month:', error);
    throw error;
  }
}

/**
 * Track previous month's final budget
 * Call this at the start of a new month to finalize previous month
 * @param {string} categoryId - Category ID
 * @param {number} budgetLimit - Budget limit
 */
export async function trackPreviousMonth(categoryId, budgetLimit) {
  try {
    const now = new Date();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    
    const periodStart = new Date(year, month, 1).toISOString().split('T')[0];
    const periodEnd = new Date(year, month + 1, 0).toISOString().split('T')[0];
    
    // Check if already tracked
    const existing = await getBudgetPeriod(categoryId, periodStart, periodEnd);
    if (existing) {
      console.log('Previous month already tracked');
      return existing;
    }
    
    const actualSpent = await calculateActualSpending(categoryId, periodStart, periodEnd);
    const percentageUsed = (actualSpent / budgetLimit) * 100;
    const exceeded = actualSpent > budgetLimit;
    
    return await saveBudgetPeriod({
      category_id: categoryId,
      period_type: 'monthly',
      period_start: periodStart,
      period_end: periodEnd,
      budget_limit: budgetLimit,
      actual_spent: actualSpent,
      percentage_used: percentageUsed,
      exceeded,
      days_remaining: 0,
      notes: 'Final monthly budget'
    });
  } catch (error) {
    console.error('❌ Error tracking previous month:', error);
    throw error;
  }
}

/**
 * Get budget summary statistics
 * @param {string} categoryId - Category ID (or null for overall)
 * @param {number} numberOfMonths - Number of recent months to analyze
 */
export async function getBudgetSummary(categoryId, numberOfMonths = 6) {
  try {
    const history = await getBudgetHistory({
      category_id: categoryId,
      period_type: 'monthly'
    });

    const recentHistory = history.slice(0, numberOfMonths);

    if (recentHistory.length === 0) {
      return {
        averageSpent: 0,
        averageBudget: 0,
        monthsOverBudget: 0,
        monthsUnderBudget: 0,
        totalMonths: 0,
        trend: 'neutral'
      };
    }

    const totalSpent = recentHistory.reduce((sum, period) => sum + (parseFloat(period.actual_spent) || 0), 0);
    const totalBudget = recentHistory.reduce((sum, period) => sum + (parseFloat(period.budget_limit) || 0), 0);
    const monthsOver = recentHistory.filter(p => p.exceeded).length;
    const monthsUnder = recentHistory.filter(p => !p.exceeded).length;

    const averageSpent = totalSpent / recentHistory.length;
    const averageBudget = totalBudget / recentHistory.length;

    // Determine trend (comparing first half vs second half)
    const halfPoint = Math.floor(recentHistory.length / 2);
    const recentHalf = recentHistory.slice(0, halfPoint);
    const olderHalf = recentHistory.slice(halfPoint);

    const recentAvg = recentHalf.reduce((sum, p) => sum + (parseFloat(p.actual_spent) || 0), 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((sum, p) => sum + (parseFloat(p.actual_spent) || 0), 0) / olderHalf.length;

    let trend = 'neutral';
    if (recentAvg > olderAvg * 1.1) trend = 'increasing';
    else if (recentAvg < olderAvg * 0.9) trend = 'decreasing';

    return {
      averageSpent,
      averageBudget,
      monthsOverBudget: monthsOver,
      monthsUnderBudget: monthsUnder,
      totalMonths: recentHistory.length,
      trend,
      history: recentHistory
    };
  } catch (error) {
    console.error('❌ Error getting budget summary:', error);
    throw error;
  }
}

/**
 * Delete a budget period
 * @param {string} periodId - Budget period ID
 */
export async function deleteBudgetPeriod(periodId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('budget_tracking')
      .delete()
      .eq('id', periodId)
      .eq('user_id', user.id);

    if (error) throw error;

    console.log('✅ Budget period deleted');
  } catch (error) {
    console.error('❌ Error deleting budget period:', error);
    throw error;
  }
}

/**
 * Get budget status for current month
 * Returns current spending vs budget with alerts
 * @param {string} categoryId - Category ID
 * @param {number} budgetLimit - Budget limit
 */
export async function getCurrentBudgetStatus(categoryId, budgetLimit) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const periodStart = new Date(year, month, 1).toISOString().split('T')[0];
    const periodEnd = new Date(year, month + 1, 0).toISOString().split('T')[0];
    
    const actualSpent = await calculateActualSpending(categoryId, periodStart, periodEnd);
    const percentageUsed = (actualSpent / budgetLimit) * 100;
    const exceeded = actualSpent > budgetLimit;
    const remaining = budgetLimit - actualSpent;
    
    // Calculate days
    const lastDay = new Date(year, month + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = lastDay - currentDay;
    const daysElapsed = currentDay;
    
    // Calculate projection
    const projectedTotal = daysElapsed > 0 
      ? (actualSpent / daysElapsed) * lastDay 
      : actualSpent;
    
    // Determine alert level
    let alertLevel = 'safe'; // 'safe' | 'warning' | 'danger' | 'exceeded'
    if (exceeded) {
      alertLevel = 'exceeded';
    } else if (percentageUsed >= 100) {
      alertLevel = 'exceeded';
    } else if (percentageUsed >= 90) {
      alertLevel = 'danger';
    } else if (percentageUsed >= 80) {
      alertLevel = 'warning';
    }
    
    return {
      categoryId,
      budgetLimit,
      actualSpent,
      percentageUsed,
      exceeded,
      remaining,
      daysRemaining,
      daysElapsed,
      projectedTotal,
      willExceed: projectedTotal > budgetLimit,
      alertLevel,
      periodStart,
      periodEnd
    };
  } catch (error) {
    console.error('❌ Error getting current budget status:', error);
    throw error;
  }
}

/**
 * Track all category budgets for the current month
 * @param {Object} categoryBudgets - Object mapping category IDs to budget amounts
 */
export async function trackAllCategoryBudgets(categoryBudgets) {
  try {
    const results = [];
    
    for (const [categoryId, budgetLimit] of Object.entries(categoryBudgets)) {
      if (budgetLimit && budgetLimit > 0) {
        try {
          const result = await trackCurrentMonth(categoryId, budgetLimit);
          results.push({ categoryId, success: true, data: result });
        } catch (error) {
          console.error(`Failed to track budget for category ${categoryId}:`, error);
          results.push({ categoryId, success: false, error: error.message });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('❌ Error tracking all category budgets:', error);
    throw error;
  }
}

/**
 * Get budget comparison data for charts
 * Returns data suitable for Recharts
 * @param {string} categoryId - Category ID
 * @param {number} months - Number of months to include
 */
export async function getBudgetChartData(categoryId, months = 6) {
  try {
    const history = await getBudgetHistory({
      category_id: categoryId,
      period_type: 'monthly'
    });

    const recentHistory = history.slice(0, months).reverse(); // Oldest to newest for chart

    return recentHistory.map(period => ({
      month: new Date(period.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      budget: parseFloat(period.budget_limit) || 0,
      spent: parseFloat(period.actual_spent) || 0,
      exceeded: period.exceeded,
      percentage: parseFloat(period.percentage_used) || 0
    }));
  } catch (error) {
    console.error('❌ Error getting budget chart data:', error);
    throw error;
  }
}

/**
 * Check if it's time to finalize previous month
 * Call this on app load to ensure previous month is tracked
 */
export async function checkAndFinalizePreviousMonths(categoryBudgets) {
  try {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Only run on the first 3 days of the month
    if (now.getDate() > 3) return;
    
    const results = [];
    
    for (const [categoryId, budgetLimit] of Object.entries(categoryBudgets)) {
      if (budgetLimit && budgetLimit > 0) {
        try {
          const result = await trackPreviousMonth(categoryId, budgetLimit);
          results.push({ categoryId, success: true, data: result });
        } catch (error) {
          console.error(`Failed to finalize budget for category ${categoryId}:`, error);
          results.push({ categoryId, success: false, error: error.message });
        }
      }
    }
    
    console.log('✅ Previous month finalization check complete');
    return results;
  } catch (error) {
    console.error('❌ Error finalizing previous months:', error);
    throw error;
  }
}
