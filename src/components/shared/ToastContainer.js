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
        duration: 3000,
        style: {
          borderRadius: '18px', fontSize: '15px', fontWeight: 500, lineHeight: 1.35, padding: '12px 16px', maxWidth: '92vw',
          background: 'rgb(var(--surface))', color: 'rgb(var(--text))', border: '1px solid rgb(var(--border))',
          boxShadow: '0 16px 40px -16px rgb(var(--shadow) / .45)',
        },
        success: { duration: 3000, iconTheme: { primary: 'rgb(var(--positive))', secondary: 'rgb(var(--surface))' } },
        error: { duration: 5000, iconTheme: { primary: 'rgb(var(--negative))', secondary: 'rgb(var(--surface))' } },
      }}
    />
  );
}
