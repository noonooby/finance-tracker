import { useMemo, useEffect, useState } from 'react';
import { predictNextDate, getDaysUntil } from '../../utils/helpers';
import { getIncomeSchedules } from '../../utils/schedules';

/**
 * Hook for income predictions and due income calculations
 * Now uses income_schedules instead of recurring income records
 */
export const useIncomePredictions = (income = [], predictionCount = 8) => {
  const [schedules, setSchedules] = useState([]);
  
  // Load schedules
  useEffect(() => {
    const loadSchedules = async () => {
      try {
        const data = await getIncomeSchedules();
        setSchedules(data || []);
      } catch (error) {
        console.error('Error loading schedules for predictions:', error);
      }
    };
    loadSchedules();
  }, [income]); // Reload when income changes (new occurrence added)

  const getPredictedIncome = useMemo(() => {
    if (schedules.length === 0) return [];
    
    const activeSchedules = schedules.filter(s => s.is_active);
    if (activeSchedules.length === 0) return [];

    const allPredictions = [];
    activeSchedules.forEach(schedule => {
      let currentDate = schedule.next_date;
      const payDay = Number(String(schedule.start_date || schedule.next_date || '').slice(8, 10)) || undefined;
      const generateCount = Math.max(predictionCount * 2, 20);
      const totalOccurrences = schedule.recurring_occurrences_total || null;
      const completedOccurrences = schedule.recurring_occurrences_completed || 0;
      const remainingOccurrences = totalOccurrences ? Math.max(totalOccurrences - completedOccurrences, 0) : null;
      let futureCount = 0;

      for (let i = 0; i < generateCount; i++) {
        const daysUntil = getDaysUntil(currentDate);

        if (daysUntil >= 0) {
          futureCount += 1;

          if (remainingOccurrences !== null && futureCount > remainingOccurrences) {
            break;
          }

          if (schedule.recurring_duration_type === 'until_date' && schedule.recurring_until_date) {
            // Days compared as written (YYYY-MM-DD), so the time zone cannot shift the last one.
            if (String(currentDate).slice(0, 10) > String(schedule.recurring_until_date).slice(0, 10)) {
              break;
            }
          }

          allPredictions.push({
            date: currentDate,
            amount: Number(schedule.amount) || 0,
            source: schedule.source,
            frequency: schedule.frequency,
            days: daysUntil,
            sortDate: new Date(currentDate).getTime(),
            scheduleId: schedule.id,
            autoDeposit: schedule.auto_deposit !== false
          });
        }
        
        // The pay day comes from the schedule's start, as when the deposits are made.
        currentDate = predictNextDate(currentDate, schedule.frequency, payDay);
      }
    });
    
    allPredictions.sort((a, b) => a.sortDate - b.sortDate);
    
    return allPredictions.slice(0, predictionCount);
  }, [schedules, predictionCount]);

  const getPendingDeposits = useMemo(() => {
    // Use schedules for pending deposits
    return schedules.filter(schedule => {
      if (!schedule.is_active) return false;
      if (!schedule.auto_deposit) return false;
      
      const daysUntil = getDaysUntil(schedule.next_date);
      return daysUntil === 0;
    });
  }, [schedules]);

  const pendingTodayCount = getPendingDeposits.length;

  return {
    predictedIncome: getPredictedIncome,
    pendingDeposits: getPendingDeposits,
    pendingTodayCount
  };
};
