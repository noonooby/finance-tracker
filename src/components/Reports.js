import React, { useState, useEffect } from 'react';
import { BarChart3, FileText, Settings, Save, Star, Trash2, Copy, FolderOpen } from 'lucide-react';
import { dbOperation, getAllBankAccounts } from '../utils/db';
import MonthlySummary from './reports/templates/MonthlySummary';
import CategoryAnalysis from './reports/templates/CategoryAnalysis';
import PaymentMethodAnalysis from './reports/templates/PaymentMethodAnalysis';
import CashflowAnalysis from './reports/templates/CashflowAnalysis';
import AnnualReview from './reports/templates/AnnualReview';
import { exportToExcel } from '../utils/exportToExcel';
import { exportToCSV } from '../utils/exportToCSV';
import {
  getAllReportTemplates,
  saveReportTemplate,
  deleteReportTemplate,
  toggleReportTemplateFavorite,
  trackReportTemplateUsage,
  duplicateReportTemplate
} from '../utils/reportTemplatesManager';

export default function Reports({ darkMode, categories, cashInHand = 0 }) {
  const [transactions, setTransactions] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('quick'); // 'quick' or 'builder'
  const [activeTemplate, setActiveTemplate] = useState('monthly'); // 'monthly', 'category', 'payment', 'cashflow', 'annual'
  
  // Template management state
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    loadData();
    loadSavedTemplates();
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

  const loadSavedTemplates = async () => {
    try {
      const templates = await getAllReportTemplates();
      setSavedTemplates(templates);
    } catch (error) {
      console.error('Error loading saved templates:', error);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      setSaveError('Template name is required');
      return;
    }

    try {
      setSaveError('');
      const templateData = {
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        template_type: activeTemplate,
        is_favorite: saveAsFavorite,
        filters: {}, // Can be extended to save current filter state
        layout: {} // Can be extended to save layout configuration
      };

      await saveReportTemplate(templateData);
      await loadSavedTemplates();
      
      // Reset and close
      setTemplateName('');
      setTemplateDescription('');
      setSaveAsFavorite(false);
      setShowSaveDialog(false);
      
      alert(`✅ Template "${templateData.name}" saved successfully!`);
    } catch (error) {
      console.error('Error saving template:', error);
      setSaveError(error.message || 'Failed to save template');
    }
  };

  const handleLoadTemplate = async (template) => {
    try {
      // Track usage
      await trackReportTemplateUsage(template.id);
      
      // Load the template
      setActiveTemplate(template.template_type);
      
      // Update local state
      await loadSavedTemplates();
      
      console.log('📂 Template loaded:', template.name);
    } catch (error) {
      console.error('Error loading template:', error);
    }
  };

  const handleToggleFavorite = async (template) => {
    try {
      await toggleReportTemplateFavorite(template.id, !template.is_favorite);
      await loadSavedTemplates();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Are you sure you want to delete "${template.name}"?`)) {
      return;
    }

    try {
      await deleteReportTemplate(template.id);
      await loadSavedTemplates();
      alert('🗑️ Template deleted successfully');
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const handleDuplicateTemplate = async (template) => {
    try {
      await duplicateReportTemplate(template.id);
      await loadSavedTemplates();
      alert(`✅ Template duplicated successfully!`);
    } catch (error) {
      console.error('Error duplicating template:', error);
      alert('Failed to duplicate template');
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

  const getTemplateIcon = (type) => {
    switch (type) {
      case 'monthly': return '📅';
      case 'category': return '🏷️';
      case 'payment': return '💳';
      case 'cashflow': return '💰';
      case 'annual': return '📊';
      default: return '📄';
    }
  };

  const getTemplateLabel = (type) => {
    switch (type) {
      case 'monthly': return 'Monthly Summary';
      case 'category': return 'Category Analysis';
      case 'payment': return 'Payment Methods';
      case 'cashflow': return 'Cashflow Analysis';
      case 'annual': return 'Annual Review';
      default: return 'Custom Report';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading reports...</div>
      </div>
    );
  }

  // Organize templates by type
  const templatesByType = savedTemplates.reduce((acc, template) => {
    if (!acc[template.template_type]) {
      acc[template.template_type] = [];
    }
    acc[template.template_type].push(template);
    return acc;
  }, {});

  const favoriteTemplates = savedTemplates.filter(t => t.is_favorite);

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
        
        <div className="flex gap-2">
          <button
            onClick={() => setShowTemplatesPanel(!showTemplatesPanel)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              showTemplatesPanel
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            <FolderOpen size={18} />
            Saved Templates
            {savedTemplates.length > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                showTemplatesPanel ? 'bg-blue-500' : 'bg-blue-600 text-white'
              }`}>
                {savedTemplates.length}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setShowSaveDialog(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              darkMode
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            <Save size={18} />
            Save Template
          </button>
        </div>
      </div>

      {/* Saved Templates Panel */}
      {showTemplatesPanel && savedTemplates.length > 0 && (
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-md p-6`}>
          <h2 className="text-lg font-semibold mb-4">Your Saved Templates</h2>
          
          {/* Favorites Section */}
          {favoriteTemplates.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 mb-3 flex items-center gap-2">
                <Star size={16} className="fill-current" />
                Favorites
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {favoriteTemplates.map(template => (
                  <div
                    key={template.id}
                    className={`p-3 rounded-lg border-2 ${
                      darkMode
                        ? 'border-yellow-600/50 bg-yellow-900/10'
                        : 'border-yellow-200 bg-yellow-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getTemplateIcon(template.template_type)}</span>
                        <div>
                          <h4 className="font-semibold text-sm">{template.name}</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {getTemplateLabel(template.template_type)}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {template.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                        {template.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                      <span>Used {template.use_count || 0} times</span>
                      {template.last_used && (
                        <span>
                          {new Date(template.last_used).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleLoadTemplate(template)}
                        className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleToggleFavorite(template)}
                        className="px-2 py-1 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700"
                        title="Remove from favorites"
                      >
                        <Star size={12} className="fill-current" />
                      </button>
                      <button
                        onClick={() => handleDuplicateTemplate(template)}
                        className={`px-2 py-1 rounded text-xs ${
                          darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                        title="Duplicate"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template)}
                        className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* All Templates by Type */}
          <div className="space-y-4">
            {Object.entries(templatesByType).map(([type, templates]) => (
              <div key={type}>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {getTemplateIcon(type)} {getTemplateLabel(type)}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {templates.map(template => (
                    <div
                      key={template.id}
                      className={`p-3 rounded-lg border ${
                        darkMode
                          ? 'border-gray-700 hover:border-gray-600'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-sm">{template.name}</h4>
                        {template.is_favorite && (
                          <Star size={14} className="text-yellow-500 fill-current flex-shrink-0" />
                        )}
                      </div>
                      
                      {template.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                          {template.description}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                        <span>Used {template.use_count || 0} times</span>
                        {template.last_used && (
                          <span>
                            {new Date(template.last_used).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleLoadTemplate(template)}
                          className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleToggleFavorite(template)}
                          className={`px-2 py-1 rounded text-xs ${
                            template.is_favorite
                              ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                              : darkMode
                              ? 'bg-gray-700 hover:bg-gray-600'
                              : 'bg-gray-200 hover:bg-gray-300'
                          }`}
                          title={template.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star size={12} className={template.is_favorite ? 'fill-current' : ''} />
                        </button>
                        <button
                          onClick={() => handleDuplicateTemplate(template)}
                          className={`px-2 py-1 rounded text-xs ${
                            darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                          }`}
                          title="Duplicate"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template)}
                          className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Template Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-md w-full`}>
            <h3 className="text-xl font-bold mb-4">Save Report Template</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Template Name *</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => {
                    setTemplateName(e.target.value);
                    setSaveError('');
                  }}
                  placeholder="e.g., Monthly Expenses Q4 2024"
                  className={`w-full px-3 py-2 border rounded-lg ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'border-gray-300'
                  }`}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Description (Optional)</label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Add a description for this template..."
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-lg ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'border-gray-300'
                  }`}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="saveAsFavorite"
                  checked={saveAsFavorite}
                  onChange={(e) => setSaveAsFavorite(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="saveAsFavorite" className="text-sm flex items-center gap-1">
                  <Star size={14} className={saveAsFavorite ? 'text-yellow-500 fill-current' : ''} />
                  Mark as favorite
                </label>
              </div>
              
              <div className={`p-3 rounded-lg ${
                darkMode ? 'bg-gray-700' : 'bg-gray-100'
              }`}>
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getTemplateIcon(activeTemplate)}</span>
                    <span className="font-semibold">{getTemplateLabel(activeTemplate)}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    This template will save your current report type
                  </p>
                </div>
              </div>
              
              {saveError && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  {saveError}
                </div>
              )}
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setTemplateName('');
                  setTemplateDescription('');
                  setSaveAsFavorite(false);
                  setSaveError('');
                }}
                className={`flex-1 px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-gray-700 hover:bg-gray-600'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

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
