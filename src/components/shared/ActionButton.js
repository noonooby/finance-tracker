import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * ActionButton Component
 * 
 * Smart button that handles async actions with visual feedback
 * 
 * @param {Object} props
 * @param {Function} props.onClick - Click handler
 * @param {boolean} props.processing - Whether the action is processing
 * @param {string} props.variant - Button style variant
 * @param {string} props.size - Button size
 * @param {ReactNode} props.icon - Icon component (optional)
 * @param {string} props.processingText - Text to show when processing
 * @param {string} props.idleText - Text to show when idle
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.disabled - Disabled state (in addition to processing)
 * @param {boolean} props.fullWidth - Make button full width
 */
export default function ActionButton({
  onClick,
  processing = false,
  variant = 'primary',
  size = 'md',
  icon = null,
  processingText = 'Processing...',
  idleText,
  className = '',
  disabled = false,
  fullWidth = false,
  type = 'button',
  ...rest
}) {
  // Button variant styles
  const variants = {
    primary: {
      base: 'bg-blue-600 hover:bg-blue-700 text-white',
      processing: 'bg-blue-500 cursor-not-allowed',
      disabled: 'bg-gray-400 cursor-not-allowed',
    },
    success: {
      base: 'bg-green-600 hover:bg-green-700 text-white',
      processing: 'bg-green-500 cursor-not-allowed',
      disabled: 'bg-gray-400 cursor-not-allowed',
    },
    danger: {
      base: 'bg-red-600 hover:bg-red-700 text-white',
      processing: 'bg-red-500 cursor-not-allowed',
      disabled: 'bg-gray-400 cursor-not-allowed',
    },
    secondary: {
      base: 'bg-gray-600 hover:bg-gray-700 text-white',
      processing: 'bg-gray-500 cursor-not-allowed',
      disabled: 'bg-gray-400 cursor-not-allowed',
    },
    warning: {
      base: 'bg-orange-600 hover:bg-orange-700 text-white',
      processing: 'bg-orange-500 cursor-not-allowed',
      disabled: 'bg-gray-400 cursor-not-allowed',
    },
    ghost: {
      base: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600',
      processing: 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed',
      disabled: 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-50',
    },
  };

  // Button size styles
  const sizes = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  const variantStyles = variants[variant] || variants.primary;
  const sizeStyles = sizes[size] || sizes.md;

  const isDisabled = disabled || processing;

  // Determine button style
  let buttonStyle = variantStyles.base;
  if (processing) {
    buttonStyle = variantStyles.processing;
  } else if (disabled) {
    buttonStyle = variantStyles.disabled;
  }

  // Determine display text
  const displayText = processing ? processingText : idleText;

  return (
    <button
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className={`
        flex items-center justify-center gap-2
        ${sizeStyles}
        ${buttonStyle}
        rounded-lg
        font-medium
        transition-colors
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      {...rest}
    >
      {processing && (
        <Loader2 size={14} className="animate-spin" />
      )}
      {!processing && icon && (
        <span className="flex items-center">
          {icon}
        </span>
      )}
      {displayText}
    </button>
  );
}

/**
 * ActionButton Variants:
 * - primary (blue) - Main actions
 * - success (green) - Payments, confirmations
 * - danger (red) - Deletes
 * - secondary (gray) - Cancel, secondary actions
 * - warning (orange) - Caution actions
 * - ghost (transparent) - Subtle actions
 * 
 * ActionButton Sizes:
 * - sm - Small buttons
 * - md - Medium buttons (default)
 * - lg - Large buttons
 * 
 * @example
 * <ActionButton
 *   onClick={handleSave}
 *   processing={isProcessing('save')}
 *   variant="primary"
 *   icon={<Save size={16} />}
 *   processingText="Saving..."
 *   idleText="Save Changes"
 * />
 */
