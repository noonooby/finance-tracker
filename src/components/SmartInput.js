import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { fetchSuggestions, upsertKnownEntity, deleteKnownEntity } from '../utils/knownEntities';

/**
 * SmartInput Component
 * Auto-suggests based on user's past inputs with learning capability
 * 
 * Props:
 * - type: 'description' | 'card' | 'loan' | 'category'
 * - value: current input value
 * - onChange: callback when value changes
 * - onSelect: callback when suggestion is selected (optional)
 * - placeholder: input placeholder
 * - label: input label
 * - darkMode: boolean for dark mode styling
 * - disabled: boolean to disable input
 * - className: additional CSS classes
 */
export default function SmartInput({
  type,
  value,
  onChange,
  onSelect,
  placeholder = '',
  label = '',
  darkMode = false,
  disabled = false,
  className = '',
  required = false
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastSavedValueRef = useRef('');
  const saveTimeoutRef = useRef(null);

  // Load suggestions when input changes
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!value || value.trim().length < 1) {
      setSuggestions([]);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      const results = await fetchSuggestions(type, value, 10);
      setSuggestions(results);
      setIsLoading(false);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value, type]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(true);
    setHighlightedIndex(-1);
  };

  const handleSuggestionClick = (suggestion) => {
    onChange(suggestion.name);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    
    // Track usage and mark value as saved
    upsertKnownEntity(type, suggestion.name);
    lastSavedValueRef.current = suggestion.name;
    
    if (onSelect) {
      onSelect(suggestion);
    }
  };

  const handleDeleteSuggestion = async (e, suggestionId) => {
    e.stopPropagation();
    const success = await deleteKnownEntity(suggestionId);
    
    if (success) {
      // Remove from local state
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    }
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleFocus = () => {
    if (value && value.trim().length >= 1) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    // Allow suggestion clicks to register before closing dropdown
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  };

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    if (value && value.trim().length >= 3) {
      saveTimeoutRef.current = setTimeout(async () => {
        const trimmedValue = value.trim();
        if (trimmedValue !== lastSavedValueRef.current) {
          console.log('💾 Auto-saving after pause:', trimmedValue);
          await upsertKnownEntity(type, trimmedValue);
          lastSavedValueRef.current = trimmedValue;
        }
      }, 3000);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [value, type]);

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          darkMode 
            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        autoComplete="off"
      />

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className={`absolute z-50 w-full mt-1 rounded-lg shadow-lg border max-h-60 overflow-y-auto ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          {isLoading ? (
            <div className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Loading suggestions...
            </div>
          ) : (
            <ul>
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.id}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors ${
                    highlightedIndex === index
                      ? darkMode
                        ? 'bg-blue-900 text-white'
                        : 'bg-blue-50 text-blue-900'
                      : darkMode
                      ? 'hover:bg-gray-700 text-gray-200'
                      : 'hover:bg-gray-50 text-gray-900'
                  }`}
                >
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-medium">{suggestion.name}</span>
                    <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      ({suggestion.usage_count}x)
                    </span>
                  </div>
                  
                  <button
                    onClick={(e) => handleDeleteSuggestion(e, suggestion.id)}
                    className={`p-1 rounded hover:bg-red-100 transition-colors ${
                      darkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'
                    }`}
                    title="Delete suggestion"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Helper text - inline subtle message */}
      {showSuggestions && suggestions.length === 0 && value && value.trim().length >= 1 && !isLoading && (
        <div className={`mt-1 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Hint: No suggestions yet. This will be saved for next time.
        </div>
      )}
    </div>
  );
}
