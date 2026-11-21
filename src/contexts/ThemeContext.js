import React, { createContext, useState, useCallback, useEffect } from 'react';
import { dbOperation } from '../utils/db';
import { getUserPreferences, setDisplayDensity as saveDisplayDensity } from '../utils/userPreferencesManager';

export const ThemeContext = createContext(null);

// Accent colours, in picker order. Values are the light-mode swatch colours.
export const THEMES = [
  { id: 'blue', name: 'Blue', color: '#2563eb' },
  { id: 'purple', name: 'Purple', color: '#4f46e5' },
  { id: 'teal', name: 'Teal', color: '#0d9488' },
  { id: 'green', name: 'Green', color: '#16a34a' },
  { id: 'orange', name: 'Orange', color: '#ea580c' },
  { id: 'rose', name: 'Rose', color: '#db2777' },
  { id: 'graphite', name: 'Graphite', color: '#52525b' },
];
const THEME_IDS = THEMES.map((t) => t.id);

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

// Fade colours briefly while the theme changes, then drop the transition so normal use stays snappy.
let animTimer;
const animateThemeChange = () => {
  const r = document.documentElement;
  r.classList.add('theme-anim');
  clearTimeout(animTimer);
  animTimer = setTimeout(() => r.classList.remove('theme-anim'), 320);
};

export function ThemeProvider({ children }) {
  // 'light', 'dark' or 'system'. Remembered on this device; the first-paint script in index.html reads the same keys.
  const [colorMode, setColorModeState] = useState(() => {
    const m = read('finance_mode');
    if (m === 'light' || m === 'dark' || m === 'system') return m;
    const d = read('finance_dark');
    return d === null ? 'system' : d === '1' ? 'dark' : 'light';
  });
  const [systemIsDark, setSystemIsDark] = useState(systemDark);
  const [theme, setThemeState] = useState(() => {
    const t = read('finance_theme');
    return THEME_IDS.includes(t) ? t : 'blue';
  });
  const darkMode = colorMode === 'system' ? systemIsDark : colorMode === 'dark';

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setSystemIsDark(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, []);

  useEffect(() => {
    const r = document.documentElement;
    r.classList.toggle('dark', !!darkMode);
    r.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = getComputedStyle(r).getPropertyValue('--background').trim();
      meta.setAttribute('content', bg ? `rgb(${bg.split(/\s+/).join(',')})` : (darkMode ? '#101014' : '#f6f6f8'));
    }
    // The browser tab icon takes the theme colour too.
    const acc = getComputedStyle(r).getPropertyValue('--accent').trim();
    const icon = document.querySelector('link[rel="icon"]');
    if (icon && acc) {
      const fill = `rgb(${acc.split(/\s+/).join(',')})`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${fill}"/><path d="M128 340l84-84 64 56 112-128" fill="none" stroke="#fff" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/><circle cx="388" cy="184" r="28" fill="#fff"/></svg>`;
      icon.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(svg));
    }
    write('finance_dark', darkMode ? '1' : '0');
  }, [darkMode, theme]);

  const setColorMode = useCallback((mode) => {
    if (!['light', 'dark', 'system'].includes(mode)) return;
    animateThemeChange();
    setColorModeState(mode);
    write('finance_mode', mode);
    if (mode !== 'system') dbOperation('settings', 'put', { key: 'darkMode', value: mode === 'dark' }).catch(() => {});
  }, []);

  const setDarkMode = useCallback((on) => setColorMode(on ? 'dark' : 'light'), [setColorMode]);

  const setTheme = useCallback((id) => {
    if (!THEME_IDS.includes(id)) return;
    animateThemeChange();
    setThemeState(id);
    write('finance_theme', id);
  }, []);

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
        // A choice made on this device wins; otherwise use the saved account setting.
        if (darkModeSetting && !read('finance_mode')) setColorModeState(darkModeSetting.value ? 'dark' : 'light');
        
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
          setDisplayDensityState('comfortable');
          applyDensityToDOM('comfortable');
        }
      } catch (error) {
        console.error('Error loading theme settings:', error);
      }
    };
    
    loadSettings();
  }, []);

  const toggleDarkMode = useCallback(() => setColorMode(darkMode ? 'light' : 'dark'), [darkMode, setColorMode]);

  const updateAlertSettings = useCallback(async (updates) => {
    const nextSettings = {
      defaultDays: updates.defaultDays ?? alertSettings.defaultDays ?? 7,
      upcomingDays: updates.upcomingDays ?? alertSettings.upcomingDays ?? 30
    };
    await dbOperation('settings', 'put', { key: 'alertSettings', value: nextSettings });
    setAlertSettings(nextSettings);
  }, [alertSettings]);

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
        setDisplayDensityState(density);
        applyDensityToDOM(density);
      } else {
        throw error;
      }
    }
  }, []);

  const value = {
    darkMode,
    displayDensity,
    alertSettings,
    toggleDarkMode,
    updateAlertSettings,
    setDisplayDensity,
    setDarkMode,
    colorMode,
    setColorMode,
    theme,
    setTheme,
    themes: THEMES,
    setAlertSettings,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
