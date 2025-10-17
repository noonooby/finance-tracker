import React, { createContext, useState, useCallback, useEffect } from 'react';
import { dbOperation } from '../utils/db';

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(false);
  const [showCashInDashboard, setShowCashInDashboard] = useState(false);
  const [alertSettings, setAlertSettings] = useState({ 
    defaultDays: 7, 
    upcomingDays: 30 
  });

  // Load theme settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await dbOperation('settings', 'getAll');
        
        const darkModeSetting = settings?.find(s => s.key === 'darkMode');
        setDarkMode(darkModeSetting?.value || false);
        
        const showCashSetting = settings?.find(s => s.key === 'showCashInDashboard');
        setShowCashInDashboard(showCashSetting?.value || false);
        
        const alertSetting = settings?.find(s => s.key === 'alertSettings');
        const alertValue = alertSetting?.value || {};
        setAlertSettings({
          defaultDays: alertValue.defaultDays ?? alertValue.alertDays ?? 7,
          upcomingDays: alertValue.upcomingDays ?? 30
        });
      } catch (error) {
        console.error('Error loading theme settings:', error);
      }
    };
    
    loadSettings();
  }, []);

  const toggleDarkMode = useCallback(async () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    await dbOperation('settings', 'put', { key: 'darkMode', value: newMode });
  }, [darkMode]);

  const updateAlertSettings = useCallback(async (updates) => {
    const nextSettings = {
      defaultDays: updates.defaultDays ?? alertSettings.defaultDays ?? 7,
      upcomingDays: updates.upcomingDays ?? alertSettings.upcomingDays ?? 30
    };
    await dbOperation('settings', 'put', { key: 'alertSettings', value: nextSettings });
    setAlertSettings(nextSettings);
  }, [alertSettings]);

  const toggleCashDisplay = useCallback(async (show) => {
    await dbOperation('settings', 'put', { key: 'showCashInDashboard', value: show });
    setShowCashInDashboard(show);
  }, []);

  const value = {
    darkMode,
    showCashInDashboard,
    alertSettings,
    toggleDarkMode,
    updateAlertSettings,
    toggleCashDisplay,
    setDarkMode,
    setShowCashInDashboard,
    setAlertSettings,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
