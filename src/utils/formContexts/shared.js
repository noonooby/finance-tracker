export function contextToFormData(context, fieldMapping) {
  if (!context) return {};
  const formData = {};
  for (const [dbField, formField] of Object.entries(fieldMapping)) {
    if (context[dbField] !== undefined && context[dbField] !== null) {
      formData[formField] = context[dbField];
    }
  }
  return formData;
}

export function formDataToContext(formData, fieldMapping) {
  if (!formData) return {};
  const context = {};
  for (const [dbField, formField] of Object.entries(fieldMapping)) {
    const value = formData[formField];
    if (value !== undefined && value !== null && value !== '') {
      context[dbField] = value;
    }
  }
  return context;
}

export function selectAllText(inputRef) {
  if (!inputRef?.current) return;
  try {
    setTimeout(() => {
      if (inputRef.current?.select) {
        inputRef.current.select();
      }
    }, 0);
  } catch (error) {
    console.warn('Failed to select text:', error);
  }
}

export function validateContext(contextData, contextFields) {
  const errors = [];
  for (const [fieldName, fieldConfig] of Object.entries(contextFields)) {
    const dbColumn = fieldConfig.dbColumn || fieldName;
    const value = contextData[dbColumn];
    if (fieldConfig.required && (value === undefined || value === null || value === '')) {
      errors.push(`${fieldName} is required`);
    }
  }
  return errors;
}
