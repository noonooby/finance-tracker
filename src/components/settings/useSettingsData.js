import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../../utils/helpers';
import { getAllSettings, setSetting, setCategoryBudget, deleteCategoryBudget } from '../../utils/settingsManager';
import { fetchCategories } from '../../utils/categories';
import { logActivity } from '../../utils/activityLogger';
import { trackCurrentMonth, checkAndFinalizePreviousMonths } from '../../utils/budgetTrackingManager';
import {
  getUserPreferences,
  toggleSettingsSection,
  updateCollapsedSettingsSections
} from '../../utils/userPreferencesManager';
import { showToast } from '../../utils/toast';
import { SETTING_METADATA } from './settingMetadata';

export const SECTION_KEYS = [
  'appearance', 'notifications', 'financial', 'automation',
  'transactionDefaults', 'categories', 'categoryBudgets',
  'budgetHistory', 'suggestions', 'backup', 'danger'
];

const allSectionsSetTo = (value) =>
  SECTION_KEYS.reduce((acc, key) => ({ ...acc, [key]: value }), {});

/**
 * Loads and saves Settings page data: stored settings, categories,
 * category budgets and which sections are expanded.
 */
export default function useSettingsData(categoriesProp = []) {
  const [settings, setSettings] = useState({});
  const [localCategories, setLocalCategories] = useState([]);
  const [expandedSections, setExpandedSections] = useState(() => allSectionsSetTo(false));

  const loadLocalCategories = useCallback(async () => {
    try {
      const cats = await fetchCategories();
      setLocalCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setSettings(await getAllSettings());
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    const loadSettingsUIPreferences = async () => {
      try {
        const prefs = await getUserPreferences();
        const collapsed = prefs.collapsed_settings_sections || [];

        // First load: store all sections as collapsed and keep the default UI state
        if (collapsed.length === 0) {
          updateCollapsedSettingsSections(SECTION_KEYS).catch(err => {
            console.warn('Failed to initialize collapsed sections:', err);
          });
          return;
        }

        const next = {};
        SECTION_KEYS.forEach(section => {
          next[section] = !collapsed.includes(section);
        });
        setExpandedSections(next);
      } catch (error) {
        console.error('Error loading Settings UI preferences:', error);
      }
    };

    loadSettings();
    loadLocalCategories();
    loadSettingsUIPreferences();
  }, [loadLocalCategories]);

  // Finalize previous month budgets once budgets are known
  useEffect(() => {
    if (settings.categoryBudgets && Object.keys(settings.categoryBudgets).length > 0) {
      checkAndFinalizePreviousMonths(settings.categoryBudgets).catch(err => {
        console.warn('Failed to finalize previous months:', err);
      });
    }
  }, [settings.categoryBudgets]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    toggleSettingsSection(section).catch(err => {
      console.warn('Failed to persist section state, continuing anyway:', err);
    });
  };

  const anyExpanded = Object.values(expandedSections).some(val => val === true);

  const toggleAllSections = () => {
    if (anyExpanded) {
      setExpandedSections(allSectionsSetTo(false));
      updateCollapsedSettingsSections(Object.keys(expandedSections)).catch(err => {
        console.warn('Failed to persist collapse all, continuing anyway:', err);
      });
    } else {
      setExpandedSections(allSectionsSetTo(true));
      updateCollapsedSettingsSections([]).catch(err => {
        console.warn('Failed to persist expand all, continuing anyway:', err);
      });
    }
  };

  const updateSetting = async (key, value) => {
    try {
      const oldValue = settings[key];
      await setSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));

      const metadata = SETTING_METADATA[key];
      if (metadata) {
        const description = metadata.formatDescription(oldValue, value);
        if (metadata.undoable) {
          await logActivity('edit_setting', key, `setting-${key}`, metadata.displayName, description, {
            settingKey: key,
            previousValue: oldValue,
            newValue: value
          });
        } else {
          await logActivity('setting_change', key, `setting-${key}`, metadata.displayName, description, null);
        }
      }
    } catch (error) {
      console.error(`Error updating setting ${key}:`, error);
      showToast.error('Failed to update setting. Please try again.');
    }
  };

  const categories = categoriesProp.length > 0 ? categoriesProp : localCategories;
  const expenseCategories = categories.filter(cat => !cat.is_income);
  const categoryBudgets = settings.categoryBudgets || {};

  /** Saves a category budget. Returns true on success. */
  const saveCategoryBudget = async (categoryId, amount) => {
    try {
      const categoryName = categories.find(c => c.id === categoryId)?.name || 'Category';
      const previousBudget = categoryBudgets[categoryId] || 0;

      await setCategoryBudget(categoryId, amount);
      const updatedBudgets = { ...(settings.categoryBudgets || {}), [categoryId]: amount };
      setSettings(prev => ({ ...prev, categoryBudgets: updatedBudgets }));

      const description = previousBudget > 0
        ? `Updated ${categoryName} budget from ${formatCurrency(previousBudget)} to ${formatCurrency(amount)} per month`
        : `Set ${categoryName} budget to ${formatCurrency(amount)} per month`;

      await logActivity('set_budget', 'category_budget', categoryId, categoryName, description, {
        settingKey: 'categoryBudgets',
        categoryId,
        amount,
        previousBudget,
        categoryName
      });

      trackCurrentMonth(categoryId, amount).catch(err => {
        console.warn('Failed to track budget:', err);
      });
      return true;
    } catch (error) {
      console.error('Error setting category budget:', error);
      showToast.error('Failed to save category budget');
      return false;
    }
  };

  const removeCategoryBudget = async (categoryId) => {
    try {
      const categoryName = categories.find(c => c.id === categoryId)?.name || 'Category';
      const previousBudget = categoryBudgets[categoryId] || 0;

      await deleteCategoryBudget(categoryId);
      const updatedBudgets = { ...(settings.categoryBudgets || {}) };
      delete updatedBudgets[categoryId];
      setSettings(prev => ({ ...prev, categoryBudgets: updatedBudgets }));

      // Historical budget data is kept for trend analysis
      await logActivity(
        'delete_budget',
        'category_budget',
        categoryId,
        categoryName,
        `Removed ${categoryName} budget (was ${formatCurrency(previousBudget)} per month)`,
        { settingKey: 'categoryBudgets', categoryId, previousBudget, categoryName }
      );
    } catch (error) {
      console.error('Error deleting category budget:', error);
      showToast.error('Failed to remove category budget');
    }
  };

  return {
    settings,
    updateSetting,
    categories,
    expenseCategories,
    categoryBudgets,
    loadLocalCategories,
    saveCategoryBudget,
    removeCategoryBudget,
    expandedSections,
    anyExpanded,
    toggleSection,
    toggleAllSections
  };
}
