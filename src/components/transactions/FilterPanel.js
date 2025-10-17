import React from 'react';
import { Search } from 'lucide-react';

/**
 * Filter Panel Component
 * Pure UI component for transaction filters
 * All logic handled by parent component
 */
export default function FilterPanel({
  darkMode,
  filters,
  onFiltersChange,
  categories,
  creditCards,
  loans,
  bankAccounts,
  reservedFunds,
  onClearFilters
}) {
  return (
    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4 space-y-4`}>
      {/* Search and Clear */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 mr-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search transactions..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className={`w-full pl-10 pr-4 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          />
        </div>
        <button
          onClick={onClearFilters}
          className={`px-4 py-2 rounded-lg text-sm ${
            darkMode
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          Clear All
        </button>
      </div>

      {/* Filter Dropdowns */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Type Filter */}
        <select
          value={filters.type}
          onChange={(e) => onFiltersChange({ ...filters, type: e.target.value })}
          className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
        >
          <option value="all">All Types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="payment">Payments</option>
        </select>

        {/* Category Filter */}
        <select
          value={filters.category}
          onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
          className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>

        {/* Payment Method Filter */}
        <select
          value={filters.paymentMethod}
          onChange={(e) => onFiltersChange({ ...filters, paymentMethod: e.target.value })}
          className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
        >
          <option value="all">All Methods</option>
          <option value="cash_in_hand">💵 Cash in Hand</option>
          <option value="bank_account">🏦 Bank Account</option>
          <option value="cash">Cash (Legacy)</option>
          <option value="credit_card">💳 Credit Card</option>
          <option value="loan">Loan</option>
          <option value="reserved_fund">Reserved Fund</option>
          <option value="transfer">Transfer</option>
          <option value="cash_withdrawal">Cash Withdrawal</option>
          <option value="cash_deposit">Cash Deposit</option>
        </select>
        
        {/* Credit Card Filter */}
        <select
          value={filters.creditCard}
          onChange={(e) => onFiltersChange({ ...filters, creditCard: e.target.value })}
          className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
        >
          <option value="all">All Cards</option>
          {creditCards && creditCards.filter(c => !c.is_gift_card).length > 0 && (
            <optgroup label="💳 Credit Cards">
              {creditCards.filter(c => !c.is_gift_card).map(card => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </optgroup>
          )}
          {creditCards && creditCards.filter(c => c.is_gift_card).length > 0 && (
            <optgroup label="🎁 Gift Cards">
              {creditCards.filter(c => c.is_gift_card).map(card => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {/* Loan Filter */}
        <select
          value={filters.loan}
          onChange={(e) => onFiltersChange({ ...filters, loan: e.target.value })}
          className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
        >
          <option value="all">All Loans</option>
          {loans && loans.map(loan => (
            <option key={loan.id} value={loan.id}>
              {loan.name}
            </option>
          ))}
        </select>

        {/* Bank Account Filter */}
        <select
          value={filters.bankAccount}
          onChange={(e) => onFiltersChange({ ...filters, bankAccount: e.target.value })}
          className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
        >
          <option value="all">All Accounts</option>
          {bankAccounts && bankAccounts.map(account => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        {/* Reserved Fund Filter */}
        <select
          value={filters.reservedFund}
          onChange={(e) => onFiltersChange({ ...filters, reservedFund: e.target.value })}
          className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
        >
          <option value="all">All Funds</option>
          {reservedFunds && reservedFunds.map(fund => (
            <option key={fund.id} value={fund.id}>
              {fund.name}
            </option>
          ))}
        </select>

        {/* Date From */}
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
          className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          placeholder="From"
        />

        {/* Date To */}
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
          className={`px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'}`}
          placeholder="To"
        />
      </div>
    </div>
  );
}
