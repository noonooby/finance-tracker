import React from 'react';
import { Toaster } from 'react-hot-toast';

/**
 * ToastContainer Component
 * 
 * Global toast notification container
 * Should be placed once at the root of your app
 */
export default function ToastContainer({ darkMode = false }) {
  return (
    <Toaster
      position="top-center"
      reverseOrder={false}
      gutter={8}
      containerClassName=""
      containerStyle={{}}
      toastOptions={{
        // Global toast options
        className: '',
        duration: 3000,
        style: {
          borderRadius: '8px',
          fontSize: '14px',
          padding: '12px 16px',
          maxWidth: '500px',
        },
        
        // Default options for success toasts
        success: {
          duration: 3000,
          style: {
            background: '#10B981',
            color: '#fff',
          },
          iconTheme: {
            primary: '#fff',
            secondary: '#10B981',
          },
        },
        
        // Default options for error toasts
        error: {
          duration: 5000,
          style: {
            background: '#EF4444',
            color: '#fff',
          },
          iconTheme: {
            primary: '#fff',
            secondary: '#EF4444',
          },
        },
        
        // Default options for loading toasts
        loading: {
          style: {
            background: darkMode ? '#374151' : '#6B7280',
            color: '#fff',
          },
        },
      }}
    />
  );
}
