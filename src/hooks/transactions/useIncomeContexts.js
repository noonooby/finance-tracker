import { useState, useCallback, useEffect } from 'react';
import {
  getIncomeSourceContext,
  getRecentIncomeSources,
  getLastUsedIncomeContext,
  applyIncomeContext
} from '../../utils/formContexts';

/**
 * Hook for income form contexts and smart auto-fill
 * Extracted from Income.js to be reusable across components
 */
export const useIncomeContexts = (editingItem = null) => {
  const [recentSources, setRecentSources] = useState([]);

  const loadIncomeContexts = useCallback(async () => {
    try {
      const recent = await getRecentIncomeSources(5);
      setRecentSources(recent);
      
      if (!editingItem) {
        const lastContext = await getLastUsedIncomeContext();
        if (lastContext) {
          const contextData = applyIncomeContext(lastContext);
          return {
            source: lastContext.source_name,
            ...contextData
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Error loading income contexts:', error);
      return null;
    }
  }, [editingItem]);

  const handleSelectSource = useCallback(async (sourceContext) => {
    try {
      const contextData = applyIncomeContext(sourceContext);
      return {
        source: sourceContext.source_name,
        ...contextData
      };
    } catch (error) {
      console.error('Error applying context:', error);
      return null;
    }
  }, []);

  const handleSourceBlur = useCallback(async (sourceName) => {
    if (!sourceName?.trim()) return null;
    try {
      const context = await getIncomeSourceContext(sourceName);
      if (context) {
        const contextData = applyIncomeContext(context);
        console.log('✅ Applied context for:', sourceName);
        return contextData;
      }
      return null;
    } catch (error) {
      console.error('Error loading context:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    loadIncomeContexts();
  }, [loadIncomeContexts]);

  return {
    recentSources,
    loadIncomeContexts,
    handleSelectSource,
    handleSourceBlur
  };
};
