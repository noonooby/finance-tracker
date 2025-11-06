import React, { createContext, useState, useCallback, useEffect } from 'react';
import { dbOperation } from '../utils/db';
import { getUserPreferences, setDisplayDensity as saveDisplayDensity } from '../utils/userPreferencesManager';

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(false);
  const [showCashInDashboard, setShowCashInDashboard] = useState(false);
  const [displayDensity, setDisplayDensityState] = useState('comfortable');
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
        
        // Load display density from user preferences (safely handle missing column)
        try {
          const prefs = await getUserPreferences();
          const density = prefs.display_density || 'comfortable';
          setDisplayDensityState(density);
          applyDensityToDOM(density);
        } catch (densityError) {
          // Column might not exist yet - use default
          console.log('Display density column not yet migrated, using default');
          setDisplayDensityState('comfortable');
          applyDensityToDOM('comfortable');
        }
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

  // Apply density to DOM
  const applyDensityToDOM = (density) => {
    const root = document.documentElement;
    if (density === 'auto') {
      root.removeAttribute('data-density');
    } else {
      root.setAttribute('data-density', density);
    }
  };

  const setDisplayDensity = useCallback(async (density) => {
    try {
      await saveDisplayDensity(density);
      setDisplayDensityState(density);
      applyDensityToDOM(density);
    } catch (error) {
      console.error('Error setting display density:', error);
      // If column doesn't exist yet, still apply to DOM for immediate UX
      if (error.message?.includes('display_density') || error.code === 'PGRST204') {
        console.log('Display density column not yet migrated - applying locally only');
        setDisplayDensityState(density);
        applyDensityToDOM(density);
      } else {
        throw error;
      }
    }
  }, []);

  const value = {
    darkMode,
    showCashInDashboard,
    displayDensity,
    alertSettings,
    toggleDarkMode,
    updateAlertSettings,
    toggleCashDisplay,
    setDisplayDensity,
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
