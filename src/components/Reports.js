import React, { useState, useEffect } from 'react';
import { BarChart3, FileText, Settings, Plus } from 'lucide-react';
import { dbOperation, getAllBankAccounts } from '../utils/db';
import MonthlySummary from './reports/templates/MonthlySummary';
import CategoryAnalysis from './reports/templates/CategoryAnalysis';
import PaymentMethodAnalysis from './reports/templates/PaymentMethodAnalysis';
import CashflowAnalysis from './reports/templates/CashflowAnalysis';
import AnnualReview from './reports/templates/AnnualReview';
import { exportToExcel } from '../utils/exportToExcel';
import { exportToCSV } from '../utils/exportToCSV';

export default function Reports({ darkMode, categories, cashInHand = 0 }) {
  const [transactions, setTransactions] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('quick'); // 'quick' or 'builder'
  const [activeTemplate, setActiveTemplate] = useState('monthly'); // 'monthly', 'category', 'payment', 'cashflow', 'annual'

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allTransactions, accounts] = await Promise.all([
        dbOperation('transactions', 'getAll'),
        getAllBankAccounts()
      ]);
      setTransactions(allTransactions);
      setBankAccounts(accounts || []);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = (reportData) => {
    try {
      exportToExcel(reportData);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel. Please try again.');
    }
  };

  const handleExportCSV = (reportData) => {
    try {
      exportToCSV(reportData);
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      alert('Failed to export to CSV. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={32} className="text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Analyze your financial data with customizable reports
            </p>
          </div>
        </div>
      </div>

      {/* View Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveView('quick')}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
            activeView === 'quick'
              ? 'bg-blue-600 text-white'
              : darkMode
              ? 'bg-gray-700 hover:bg-gray-600'
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          <FileText size={18} />
          Quick Reports
        </button>
        <button
          onClick={() => setActiveView('builder')}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
            activeView === 'builder'
              ? 'bg-blue-600 text-white'
              : darkMode
              ? 'bg-gray-700 hover:bg-gray-600'
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
          disabled
        >
          <Settings size={18} />
          Report Builder
          <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded">Coming Soon</span>
        </button>
      </div>

      {/* Quick Reports View */}
      {activeView === 'quick' && (
        <div className="space-y-6">
          {/* Template Selector */}
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
            <h2 className="text-lg font-semibold mb-4">Select Report Template</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={() => setActiveTemplate('monthly')}
                className={`p-4 rounded-lg border-2 transition-colors text-left ${
                  activeTemplate === 'monthly'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : darkMode
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">📅</span>
                  <h3 className="font-semibold">Monthly Summary</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Complete overview of income, expenses, and trends
                </p>
              </button>

              <button
                onClick={() => setActiveTemplate('category')}
                className={`p-4 rounded-lg border-2 transition-colors text-left ${
                  activeTemplate === 'category'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : darkMode
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🏷️</span>
                  <h3 className="font-semibold">Category Analysis</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Deep dive into spending by category
                </p>
              </button>

              <button
                onClick={() => setActiveTemplate('payment')}
                className={`p-4 rounded-lg border-2 transition-colors text-left ${
                  activeTemplate === 'payment'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : darkMode
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">💳</span>
                  <h3 className="font-semibold">Payment Methods</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Track usage across payment methods
                </p>
              </button>

              <button
                onClick={() => setActiveTemplate('cashflow')}
                className={`p-4 rounded-lg border-2 transition-colors text-left ${
                  activeTemplate === 'cashflow'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : darkMode
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">💰</span>
                  <h3 className="font-semibold">Cashflow Analysis</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Monitor money movement and balances
                </p>
              </button>

              <button
                onClick={() => setActiveTemplate('annual')}
                className={`p-4 rounded-lg border-2 transition-colors text-left ${
                  activeTemplate === 'annual'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : darkMode
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">📊</span>
                  <h3 className="font-semibold">Annual Review</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Year-over-year comparison and insights
                </p>
              </button>
            </div>
          </div>

          {/* Active Report */}
          {activeTemplate === 'monthly' && (
            <MonthlySummary
              darkMode={darkMode}
              transactions={transactions}
              categories={categories}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}

          {activeTemplate === 'category' && (
            <CategoryAnalysis
              darkMode={darkMode}
              transactions={transactions}
              categories={categories}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}

          {activeTemplate === 'payment' && (
            <PaymentMethodAnalysis
              darkMode={darkMode}
              transactions={transactions}
              categories={categories}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}

          {activeTemplate === 'cashflow' && (
            <CashflowAnalysis
              darkMode={darkMode}
              transactions={transactions}
              categories={categories}
              bankAccounts={bankAccounts}
              cashInHand={cashInHand}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}

          {activeTemplate === 'annual' && (
            <AnnualReview
              darkMode={darkMode}
              transactions={transactions}
              categories={categories}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}
        </div>
      )}

      {/* Report Builder View */}
      {activeView === 'builder' && (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-8 text-center`}>
          <div className="max-w-md mx-auto">
            <Settings size={64} className="mx-auto mb-4 text-gray-400" />
            <h2 className="text-2xl font-bold mb-2">Report Builder Coming Soon</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The drag-and-drop report builder is under development. You'll soon be able to create fully customized reports with your choice of widgets, charts, and data visualizations.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-left">
              <h3 className="font-semibold mb-2">Planned Features:</h3>
              <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                <li>✓ Drag and drop widgets</li>
                <li>✓ Resize and rearrange elements</li>
                <li>✓ Custom chart configurations</li>
                <li>✓ Save report templates</li>
                <li>✓ Schedule automated reports</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
