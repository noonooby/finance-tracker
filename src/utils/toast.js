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
      background: 'rgb(var(--surface))',
      color: 'rgb(var(--text))',
      border: '1px solid rgb(var(--border))',
      borderRadius: '14px',
      padding: '10px 14px',
      fontWeight: '500',
      boxShadow: '0 6px 24px rgb(0 0 0 / 0.08)',
    },
    iconTheme: {
      primary: 'rgb(var(--positive))',
      secondary: 'rgb(var(--surface))',
    },
  },
  
  // Error toasts
  error: {
    duration: 5000,
    style: {
      background: 'rgb(var(--surface))',
      color: 'rgb(var(--text))',
      border: '1px solid rgb(var(--border))',
      borderRadius: '14px',
      padding: '10px 14px',
      fontWeight: '500',
      boxShadow: '0 6px 24px rgb(0 0 0 / 0.08)',
    },
    iconTheme: {
      primary: 'rgb(var(--negative))',
      secondary: 'rgb(var(--surface))',
    },
  },
  
  // Info toasts
  info: {
    duration: 3000,
    style: {
      background: 'rgb(var(--surface))',
      color: 'rgb(var(--text))',
      border: '1px solid rgb(var(--border))',
      borderRadius: '14px',
      padding: '10px 14px',
      fontWeight: '500',
      boxShadow: '0 6px 24px rgb(0 0 0 / 0.08)',
    },
    iconTheme: {
      primary: 'rgb(var(--accent))',
      secondary: 'rgb(var(--surface))',
    },
  },
  
  // Loading toasts
  loading: {
    style: {
      background: 'rgb(var(--surface))',
      color: 'rgb(var(--text))',
      border: '1px solid rgb(var(--border))',
      borderRadius: '14px',
      padding: '10px 14px',
      fontWeight: '500',
      boxShadow: '0 6px 24px rgb(0 0 0 / 0.08)',
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
