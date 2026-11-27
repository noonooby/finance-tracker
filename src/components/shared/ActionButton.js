import React from 'react';
import { Button } from './ui';

// A form's button: shows it is working and cannot be pressed twice while it is.
const LOOK = { success: 'primary', warning: 'primary', ghost: 'secondary' };
export default function ActionButton({ processing = false, variant = 'primary', icon = null, processingText, idleText, fullWidth = false, className = '', ...rest }) {
  return (
    <Button variant={LOOK[variant] || variant} loading={processing} className={`${fullWidth ? 'w-full' : ''} ${className}`.trim()} {...rest}>
      {!processing && icon}
      {processing && processingText ? processingText : idleText}
    </Button>
  );
}
