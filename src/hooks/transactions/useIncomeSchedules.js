import { useState, useEffect, useCallback } from 'react';
import { 
  getIncomeSchedules,
  getIncomeScheduleWithHistory,
  updateIncomeSchedule,
  deleteIncomeSchedule,
  toggleIncomeSchedule
} from '../../utils/schedules';

/**
 * Hook for managing income schedules
 */
export const useIncomeSchedules = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getIncomeSchedules();
      setSchedules(data);
    } catch (error) {
      console.error('Error loading schedules:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const getScheduleWithHistory = useCallback(async (scheduleId) => {
    try {
      return await getIncomeScheduleWithHistory(scheduleId);
    } catch (error) {
      console.error('Error fetching schedule history:', error);
      return null;
    }
  }, []);

  const updateSchedule = useCallback(async (scheduleId, updates) => {
    try {
      const updated = await updateIncomeSchedule(scheduleId, updates);
      await loadSchedules();
      return updated;
    } catch (error) {
      console.error('Error updating schedule:', error);
      throw error;
    }
  }, [loadSchedules]);

  const deleteSchedule = useCallback(async (scheduleId) => {
    try {
      await deleteIncomeSchedule(scheduleId);
      await loadSchedules();
      return true;
    } catch (error) {
      console.error('Error deleting schedule:', error);
      throw error;
    }
  }, [loadSchedules]);

  const toggleSchedule = useCallback(async (scheduleId, pause = true) => {
    try {
      await toggleIncomeSchedule(scheduleId, pause);
      await loadSchedules();
      return true;
    } catch (error) {
      console.error('Error toggling schedule:', error);
      throw error;
    }
  }, [loadSchedules]);

  return {
    schedules,
    loading,
    loadSchedules,
    getScheduleWithHistory,
    updateSchedule,
    deleteSchedule,
    toggleSchedule
  };
};
