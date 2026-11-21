// Shared class names for Bank Accounts display components.
export const inputClass = (darkMode) =>
  `w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`;

export const labelClass = (darkMode) =>
  `block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`;

export const strongLabelClass = (darkMode) =>
  `block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;

export const panelClass = (darkMode) =>
  `${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4 space-y-3`;

export const chipClass = (darkMode, selected) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    selected
      ? 'bg-blue-600 text-white'
      : darkMode
        ? 'bg-blue-900 text-blue-200 hover:bg-blue-800 border border-blue-700'
        : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
  }`;
