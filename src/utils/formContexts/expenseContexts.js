import { BaseContextManager } from './BaseContextManager';
import { CONTEXT_CONFIGS } from './contextConfig';
import { contextToFormData, formDataToContext, validateContext } from './shared';

const manager = new BaseContextManager(
  CONTEXT_CONFIGS.expense.tableName,
  CONTEXT_CONFIGS.expense.triggerField
);

const FIELD_MAPPING = CONTEXT_CONFIGS.expense.formMapping;

export async function getExpenseContext(description) {
  if (!description?.trim()) return null;
  return await manager.getContext(description.trim());
}

export async function saveExpenseContext(description, formData) {
  if (!description?.trim()) throw new Error('Description required');
  const context = formDataToContext(formData, FIELD_MAPPING);
  const errors = validateContext(context, CONTEXT_CONFIGS.expense.contextFields);
  if (errors.length > 0) throw new Error(`Invalid context: ${errors.join(', ')}`);
  return await manager.saveContext(description.trim(), context);
}

export async function getRecentExpenseDescriptions(limit = 5) {
  return await manager.getRecentTriggers(limit);
}

export async function getLastUsedExpenseContext() {
  return await manager.getMostRecentContext();
}

export async function deleteExpenseContext(description) {
  if (!description?.trim()) throw new Error('Description required');
  return await manager.deleteContext(description.trim());
}

export function applyExpenseContext(context) {
  if (!context) return {};
  return contextToFormData(context, FIELD_MAPPING);
}
