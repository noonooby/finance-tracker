import { useState } from 'react';

/**
 * useAsyncAction Hook
 * 
 * Manages async operations with loading state and duplicate prevention
 * 
 * @returns {Object} - { executeAction, isProcessing, processing }
 * 
 * @example
 * const { executeAction, isProcessing } = useAsyncAction();
 * 
 * const handleSave = async () => {
 *   const result = await executeAction('save-item', async () => {
 *     await saveToDatabase();
 *     return { itemId: 123 };
 *   });
 *   
 *   if (result.success) {
 *     showToast.success('Saved successfully');
 *   } else {
 *     showToast.error(result.error.message);
 *   }
 * };
 */
export default function useAsyncAction() {
  const [processing, setProcessing] = useState(null);

  /**
   * Execute an async action with duplicate prevention
   * 
   * @param {string} actionId - Unique identifier for this action
   * @param {Function} asyncFunction - The async function to execute
   * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
   */
  const executeAction = async (actionId, asyncFunction) => {
    // Prevent duplicate actions
    if (processing) {
      console.warn(`Action already in progress: ${processing}`);
      return { success: false, error: new Error('Another action is in progress') };
    }

    setProcessing(actionId);
    
    try {
      const result = await asyncFunction();
      return { success: true, data: result };
    } catch (error) {
      console.error(`Action failed [${actionId}]:`, error);
      return { success: false, error };
    } finally {
      setProcessing(null);
    }
  };

  /**
   * Check if a specific action is currently processing
   * 
   * @param {string} actionId - The action ID to check
   * @returns {boolean}
   */
  const isProcessing = (actionId) => processing === actionId;

  return {
    executeAction,
    isProcessing,
    processing
  };
}
