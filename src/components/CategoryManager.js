import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, Save, Star } from 'lucide-react';
import * as Icons from 'lucide-react';
import { fetchCategories, addCategory, updateCategory, deleteCategory, seedDefaultCategories } from '../utils/categories';
import IconPicker from './IconPicker';
import {
  getUserPreferences,
  toggleFavoriteCategory
} from '../utils/userPreferencesManager';
import { showToast } from '../utils/toast';

/**
 * CategoryManager Component
 * Full CRUD interface for managing expense and income categories
 */
export default function CategoryManager({ darkMode = false, onUpdate }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expense'); // 'expense' | 'income'
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [favoriteCategories, setFavoriteCategories] = useState([]);
  
  const [formData, setFormData] = useState({
    name: '',
    color: '#6b7280',
    icon: 'Package',
    is_income: false
  });

  // Load categories on mount
  useEffect(() => {
    loadCategories();
    loadFavoriteCategories();
  }, []);
  
  const loadFavoriteCategories = async () => {
    try {
      const prefs = await getUserPreferences();
      setFavoriteCategories(prefs.favorite_categories || []);
    } catch (error) {
      console.error('Error loading favorite categories:', error);
    }
  };
  
  const handleToggleFavorite = async (categoryId) => {
    try {
      await toggleFavoriteCategory(categoryId);
      await loadFavoriteCategories();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await fetchCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDefaults = async () => {
    if (!window.confirm('This will add default categories to your account. Continue?')) {
      return;
    }
    
    setSaving(true);
    try {
      await seedDefaultCategories();
      await loadCategories();
      if (onUpdate) onUpdate();
      showToast.success('Default categories added');
    } catch (error) {
      console.error('Error seeding categories:', error);
      showToast.error(`Could not add default categories: ${error?.message || 'try again'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name.trim()) {
      showToast.error('Enter a category name');
      return;
    }

    setSaving(true);
    try {
      await addCategory({
        name: formData.name.trim(),
        color: formData.color,
        icon: formData.icon,
        is_income: activeTab === 'income'
      });
      
      await loadCategories();
      if (onUpdate) onUpdate();
      
      // Reset form
      setFormData({
        name: '',
        color: '#6b7280',
        icon: 'Package',
        is_income: false
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding category:', error);
      showToast.error(`Could not add category: ${error?.message || 'try again'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (category) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      color: category.color,
      icon: category.icon || 'Package',
      is_income: category.is_income
    });
  };

  const handleSaveEdit = async (categoryId) => {
    if (!formData.name.trim()) {
      showToast.error('Enter a category name');
      return;
    }

    setSaving(true);
    try {
      await updateCategory(categoryId, {
        name: formData.name.trim(),
        color: formData.color,
        icon: formData.icon
      });
      
      await loadCategories();
      if (onUpdate) onUpdate();
      
      setEditingId(null);
      setFormData({
        name: '',
        color: '#6b7280',
        icon: 'Package',
        is_income: false
      });
    } catch (error) {
      console.error('Error updating category:', error);
      showToast.error(`Could not update category: ${error?.message || 'try again'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      name: '',
      color: '#6b7280',
      icon: 'Package',
      is_income: false
    });
  };

  const handleDelete = async (categoryId, categoryName) => {
    if (!window.confirm(`Are you sure you want to delete "${categoryName}"? This action cannot be undone.`)) {
      return;
    }

    setSaving(true);
    try {
      await deleteCategory(categoryId);
      await loadCategories();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error deleting category:', error);
      showToast.error(error.message || 'Error deleting category. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // Sort categories: favorites first, then others
  const filteredCategories = categories
    .filter(cat => activeTab === 'income' ? cat.is_income : !cat.is_income)
    .sort((a, b) => {
      const aIsFavorite = favoriteCategories.includes(a.id);
      const bIsFavorite = favoriteCategories.includes(b.id);
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      return 0;
    });

  const colorOptions = [
    { value: '#10b981', label: 'Green' },
    { value: '#f59e0b', label: 'Orange' },
    { value: '#3b82f6', label: 'Blue' },
    { value: '#8b5cf6', label: 'Purple' },
    { value: '#ef4444', label: 'Red' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#06b6d4', label: 'Cyan' },
    { value: '#6b7280', label: 'Gray' }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className={'text-muted'}>
          Loading categories...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Manage Categories</h2>
        <button
          onClick={handleSeedDefaults}
          disabled={saving}
          className={`px-4 py-2 text-sm rounded-lg ${
            'bg-surface-2 text-fg hover:bg-line/60'
          } disabled:opacity-50`}
        >
          Seed Defaults
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line">
        <button
          onClick={() => setActiveTab('expense')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'expense'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          Expenses ({categories.filter(c => !c.is_income).length})
        </button>
        <button
          onClick={() => setActiveTab('income')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'income'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          Income ({categories.filter(c => c.is_income).length})
        </button>
      </div>

      {/* Add Category Button */}
      {!showAddForm && !editingId && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent text-accent-contrast rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Add {activeTab === 'income' ? 'Income' : 'Expense'} Category
        </button>
      )}

      {/* Add Category Form */}
      {showAddForm && (
        <div className={`p-4 rounded-lg border ${
          'bg-surface-2 border-line'
        }`}>
          <h3 className="font-semibold mb-3">
            New {activeTab === 'income' ? 'Income' : 'Expense'} Category
          </h3>
          
          <div className="space-y-3">
            {/* Name Input */}
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                'text-fg'
              }`}>
                Category Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Groceries"
                className={`w-full px-3 py-2 border rounded-lg ${
                  'bg-surface border-line text-fg'
                }`}
              />
            </div>

            {/* Icon Picker */}
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                'text-fg'
              }`}>
                Icon
              </label>
              <IconPicker
                selectedIcon={formData.icon}
                onSelect={(icon) => setFormData({ ...formData, icon })}
                darkMode={darkMode}
              />
            </div>

            {/* Color Picker */}
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                'text-fg'
              }`}>
                Color
              </label>
              <div className="grid grid-cols-4 gap-2">
                {colorOptions.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                      formData.color === color.value
                        ? 'border-blue-500 ring-2 ring-blue-200'
                        : 'border-line hover:border-accent'
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: color.value }}
                    />
                    <span className="text-sm">{color.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAdd}
                disabled={saving || !formData.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent text-accent-contrast rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Category'}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({
                    name: '',
                    color: '#6b7280',
                    icon: 'Package',
                    is_income: false
                  });
                }}
                className={`px-4 py-2 rounded-lg ${
                  'bg-surface-2 text-fg hover:bg-line/60'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Categories List */}
      <div className="space-y-2">
        {filteredCategories.length === 0 ? (
          <div className={`text-center py-12 ${
            'text-muted'
          }`}>
            <p>No {activeTab} categories yet.</p>
            <p className="text-sm mt-2">Add your first category above!</p>
          </div>
        ) : (
          filteredCategories.map((category) => {
            const isFavorite = favoriteCategories.includes(category.id);
            
            return (
              <div
                key={category.id}
                className={`p-4 rounded-lg border ${
                  'bg-surface border-line'
                }`}
              >
                {editingId === category.id ? (
                  /* Edit Mode */
                  <div className="space-y-3">
                    <div>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg ${
                          'bg-surface border-line text-fg'
                        }`}
                      />
                    </div>

                    <IconPicker
                      selectedIcon={formData.icon}
                      onSelect={(icon) => setFormData({ ...formData, icon })}
                      darkMode={darkMode}
                    />

                    <div className="grid grid-cols-4 gap-2">
                      {colorOptions.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, color: color.value })}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 ${
                            formData.color === color.value
                              ? 'border-blue-500'
                              : 'border-line'
                          }`}
                        >
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: color.value }}
                          />
                          <span className="text-sm">{color.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(category.id)}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 press bg-accent text-accent-contrast rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check size={16} />
                        Save
                      </button>
                      <button aria-label="Cancel edit"
                        onClick={handleCancelEdit}
                        className={`px-4 py-2 rounded-lg ${
                          'bg-surface-2 text-fg'
                        }`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const iconName = category.icon || 'Package';
                        const IconComponent = Icons[iconName] || Icons.Package;
                        return <IconComponent size={20} className="text-muted" />;
                      })()}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{category.name}</span>
                          {isFavorite && (
                            <Star size={14} className="text-yellow-500 fill-current" title="Favorite" />
                          )}
                        </div>
                        {category.is_system && (
                          <span className={`text-xs ${
                            'text-muted'
                          }`}>
                            System Category
                          </span>
                        )}
                      </div>
                      <div
                        className="w-6 h-6 rounded-full border-2 border-white"
                        style={{ backgroundColor: category.color }}
                        title={category.color}
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleFavorite(category.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          isFavorite
                            ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                            : 'text-muted hover:bg-surface-2'
                        }`}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={18} className={isFavorite ? 'fill-current' : ''} />
                      </button>
                      <button
                        onClick={() => handleEdit(category)}
                        className={`p-2 rounded-lg transition-colors ${
                          'hover:bg-accent-soft text-accent'
                        }`}
                        title="Edit category"
                      >
                        <Edit2 size={18} />
                      </button>
                      {!category.is_system && (
                        <button
                          onClick={() => handleDelete(category.id, category.name)}
                          disabled={saving}
                          className={`p-2 rounded-lg transition-colors ${
                            'hover:bg-negative/10 text-negative'
                          } disabled:opacity-50`}
                          title="Delete category"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
