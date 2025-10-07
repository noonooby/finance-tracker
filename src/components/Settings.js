import React, { useState } from 'react';
import { Settings as SettingsIcon, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { recalculateAvailableCash, validateAvailableCash } from '../utils/helpers';

export default function Settings({ darkMode, onUpdate }) {
  const [recalculating, setRecalculating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [message, setMessage] = useState(null);

  const handleRecalculate = async () => {
    if (!window.confirm('This will recalculate your available cash based on all transactions. Continue?')) {
      return;
    }

    setRecalculating(true);
    setMessage(null);

    try {
      const newCash = await recalculateAvailableCash();
      setMessage({
        type: 'success',
        text: `Available cash recalculated: $${newCash.toFixed(2)}`
      });
      if (onUpdate) await onUpdate();
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error recalculating cash. Please try again.'
      });
    } finally {
      setRecalculating(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setMessage(null);

    try {
      const result = await validateAvailableCash();
      setValidationResult(result);
      setMessage({
        type: result.isValid ? 'success' : 'warning',
        text: result.message
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Error validating cash. Please try again.'
      });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <SettingsIcon size={24} />
        Settings
      </h2>

      {message && (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-800' :
          message.type === 'warning' ? 'bg-yellow-50 text-yellow-800' :
          'bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <p>{message.text}</p>
        </div>
      )}

      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 space-y-4`}>
        <h3 className="text-lg font-semibold">Available Cash Management</h3>
        
        <button
          onClick={handleValidate}
          disabled={validating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-blue-600 hover:bg-blue-50"
        >
          <CheckCircle size={20} className="text-blue-600" />
          <span>{validating ? 'Validating...' : 'Validate Available Cash'}</span>
        </button>

        {validationResult && (
          <div className={`p-4 rounded-lg ${validationResult.isValid ? 'bg-green-50' : 'bg-yellow-50'}`}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Expected:</span>
                <span className="font-mono">${validationResult.expected.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Current:</span>
                <span className="font-mono">${validationResult.actual.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw size={20} className={recalculating ? 'animate-spin' : ''} />
          <span>{recalculating ? 'Recalculating...' : 'Recalculate Available Cash'}</span>
        </button>
      </div>
    </div>
  );
}
