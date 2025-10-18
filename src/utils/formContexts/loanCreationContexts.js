import { BaseContextManager } from './BaseContextManager';
import { CONTEXT_CONFIGS } from './contextConfig';
import { contextToFormData, formDataToContext, validateContext } from './shared';

const manager = new BaseContextManager(
  CONTEXT_CONFIGS.loanCreation.tableName,
  CONTEXT_CONFIGS.loanCreation.triggerField
);

const FIELD_MAPPING = CONTEXT_CONFIGS.loanCreation.formMapping;

export async function getLoanCreationContext(loanName) {
  if (!loanName?.trim()) return null;
  return await manager.getContext(loanName.trim());
}

export async function saveLoanCreationContext(loanName, formData) {
  if (!loanName?.trim()) throw new Error('Loan name required');
  const context = formDataToContext(formData, FIELD_MAPPING);
  const errors = validateContext(context, CONTEXT_CONFIGS.loanCreation.contextFields);
  if (errors.length > 0) throw new Error(`Invalid context: ${errors.join(', ')}`);
  return await manager.saveContext(loanName.trim(), context);
}

export async function getRecentLoanNames(limit = 5) {
  return await manager.getRecentTriggers(limit);
}

export async function getLastUsedLoanContext() {
  return await manager.getMostRecentContext();
}

export async function deleteLoanCreationContext(loanName) {
  if (!loanName?.trim()) throw new Error('Loan name required');
  return await manager.deleteContext(loanName.trim());
}

export function applyLoanCreationContext(context) {
  if (!context) return {};
  return contextToFormData(context, FIELD_MAPPING);
}
