import { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Password text field with a built-in show/hide ("eye") toggle so users can
 * verify what they typed while signing in, signing up, or setting a password.
 * Drop-in replacement for `<input type="password" …>` — keeps the same styling
 * via `className` and forwards the ref (usable with focus management).
 */
const PasswordInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { iconClassName?: string }
>(function PasswordInput({ className = '', iconClassName = 'text-gray-400', ...props }, ref) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={`w-full ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        className={`absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:text-gray-600 focus:outline-none transition-colors ${iconClassName}`}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
});

export default PasswordInput;
