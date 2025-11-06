import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Home,
  CreditCard,
  TrendingUp,
  Calendar,
  Building2,
  DollarSign,
  Activity,
  List,
  BarChart3,
  Settings as SettingsIcon
} from 'lucide-react';

/**
 * Bottom Navigation Bar with Direct Access
 * All 10 navigation items with 1-click access
 */
export default function BottomNavigation({ darkMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get current path
  const currentPath = location.pathname;

  // All navigation items - flat structure for direct access
  const navItems = [
    { id: 'dashboard', path: '/', icon: Home, label: 'Home' },
    { id: 'cards', path: '/cards', icon: CreditCard, label: 'Cards' },
    { id: 'loans', path: '/loans', icon: TrendingUp, label: 'Loans' },
    { id: 'bank-accounts', path: '/bank-accounts', icon: Building2, label: 'Banks' },
    { id: 'income', path: '/income', icon: DollarSign, label: 'Income' },
    { id: 'activity', path: '/activity', icon: Activity, label: 'Activity' },
    { id: 'transactions', path: '/transactions', icon: List, label: 'Transactions' },
    { id: 'reports', path: '/reports', icon: BarChart3, label: 'Reports' },
    { id: 'settings', path: '/settings', icon: SettingsIcon, label: 'Settings' }
  ];

  // Check if nav item is active
  const isActive = (path) => {
    if (path === '/') {
      return currentPath === '/';
    }
    return currentPath.startsWith(path);
  };

  return (
    <nav 
      className={`fixed bottom-0 left-0 right-0 ${
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      } border-t px-1 py-2 flex justify-around z-30 overflow-x-auto flex-shrink-0`}
      style={{ touchAction: 'manipulation' }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors min-w-0 flex-shrink-0 ${
              active
                ? 'text-blue-600 bg-blue-50' 
                : darkMode 
                  ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Icon size={20} />
            <span className="text-xs font-medium whitespace-nowrap">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
