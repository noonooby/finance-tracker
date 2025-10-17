import { BaseContextManager } from './BaseContextManager';
import { CONTEXT_CONFIGS } from './contextConfig';
import { contextToFormData, formDataToContext, validateContext } from './shared';

const manager = new BaseContextManager(
  CONTEXT_CONFIGS.income.tableName,
  CONTEXT_CONFIGS.income.triggerField
);

const FIELD_MAPPING = CONTEXT_CONFIGS.income.formMapping;

export async function getIncomeSourceContext(sourceName) {
  if (!sourceName?.trim()) return null;
  return await manager.getContext(sourceName.trim());
}

export async function saveIncomeSourceContext(sourceName, formData) {
  if (!sourceName?.trim()) throw new Error('Source name required');
  const context = formDataToContext(formData, FIELD_MAPPING);
  const errors = validateContext(context, CONTEXT_CONFIGS.income.contextFields);
  if (errors.length > 0) throw new Error(`Invalid context: ${errors.join(', ')}`);
  return await manager.saveContext(sourceName.trim(), context);
}

export async function getRecentIncomeSources(limit = 5) {
  return await manager.getRecentTriggers(limit);
}

export async function getLastUsedIncomeContext() {
  return await manager.getMostRecentContext();
}

export async function deleteIncomeSourceContext(sourceName) {
  if (!sourceName?.trim()) throw new Error('Source name required');
  return await manager.deleteContext(sourceName.trim());
}

export function applyIncomeContext(context) {
  if (!context) return {};
  return contextToFormData(context, FIELD_MAPPING);
}
