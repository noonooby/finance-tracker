import React, { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';

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
  onClearFilters
}) {
  const [open, setOpen] = useState(false);
  const on = ['type', 'category', 'paymentMethod', 'creditCard', 'loan', 'bankAccount'].filter((k) => filters[k] && filters[k] !== 'all').length + (filters.dateFrom ? 1 : 0) + (filters.dateTo ? 1 : 0);
  return (
    <div className="space-y-3">
      {/* Search is always there; the rest opens when asked for */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={18} aria-hidden="true" />
          <input type="search" inputMode="search" enterKeyHint="search" autoComplete="off" placeholder="Search" aria-label="Search transactions"
            value={filters.search} onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="w-full pl-10 pr-4 py-2.5 border rounded-2xl border-line bg-surface text-fg focus:border-accent focus:ring-4 focus:ring-accent/15 outline-none" />
        </div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className={`press shrink-0 inline-flex items-center gap-1.5 h-12 px-4 rounded-2xl border text-sm font-semibold ${open || on > 0 ? 'bg-accent-soft text-accent border-accent/30' : 'bg-surface border-line text-fg'}`}>
          <SlidersHorizontal size={17} aria-hidden="true" /> Filters{on > 0 ? ` (${on})` : ''}
        </button>
      </div>

      <div className={`fold ${open ? 'open' : ''}`}><div>
      <div className="card border border-line bg-surface p-3 space-y-3">
      {/* Filter Dropdowns */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {/* Type Filter */}
        <select
          value={filters.type}
          onChange={(e) => onFiltersChange({ ...filters, type: e.target.value })}
          className="min-w-0 w-full px-3 py-2 border border-line bg-surface-2 text-fg text-sm"
        >
          <option value="all">Any kind</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="payment">Payments</option>
        </select>

        {/* Category Filter */}
        <select
          value={filters.category}
          onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
          className="min-w-0 w-full px-3 py-2 border border-line bg-surface-2 text-fg text-sm"
        >
          <option value="all">Any category</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {/* Payment Method Filter */}
        <select
          value={filters.paymentMethod}
          onChange={(e) => onFiltersChange({ ...filters, paymentMethod: e.target.value })}
          className="min-w-0 w-full px-3 py-2 border border-line bg-surface-2 text-fg text-sm"
        >
          <option value="all">Paid any way</option>
          <option value="bank_account">Account (cash included)</option>
          <option value="credit_card">Credit Card</option>
          <option value="loan">Loan</option>
          <option value="transfer">Transfer</option>
        </select>
        
        {/* Credit Card Filter */}
        <select
          value={filters.creditCard}
          onChange={(e) => onFiltersChange({ ...filters, creditCard: e.target.value })}
          className="min-w-0 w-full px-3 py-2 border border-line bg-surface-2 text-fg text-sm"
        >
          <option value="all">Any card</option>
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
          className="min-w-0 w-full px-3 py-2 border border-line bg-surface-2 text-fg text-sm"
        >
          <option value="all">Any loan</option>
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
          className="min-w-0 w-full px-3 py-2 border border-line bg-surface-2 text-fg text-sm"
        >
          <option value="all">Any account</option>
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
          className="min-w-0 w-full px-3 py-2 border border-line bg-surface-2 text-fg text-sm"
          aria-label="From day"
        />

        {/* Date To */}
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
          className="min-w-0 w-full px-3 py-2 border border-line bg-surface-2 text-fg text-sm"
          aria-label="To day"
        />
      </div>
        {on > 0 && <button type="button" onClick={onClearFilters} className="text-sm font-medium text-accent px-1">Clear filters</button>}
      </div>
      </div></div>
    </div>
  );
}
