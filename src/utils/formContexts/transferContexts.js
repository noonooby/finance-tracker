import { BaseContextManager } from './BaseContextManager';
import { CONTEXT_CONFIGS } from './contextConfig';

const config = CONTEXT_CONFIGS.transfer;
const manager = new BaseContextManager(config.tableName, config.triggerField);

export async function getTransferContext(description) {
  return await manager.getContext(description);
}

export async function saveTransferContext(description, contextData) {
  return await manager.saveContext(description, contextData);
}

export async function getRecentTransferDescriptions(limit = 5) {
  return await manager.getRecentTriggers(limit);
}

export async function getLastUsedTransferContext() {
  return await manager.getMostRecentContext();
}

export function applyTransferContext(context) {
  if (!context) return {};
  const { formMapping } = config;
  const result = {};
  Object.entries(formMapping).forEach(([dbField, formField]) => {
    if (context[dbField] !== undefined) {
      result[formField] = context[dbField];
    }
  });
  return result;
}

export async function deleteTransferContext(description) {
  return await manager.deleteContext(description);
}
