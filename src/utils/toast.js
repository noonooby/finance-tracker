import toast from 'react-hot-toast';

/**
 * Toast Notification System
 * 
 * Beautiful toast notifications with consistent styling
 * Uses react-hot-toast under the hood
 */

const toastConfig = {
  // Success toasts
  success: {
    duration: 3000,
    style: {
      background: '#10B981',
      color: '#fff',
      fontWeight: '500',
    },
    iconTheme: {
      primary: '#fff',
      secondary: '#10B981',
    },
  },
  
  // Error toasts
  error: {
    duration: 5000,
    style: {
      background: '#EF4444',
      color: '#fff',
      fontWeight: '500',
    },
    iconTheme: {
      primary: '#fff',
      secondary: '#EF4444',
    },
  },
  
  // Info toasts
  info: {
    duration: 3000,
    style: {
      background: '#3B82F6',
      color: '#fff',
      fontWeight: '500',
    },
    iconTheme: {
      primary: '#fff',
      secondary: '#3B82F6',
    },
  },
  
  // Loading toasts
  loading: {
    style: {
      background: '#6B7280',
      color: '#fff',
      fontWeight: '500',
    },
  },
};

/**
 * Show toast notifications
 */
export const showToast = {
  /**
   * Show success toast
   * @param {string} message - Success message
   */
  success: (message) => {
    toast.success(message, toastConfig.success);
  },

  /**
   * Show error toast
   * @param {string} message - Error message
   */
  error: (message) => {
    toast.error(message, toastConfig.error);
  },

  /**
   * Show info toast
   * @param {string} message - Info message
   */
  info: (message) => {
    toast(message, {
      icon: 'ℹ️',
      ...toastConfig.info,
    });
  },

  /**
   * Show loading toast
   * @param {string} message - Loading message
   * @returns {string} Toast ID (use to dismiss)
   */
  loading: (message) => {
    return toast.loading(message, toastConfig.loading);
  },

  /**
   * Dismiss a specific toast
   * @param {string} toastId - Toast ID to dismiss
   */
  dismiss: (toastId) => {
    toast.dismiss(toastId);
  },

  /**
   * Dismiss all toasts
   */
  dismissAll: () => {
    toast.dismiss();
  },
};

/**
 * Promise-based toast
 * Automatically shows loading, then success or error
 * 
 * @example
 * showToast.promise(
 *   saveData(),
 *   {
 *     loading: 'Saving...',
 *     success: 'Saved successfully!',
 *     error: 'Failed to save',
 *   }
 * );
 */
showToast.promise = (promise, messages) => {
  return toast.promise(
    promise,
    {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    },
    {
      success: toastConfig.success,
      error: toastConfig.error,
      loading: toastConfig.loading,
    }
  );
};

export default showToast;
