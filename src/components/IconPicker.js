import React, { useState } from 'react';
import { Search } from 'lucide-react';
import * as Icons from 'lucide-react';

/**
 * IconPicker Component
 * Clean icon picker using Lucide React icons
 */

// Curated list of commonly used icons for categories
const COMMON_ICONS = [
  // Finance & Money
  { name: 'DollarSign', label: 'Dollar' },
  { name: 'CreditCard', label: 'Credit Card' },
  { name: 'Wallet', label: 'Wallet' },
  { name: 'Banknote', label: 'Cash' },
  { name: 'Coins', label: 'Coins' },
  { name: 'TrendingUp', label: 'Growth' },
  { name: 'TrendingDown', label: 'Decrease' },
  { name: 'PiggyBank', label: 'Savings' },
  
  // Shopping & Retail
  { name: 'ShoppingCart', label: 'Shopping' },
  { name: 'ShoppingBag', label: 'Shopping Bag' },
  { name: 'Store', label: 'Store' },
  { name: 'Receipt', label: 'Receipt' },
  { name: 'Tag', label: 'Tag' },
  { name: 'Gift', label: 'Gift' },
  
  // Food & Dining
  { name: 'Utensils', label: 'Dining' },
  { name: 'Coffee', label: 'Coffee' },
  { name: 'Pizza', label: 'Pizza' },
  { name: 'UtensilsCrossed', label: 'Restaurant' },
  { name: 'Beer', label: 'Bar' },
  { name: 'Wine', label: 'Wine' },
  
  // Transportation
  { name: 'Car', label: 'Car' },
  { name: 'Bus', label: 'Bus' },
  { name: 'Plane', label: 'Flight' },
  { name: 'Train', label: 'Train' },
  { name: 'Bike', label: 'Bike' },
  { name: 'Fuel', label: 'Fuel' },
  { name: 'ParkingCircle', label: 'Parking' },
  { name: 'Truck', label: 'Truck' },
  
  // Home & Living
  { name: 'Home', label: 'Home' },
  { name: 'Building', label: 'Building' },
  { name: 'Building2', label: 'Office' },
  { name: 'Sofa', label: 'Furniture' },
  { name: 'Bed', label: 'Bed' },
  { name: 'Armchair', label: 'Chair' },
  
  // Utilities
  { name: 'Lightbulb', label: 'Electric' },
  { name: 'Droplet', label: 'Water' },
  { name: 'Flame', label: 'Gas' },
  { name: 'Wifi', label: 'Internet' },
  { name: 'Smartphone', label: 'Phone' },
  { name: 'Monitor', label: 'TV' },
  
  // Tech & Electronics
  { name: 'Laptop', label: 'Laptop' },
  { name: 'Tablet', label: 'Tablet' },
  { name: 'Watch', label: 'Watch' },
  { name: 'Camera', label: 'Camera' },
  { name: 'Headphones', label: 'Headphones' },
  
  // Entertainment
  { name: 'Film', label: 'Movies' },
  { name: 'Music', label: 'Music' },
  { name: 'Gamepad2', label: 'Gaming' },
  { name: 'Tv', label: 'Streaming' },
  { name: 'Ticket', label: 'Events' },
  { name: 'PartyPopper', label: 'Party' },
  
  // Health & Fitness
  { name: 'Heart', label: 'Health' },
  { name: 'Activity', label: 'Fitness' },
  { name: 'Dumbbell', label: 'Gym' },
  { name: 'Apple', label: 'Food' },
  { name: 'Stethoscope', label: 'Medical' },
  { name: 'Pill', label: 'Pharmacy' },
  
  // Education & Work
  { name: 'BookOpen', label: 'Books' },
  { name: 'GraduationCap', label: 'Education' },
  { name: 'Briefcase', label: 'Work' },
  { name: 'PenTool', label: 'Writing' },
  { name: 'FileText', label: 'Documents' },
  
  // Fashion & Beauty
  { name: 'Shirt', label: 'Clothing' },
  { name: 'Glasses', label: 'Accessories' },
  { name: 'Sparkles', label: 'Beauty' },
  
  // Pets & Nature
  { name: 'Dog', label: 'Pet' },
  { name: 'Cat', label: 'Cat' },
  { name: 'TreePine', label: 'Nature' },
  { name: 'Flower', label: 'Garden' },
  
  // Miscellaneous
  { name: 'Package', label: 'Package' },
  { name: 'Mail', label: 'Mail' },
  { name: 'Phone', label: 'Phone' },
  { name: 'Wrench', label: 'Tools' },
  { name: 'Hammer', label: 'Repair' },
  { name: 'Calendar', label: 'Calendar' },
  { name: 'Clock', label: 'Time' },
  { name: 'MapPin', label: 'Location' },
  { name: 'Globe', label: 'Travel' },
  { name: 'Umbrella', label: 'Weather' },
  { name: 'Star', label: 'Favorite' },
  { name: 'Target', label: 'Goal' },
  { name: 'Award', label: 'Achievement' },
  { name: 'Trophy', label: 'Trophy' }
];

export default function IconPicker({ selectedIcon, onSelect, darkMode = false }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const filteredIcons = searchTerm
    ? COMMON_ICONS.filter(icon =>
        icon.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        icon.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : COMMON_ICONS;

  const handleIconSelect = (iconName) => {
    onSelect(iconName);
    setShowPicker(false);
    setSearchTerm('');
  };

  // Get the icon component
  const SelectedIconComponent = selectedIcon && Icons[selectedIcon] 
    ? Icons[selectedIcon] 
    : Icons.Package; // Default fallback

  return (
    <div className="relative">
      {/* Selected Icon Display */}
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className={`w-full px-3 py-2 border rounded-lg text-left flex items-center gap-2 ${
          darkMode
            ? 'bg-gray-700 border-gray-600 text-white'
            : 'bg-white border-gray-300 text-gray-900'
        }`}
      >
        <SelectedIconComponent size={20} className="text-gray-500" />
        <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
          {selectedIcon ? COMMON_ICONS.find(i => i.name === selectedIcon)?.label || 'Change icon' : 'Select icon'}
        </span>
      </button>

      {/* Icon Picker Dropdown */}
      {showPicker && (
        <>
          {/* Backdrop to close picker */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowPicker(false)}
          />
          
          <div
            className={`absolute z-50 mt-2 w-full rounded-lg shadow-xl border p-3 ${
              darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            }`}
          >
            {/* Search */}
            <div className="mb-3">
              <div className="relative">
                <Search
                  size={16}
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                    darkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                />
                <input
                  type="text"
                  placeholder="Search icons..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  autoFocus
                />
              </div>
            </div>

            {/* Icon Grid */}
            <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto">
              {filteredIcons.map((icon) => {
                const IconComponent = Icons[icon.name];
                if (!IconComponent) return null;
                
                return (
                  <button
                    key={icon.name}
                    type="button"
                    onClick={() => handleIconSelect(icon.name)}
                    className={`p-3 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors flex items-center justify-center ${
                      selectedIcon === icon.name
                        ? darkMode
                          ? 'bg-blue-900 ring-2 ring-blue-500'
                          : 'bg-blue-100 ring-2 ring-blue-500'
                        : darkMode
                        ? 'hover:bg-gray-700'
                        : 'hover:bg-gray-100'
                    }`}
                    title={icon.label}
                  >
                    <IconComponent size={20} className={darkMode ? 'text-gray-300' : 'text-gray-600'} />
                  </button>
                );
              })}
            </div>
            
            {filteredIcons.length === 0 && (
              <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <p className="text-sm">No icons found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
