import React, { useState, useEffect } from 'react';
import { ask } from '../utils/confirm';
import { 
  
  FileText, 
  Save, 
  Star, 
  Trash2, 
  Copy, 
  FolderOpen,
  Calendar,
  Tag,
  CreditCard as CreditCardIcon,
  DollarSign,
  TrendingUp
} from 'lucide-react';
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
import { showToast } from '../utils/toast';

export default function Reports({ categories }) {
  const [transactions, setTransactions] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const activeView = 'quick';
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
      
      showToast.success(`Template "${templateData.name}" saved`);
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
    if (!(await ask(`Delete "${template.name}"?`))) {
      return;
    }

    try {
      await deleteReportTemplate(template.id);
      await loadSavedTemplates();
      showToast.success('Template deleted');
    } catch (error) {
      console.error('Error deleting template:', error);
      showToast.error('Failed to delete template');
    }
  };

  const handleDuplicateTemplate = async (template) => {
    try {
      await duplicateReportTemplate(template.id);
      await loadSavedTemplates();
      showToast.success(`Template duplicated`);
    } catch (error) {
      console.error('Error duplicating template:', error);
      showToast.error('Failed to duplicate template');
    }
  };

  const handleExportExcel = async (reportData) => {
    try {
      await exportToExcel(reportData);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      showToast.error(`Could not export to Excel: ${error?.message || 'try again'}`);
    }
  };

  const handleExportCSV = (reportData) => {
    try {
      exportToCSV(reportData);
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      showToast.error(`Could not export to CSV: ${error?.message || 'try again'}`);
    }
  };

  const getTemplateIcon = (type) => {
    switch (type) {
      case 'monthly': return Calendar;
      case 'category': return Tag;
      case 'payment': return CreditCardIcon;
      case 'cashflow': return DollarSign;
      case 'annual': return TrendingUp;
      default: return FileText;
    }
  };

  const getTemplateLabel = (type) => {
    switch (type) {
      case 'monthly': return 'Monthly summary';
      case 'category': return 'Category analysis';
      case 'payment': return 'Payment methods';
      case 'cashflow': return 'Cashflow analysis';
      case 'annual': return 'Annual review';
      default: return 'Custom report';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading reports...</div>
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
            <p className="text-sm text-muted">
              Where your money went, by month, category and account.
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowTemplatesPanel(!showTemplatesPanel)}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base rounded-xl font-medium transition-colors ${
              showTemplatesPanel
                ? 'bg-accent text-accent-contrast'
                : 'bg-surface-2 hover:bg-line/60 text-fg'
            }`}
          >
            <FolderOpen size={18} />
            Saved templates
            {savedTemplates.length > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                showTemplatesPanel ? 'bg-accent-contrast/20' : 'bg-accent text-accent-contrast'
              }`}>
                {savedTemplates.length}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base rounded-xl font-medium transition-colors bg-surface-2 hover:bg-line/60 text-fg"
          >
            <Save size={18} />
            Save template
          </button>
        </div>
      </div>

      {/* Saved templates Panel */}
      {showTemplatesPanel && savedTemplates.length > 0 && (
        <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Your saved templates</h2>
          
          {/* Favorites Section */}
          {favoriteTemplates.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-warning mb-3 flex items-center gap-2">
                <Star size={16} className="fill-current" />
                Favorites
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {favoriteTemplates.map(template => (
                  <div
                    key={template.id}
                    className="p-3 rounded-xl border-2 border-warning/30 bg-warning/10"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const IconComponent = getTemplateIcon(template.template_type);
                          return <IconComponent size={18} className="text-muted" />;
                        })()}
                        <div>
                          <h4 className="font-semibold text-sm">{template.name}</h4>
                          <p className="text-xs text-muted">
                            {getTemplateLabel(template.template_type)}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {template.description && (
                      <p className="text-xs text-muted mb-2">
                        {template.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-xs text-muted mb-2">
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
                        className="flex-1 px-2 py-1 bg-accent text-accent-contrast rounded text-xs hover:opacity-90"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleToggleFavorite(template)}
                        className="px-2 py-1 bg-warning text-white rounded text-xs hover:opacity-90"
                        title="Remove from favorites"
                      >
                        <Star size={12} className="fill-current" />
                      </button>
                      <button
                        onClick={() => handleDuplicateTemplate(template)}
                        className="px-2 py-1 rounded text-xs bg-surface-2 hover:bg-line/60"
                        title="Duplicate"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template)}
                        className="px-2 py-1 press bg-negative text-white rounded text-xs hover:opacity-90"
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
                <h3 className="text-sm font-semibold text-fg mb-2 flex items-center gap-2">
                  {(() => {
                    const IconComponent = getTemplateIcon(type);
                    return <IconComponent size={16} className="text-muted" />;
                  })()}
                  {getTemplateLabel(type)}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {templates.map(template => (
                    <div
                      key={template.id}
                      className="p-3 rounded-xl border border-line hover:border-accent"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-sm">{template.name}</h4>
                        {template.is_favorite && (
                          <Star size={14} className="text-warning fill-current flex-shrink-0" />
                        )}
                      </div>
                      
                      {template.description && (
                        <p className="text-xs text-muted mb-2">
                          {template.description}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between text-xs text-muted mb-2">
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
                          className="flex-1 px-2 py-1 bg-accent text-accent-contrast rounded text-xs hover:opacity-90"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleToggleFavorite(template)}
                          className={`px-2 py-1 rounded text-xs ${
                            template.is_favorite
                              ? 'press bg-accent text-accent-contrast hover:opacity-90'
                              : 'bg-surface-2 hover:bg-line/60'
                          }`}
                          title={template.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star size={12} className={template.is_favorite ? 'fill-current' : ''} />
                        </button>
                        <button
                          onClick={() => handleDuplicateTemplate(template)}
                          className="px-2 py-1 rounded text-xs bg-surface-2 hover:bg-line/60"
                          title="Duplicate"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template)}
                          className="px-2 py-1 press bg-negative text-white rounded text-xs hover:opacity-90"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div role="dialog" aria-modal="true" aria-label="Save report template" className="bg-surface rounded-3xl p-5 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Save report template</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Template name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => {
                    setTemplateName(e.target.value);
                    setSaveError('');
                  }}
                  placeholder="Monthly spending"
                  className="field"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Description (optional)</label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Add a description for this template..."
                  rows={3}
                  className="field"
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
                  <Star size={14} className={saveAsFavorite ? 'text-warning fill-current' : ''} />
                  Mark as favorite
                </label>
              </div>
              
              <div className="p-3 rounded-xl bg-surface-2">
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                  {(() => {
                    const IconComponent = getTemplateIcon(activeTemplate);
                      return <IconComponent size={18} className="text-muted" />;
                  })()}
                  <span className="font-semibold">{getTemplateLabel(activeTemplate)}</span>
                </div>
                  <p className="text-xs text-muted">
                    This template will save your current report type
                  </p>
                </div>
              </div>
              
              {saveError && (
                <div className="p-3 bg-negative/10 text-negative rounded-xl text-sm">
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
                className="flex-1 px-4 py-2 rounded-xl bg-surface-2 hover:bg-line/60"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                className="flex-1 px-4 py-2 press bg-accent text-accent-contrast rounded-xl hover:opacity-90"
              >
                Save template
              </button>
            </div>
          </div>
        </div>
      )}

      {activeView === 'quick' && (
        <div className="space-y-6">
          {/* Template Selector */}
          <div className="card rounded-2xl border border-line bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-4">Choose a report</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={() => setActiveTemplate('monthly')}
                className={`p-4 rounded-xl border-2 transition-colors text-left ${
                  activeTemplate === 'monthly'
                    ? 'border-accent bg-accent-soft'
                    : 'border-line hover:border-accent'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={20} />
                  <h3 className="font-semibold">Monthly summary</h3>
                </div>
                <p className="text-sm text-muted">
                  What came in, what went out and how it changed
                </p>
              </button>

              <button
                onClick={() => setActiveTemplate('category')}
                className={`p-4 rounded-xl border-2 transition-colors text-left ${
                  activeTemplate === 'category'
                    ? 'border-accent bg-accent-soft'
                    : 'border-line hover:border-accent'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Tag size={20} />
                  <h3 className="font-semibold">Category analysis</h3>
                </div>
                <p className="text-sm text-muted">
                  What you spent in each category
                </p>
              </button>

              <button
                onClick={() => setActiveTemplate('payment')}
                className={`p-4 rounded-xl border-2 transition-colors text-left ${
                  activeTemplate === 'payment'
                    ? 'border-accent bg-accent-soft'
                    : 'border-line hover:border-accent'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <CreditCardIcon size={20} />
                  <h3 className="font-semibold">Payment methods</h3>
                </div>
                <p className="text-sm text-muted">
                  Which accounts and cards you paid with
                </p>
              </button>

              <button
                onClick={() => setActiveTemplate('cashflow')}
                className={`p-4 rounded-xl border-2 transition-colors text-left ${
                  activeTemplate === 'cashflow'
                    ? 'border-accent bg-accent-soft'
                    : 'border-line hover:border-accent'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={20} />
                  <h3 className="font-semibold">Cashflow analysis</h3>
                </div>
                <p className="text-sm text-muted">
                  Money in against money out, day by day
                </p>
              </button>

              <button
                onClick={() => setActiveTemplate('annual')}
                className={`p-4 rounded-xl border-2 transition-colors text-left ${
                  activeTemplate === 'annual'
                    ? 'border-accent bg-accent-soft'
                    : 'border-line hover:border-accent'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={20} />
                  <h3 className="font-semibold">Annual review</h3>
                </div>
                <p className="text-sm text-muted">
                  Year-over-year comparison and insights
                </p>
              </button>
            </div>
          </div>

          {/* Active Report */}
          {activeTemplate === 'monthly' && (
            <MonthlySummary
              transactions={transactions}
              categories={categories}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}

          {activeTemplate === 'category' && (
            <CategoryAnalysis
              transactions={transactions}
              categories={categories}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}

          {activeTemplate === 'payment' && (
            <PaymentMethodAnalysis
              transactions={transactions}
              categories={categories}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}

          {activeTemplate === 'cashflow' && (
            <CashflowAnalysis
              transactions={transactions}
              categories={categories}
              bankAccounts={bankAccounts}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}

          {activeTemplate === 'annual' && (
            <AnnualReview
              transactions={transactions}
              categories={categories}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
            />
          )}
        </div>
      )}

    </div>
  );
}
