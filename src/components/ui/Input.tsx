import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';

const baseField =
  'w-full rounded-lg border border-accent-300 bg-white px-3 py-2 text-sm text-accent-900 placeholder:text-accent-400 focus:border-accent-700 focus:outline-none focus:ring-1 focus:ring-accent-700 disabled:bg-accent-100 disabled:text-accent-500 min-h-touch';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${baseField} ${className}`} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...props }, ref) {
    return <textarea ref={ref} rows={3} className={`${baseField} ${className}`} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', ...props }, ref) {
    return <select ref={ref} className={`${baseField} ${className}`} {...props} />;
  },
);

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }
>(function Checkbox({ label, className = '', ...props }, ref) {
  return (
    <label className={`flex min-h-touch cursor-pointer items-center gap-3 text-sm text-accent-800 ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        className="h-5 w-5 shrink-0 rounded border-accent-300 text-accent-700 focus:ring-accent-700"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
});

export function Field({
  label,
  error,
  required,
  hint,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-accent-800">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-accent-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
