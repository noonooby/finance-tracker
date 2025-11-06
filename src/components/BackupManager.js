/**
 * Backup & Bulk Update Section Component
 * Provides UI for full backup/restore and bulk transaction editing
 */

import React, { useState } from 'react';
import { Download, Upload, FileSpreadsheet, Database, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadBackup, importFullBackup, getBackupStats } from '../utils/backup/backupManager';
import { exportTransactionsForEdit, importEditedTransactions } from '../utils/backup/bulkTransactionUpdate';
import { downloadTransactionTemplate, importNewTransactions } from '../utils/backup/bulkTransactionUpload';

export default function BackupManager() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);

  // Load stats on mount
  React.useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await getBackupStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  // Full Backup Export
  const handleExportBackup = async () => {
    setLoading(true);
    try {
      const result = await downloadBackup();
      toast.success(
        `Backup downloaded\n${result.stats.totalRecords} records exported`,
        { duration: 4000 }
      );
    } catch (error) {
      toast.error('Failed to export backup\n' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Download Blank Template
  const handleDownloadTemplate = async () => {
    setLoading(true);
    try {
      const result = await downloadTransactionTemplate();
      toast.success(
        'Template downloaded\nFill in your transactions and upload back',
        { duration: 4000 }
      );
    } catch (error) {
      toast.error('Failed to download template\n' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Import New Transactions
  const handleUploadTransactions = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      // Dry run to show preview
      const preview = await importNewTransactions(file, { dryRun: true });
      setUploadPreview({ file, preview });
      e.target.value = '';
    } catch (error) {
      toast.error('Failed to process file\n' + error.message);
      e.target.value = '';
    } finally {
      setLoading(false);
    }
  };

  // Confirm and apply upload
  const confirmUploadTransactions = async () => {
    if (!uploadPreview) return;

    setLoading(true);
    try {
      const result = await importNewTransactions(uploadPreview.file, { dryRun: false });

      if (result.errors > 0) {
        toast.error(
          `Added ${result.inserted} transactions\n${result.errors} errors occurred`,
          { duration: 5000 }
        );
      } else {
        toast.success(
          `Successfully added ${result.inserted} new transactions`,
          { duration: 4000 }
        );
      }

      setUploadPreview(null);
      window.location.reload();
    } catch (error) {
      toast.error('Upload failed\n' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Full Backup Import
  const handleImportBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      '⚠️ WARNING: This will replace ALL your current data.\n\n' +
      'Current data will be permanently deleted.\n' +
      'Make sure you have a backup before proceeding.\n\n' +
      'Continue?'
    );

    if (!confirmed) {
      e.target.value = '';
      return;
    }

    setLoading(true);
    try {
      const result = await importFullBackup(file, { clearExisting: true });
      toast.success(
        `Import complete\n${result.stats.totalImported} records restored`,
        { duration: 5000 }
      );
      await loadStats();
      window.location.reload(); // Reload to refresh all data
    } catch (error) {
      toast.error('Import failed\n' + error.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  // Export Transactions for Bulk Edit
  const handleExportTransactions = async () => {
    setLoading(true);
    try {
      const result = await exportTransactionsForEdit();
      toast.success(
        `Exported ${result.count} transactions\nEdit in Excel and import back`,
        { duration: 4000 }
      );
    } catch (error) {
      toast.error('Export failed\n' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Import Edited Transactions (with preview)
  const handleImportTransactions = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      // First, dry run to show preview
      const preview = await importEditedTransactions(file, { dryRun: true });
      setImportPreview({ file, preview });
      e.target.value = '';
    } catch (error) {
      toast.error('Failed to process file\n' + error.message);
      e.target.value = '';
    } finally {
      setLoading(false);
    }
  };

  // Confirm and apply transaction import
  const confirmImportTransactions = async () => {
    if (!importPreview) return;

    setLoading(true);
    try {
      const result = await importEditedTransactions(importPreview.file, { dryRun: false });
      
      if (result.errors > 0) {
        toast.error(
          `Updated ${result.updated} transactions\n${result.errors} errors occurred`,
          { duration: 5000 }
        );
      } else {
        toast.success(
          `Successfully updated ${result.updated} transactions`,
          { duration: 4000 }
        );
      }
      
      setImportPreview(null);
      window.location.reload(); // Reload to refresh transactions
    } catch (error) {
      toast.error('Import failed\n' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Full Backup Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-3 mb-4">
          <Database className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Complete backup & restore
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Export or import all your data including transactions, activities, settings, and more
            </p>
          </div>
        </div>

        {stats && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Current data: <span className="font-semibold text-gray-900 dark:text-white">{stats.total.toLocaleString()}</span> total records
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 text-xs text-gray-500 dark:text-gray-500">
              <div>{stats.transactions} transactions</div>
              <div>{stats.activities} activities</div>
              <div>{stats.credit_cards} credit cards</div>
              <div>{stats.loans} loans</div>
              <div>{stats.bank_accounts} bank accounts</div>
              <div>{stats.categories} categories</div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExportBackup}
            disabled={loading}
            className="flex-1 btn-secondary flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export backup
          </button>

          <label className="flex-1 btn-primary flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            Import backup
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              disabled={loading}
              className="hidden"
            />
          </label>
        </div>

        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Importing a backup will <strong>replace all current data</strong>. Make sure to export a backup first.
          </p>
        </div>
      </div>

      {/* Bulk Upload New Transactions Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-3 mb-4">
          <FileSpreadsheet className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Bulk upload new transactions
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Download template, fill in multiple transactions at once, then upload to add them all
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleDownloadTemplate}
              disabled={loading}
              className="flex-1 btn-secondary flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download template
            </button>

            <label className="flex-1 btn-primary flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              Upload filled template
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleUploadTransactions}
                disabled={loading}
                className="hidden"
              />
            </label>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
            <div className="text-xs text-purple-900 dark:text-purple-100 space-y-1">
              <div className="font-semibold">How it works:</div>
              <div>1. Download blank template Excel file</div>
              <div>2. Fill in: Date, Amount, Description (Type & Category auto-detected)</div>
              <div>3. Upload the file to add all transactions at once</div>
              <div className="mt-2 text-purple-700 dark:text-purple-300">✨ Smart auto-detection learns from your descriptions!</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Transaction Edit Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-3 mb-4">
          <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Bulk transaction updates
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Export transactions to Excel, edit multiple records at once, then import back
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExportTransactions}
              disabled={loading}
              className="flex-1 btn-secondary flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export to Excel
            </button>

            <label className="flex-1 btn-primary flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              Import edited file
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportTransactions}
                disabled={loading}
                className="hidden"
              />
            </label>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="text-xs text-blue-900 dark:text-blue-100 space-y-1">
              <div className="font-semibold">How it works:</div>
              <div>1. Export transactions to Excel file</div>
              <div>2. Edit date, amount, description, category, notes, etc.</div>
              <div>3. Save the Excel file</div>
              <div>4. Import the file back to apply changes</div>
            </div>
          </div>
        </div>
      </div>

      {/* Import Preview Modal */}
      {importPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Confirm import
            </h3>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {importPreview.preview.updates} changes detected
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Ready to apply
                  </div>
                </div>
              </div>

              {importPreview.preview.errors > 0 && (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {importPreview.preview.errors} errors found
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      These rows will be skipped
                    </div>
                  </div>
                </div>
              )}

              {/* Preview sample */}
              {importPreview.preview.preview?.toUpdate?.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Sample changes:
                  </div>
                  {importPreview.preview.preview.toUpdate.slice(0, 3).map((u, i) => (
                    <div key={i} className="text-gray-600 dark:text-gray-400">
                      • {Object.keys(u).filter(k => k !== 'id').join(', ')}
                    </div>
                  ))}
                  {importPreview.preview.updates > 3 && (
                    <div className="text-gray-500 dark:text-gray-500 mt-1">
                      ...and {importPreview.preview.updates - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setImportPreview(null)}
                className="flex-1 btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={confirmImportTransactions}
                className="flex-1 btn-primary"
                disabled={loading}
              >
                {loading ? 'Applying...' : 'Apply changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Preview Modal */}
      {uploadPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Confirm upload
            </h3>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {uploadPreview.preview.valid} valid transactions
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Ready to add
                  </div>
                </div>
              </div>

              {uploadPreview.preview.errors > 0 && (
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {uploadPreview.preview.errors} errors found
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      These rows will be skipped
                    </div>
                  </div>
                </div>
              )}

              {/* Preview sample */}
              {uploadPreview.preview.preview?.transactions?.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Sample transactions:
                  </div>
                  {uploadPreview.preview.preview.transactions.slice(0, 3).map((t, i) => (
                    <div key={i} className="text-gray-600 dark:text-gray-400 mb-1">
                      • {t.date}: ${t.amount} - {t.description || 'No description'}
                      {t.autoDetected?.type && <span className="text-purple-600 dark:text-purple-400 ml-1">(type detected)</span>}
                      {t.autoDetected?.category && <span className="text-purple-600 dark:text-purple-400 ml-1">(category matched)</span>}
                    </div>
                  ))}
                  {uploadPreview.preview.valid > 3 && (
                    <div className="text-gray-500 dark:text-gray-500 mt-1">
                      ...and {uploadPreview.preview.valid - 3} more
                    </div>
                  )}
                </div>
              )}

              {/* Error preview */}
              {uploadPreview.preview.preview?.errors?.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-amber-700 dark:text-amber-300 mb-2">
                    Sample errors:
                  </div>
                  {uploadPreview.preview.preview.errors.slice(0, 3).map((e, i) => (
                    <div key={i} className="text-amber-600 dark:text-amber-400">
                      Row {e.row}: {e.error}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setUploadPreview(null)}
                className="flex-1 btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={confirmUploadTransactions}
                className="flex-1 btn-primary"
                disabled={loading}
              >
                {loading ? 'Adding...' : 'Add transactions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
