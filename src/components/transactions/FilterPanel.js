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
    <div className={`bg-surface rounded-2xl p-4 space-y-4`}>
      {/* Search and Clear */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 mr-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted" size={20} />
          <input
            type="text"
            placeholder="Search transactions..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className={`w-full pl-10 pr-4 py-2 border rounded-2xl border-line bg-surface-2 text-fg`}
          />
        </div>
        <button
          onClick={onClearFilters}
          className={`px-4 py-2 rounded-lg text-sm ${
            'bg-surface-2 hover:bg-line/60 text-fg'
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
          className={`px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
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
          className={`px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {/* Payment Method Filter */}
        <select
          value={filters.paymentMethod}
          onChange={(e) => onFiltersChange({ ...filters, paymentMethod: e.target.value })}
          className={`px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
        >
          <option value="all">All Methods</option>
          <option value="bank_account">Account (cash included)</option>
          <option value="credit_card">Credit Card</option>
          <option value="loan">Loan</option>
          <option value="transfer">Transfer</option>
        </select>
        
        {/* Credit Card Filter */}
        <select
          value={filters.creditCard}
          onChange={(e) => onFiltersChange({ ...filters, creditCard: e.target.value })}
          className={`px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
        >
          <option value="all">All Cards</option>
          {creditCards && creditCards.filter(c => !c.is_gift_card).length > 0 && (
            <optgroup label="Credit Cards">
              {creditCards.filter(c => !c.is_gift_card).map(card => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </optgroup>
          )}
          {creditCards && creditCards.filter(c => c.is_gift_card).length > 0 && (
            <optgroup label="Gift Cards">
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
          className={`px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
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
          className={`px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
        >
          <option value="all">All Accounts</option>
          {bankAccounts && bankAccounts.map(account => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        {/* Date From */}
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
          className={`px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
          placeholder="From"
        />

        {/* Date To */}
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
          className={`px-3 py-2 border rounded-xl border-line bg-surface-2 text-fg`}
          placeholder="To"
        />
      </div>
    </div>
  );
}
