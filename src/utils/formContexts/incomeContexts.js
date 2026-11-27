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

export function applyIncomeContext(context) {
  if (!context) return {};
  const data = contextToFormData(context, FIELD_MAPPING);
  // Income always goes into an account. A remembered destination with no account (cash before it was an account) is dropped,
  // so the form keeps its default account.
  delete data.depositTarget;
  if (!data.depositAccountId) delete data.depositAccountId;
  return data;
}
