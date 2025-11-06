/**
 * CategorySelect - Smart searchable category dropdown with inline creation
 * 
 * Features:
 * - Searchable dropdown
 * - Type-to-create: Shows "Create '{text}' as new category?" when no match
 * - Inline form with name pre-filled
 * - Uses existing addCategory from utils/categories
 * - Auto-selects newly created category
 * - Works for both expense and payment types
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Check, X } from 'lucide-react';
import * as Icons from 'lucide-react';
import { addCategory } from '../../utils/categories';
import IconPicker from '../IconPicker';

export default function CategorySelect({
  categories,
  value,
  onChange,
  darkMode,
  placeholder = "Search or create category...",
  onCategoryCreated
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCategoryData, setNewCategoryData] = useState({
    name: '',
    icon: 'Package',
    color: '#6b7280'
  });
  
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setShowCreateForm(false);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get selected category details
  const selectedCategory = categories.find(c => c.id === value);
  
  // Filter categories based on search
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Check if we should show "create new" option
  const showCreateOption = searchQuery.trim().length > 0 && 
    !filteredCategories.some(c => c.name.toLowerCase() === searchQuery.toLowerCase());

  const handleSelect = (categoryId) => {
    onChange(categoryId);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleCreateClick = () => {
    setNewCategoryData({
      name: searchQuery.trim(),
      icon: 'Package',
      color: '#6b7280'
    });
    setShowCreateForm(true);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryData.name.trim()) return;
    
    setCreating(true);
    try {
      const newCategory = await addCategory({
        name: newCategoryData.name.trim(),
        color: newCategoryData.color,
        icon: newCategoryData.icon,
        is_income: false // Always expense for now
      });
      
      // Notify parent component of new category
      if (onCategoryCreated) {
        onCategoryCreated(newCategory);
      }
      
      // Auto-select the new category
      onChange(newCategory.id);
      
      // Reset form and close
      setShowCreateForm(false);
      setSearchQuery('');
      setIsOpen(false);
      setNewCategoryData({ name: '', icon: 'Package', color: '#6b7280' });
      
      console.log('✅ Category created and selected:', newCategory.name);
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Failed to create category. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setNewCategoryData({ name: '', icon: 'Package', color: '#6b7280' });
  };

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

  return (
    <div ref={wrapperRef} className="relative">
      {/* Main Input */}
      <div className="relative">
        <div className={`flex items-center gap-2 w-full px-3 py-2 border rounded-lg cursor-text ${
          darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
        }`}
          onClick={() => {
            setIsOpen(true);
            inputRef.current?.focus();
          }}
        >
          {selectedCategory && !isOpen ? (
            <>
              {(() => {
                const IconComponent = Icons[selectedCategory.icon] || Icons.Package;
                return <IconComponent size={18} className="text-gray-500 flex-shrink-0" />;
              })()}
              <span className="flex-1">{selectedCategory.name}</span>
            </>
          ) : (
            <>
              <Search size={18} className="text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                placeholder={placeholder}
                className={`flex-1 outline-none bg-transparent ${
                  darkMode ? 'text-white placeholder-gray-400' : 'text-gray-900 placeholder-gray-500'
                }`}
              />
            </>
          )}
          {value && !isOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearchQuery('');
              }}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && !showCreateForm && (
        <div className={`absolute z-50 w-full mt-1 border rounded-lg shadow-lg max-h-64 overflow-y-auto ${
          darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
        }`}>
          {/* Filtered Categories */}
          {filteredCategories.length > 0 ? (
            <div>
              <div className={`px-3 py-2 text-xs font-semibold ${
                darkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {searchQuery ? 'Matching Categories' : 'Select Category'}
              </div>
              {filteredCategories.map(category => {
                const IconComponent = Icons[category.icon] || Icons.Package;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleSelect(category.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 transition-colors ${
                      value === category.id
                        ? darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'
                        : darkMode ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-50 text-gray-900'
                    }`}
                  >
                    <IconComponent size={18} className="text-gray-500 flex-shrink-0" />
                    <span className="flex-1 text-left">{category.name}</span>
                    {value === category.id && (
                      <Check size={16} className="flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : searchQuery && (
            <div className={`px-3 py-8 text-center ${
              darkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              <div className="text-sm">No categories found</div>
              <div className="text-xs mt-1">Continue typing and press enter to create</div>
            </div>
          )}

          {/* Create New Option */}
          {showCreateOption && (
            <>
              <div className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`} />
              <button
                type="button"
                onClick={handleCreateClick}
                className={`w-full flex items-center gap-3 px-3 py-3 transition-colors ${
                  darkMode 
                    ? 'bg-green-900/20 hover:bg-green-900/30 text-green-300' 
                    : 'bg-green-50 hover:bg-green-100 text-green-700'
                }`}
              >
                <Plus size={18} className="flex-shrink-0" />
                <span className="flex-1 text-left font-medium">
                  Create '{searchQuery.trim()}' as new category
                </span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Inline Create Form */}
      {showCreateForm && (
        <div className={`absolute z-50 w-full mt-1 border rounded-lg shadow-lg p-4 ${
          darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
        }`}>
          <div className="space-y-3">
            <div>
              <label className={`block text-xs font-medium mb-1 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Category Name
              </label>
              <input
                type="text"
                value={newCategoryData.name}
                onChange={(e) => setNewCategoryData({ ...newCategoryData, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${
                  darkMode ? 'bg-gray-600 border-gray-500 text-white' : 'bg-white border-gray-300'
                }`}
                placeholder="Category name"
                autoFocus
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Icon
              </label>
              <IconPicker
                selectedIcon={newCategoryData.icon}
                onSelect={(icon) => setNewCategoryData({ ...newCategoryData, icon })}
                darkMode={darkMode}
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Color
              </label>
              <div className="grid grid-cols-4 gap-1">
                {colorOptions.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setNewCategoryData({ ...newCategoryData, color: color.value })}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded border-2 transition-all text-xs ${
                      newCategoryData.color === color.value
                        ? 'border-blue-500 ring-1 ring-blue-200'
                        : darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color.value }}
                    />
                    <span className="truncate">{color.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={creating || !newCategoryData.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <Check size={16} />
                {creating ? 'Creating...' : 'Create & Select'}
              </button>
              <button
                type="button"
                onClick={handleCancelCreate}
                disabled={creating}
                className={`px-3 py-2 rounded-lg text-sm ${
                  darkMode ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
