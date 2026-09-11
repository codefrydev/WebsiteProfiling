import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'outline' | 'ghost' | 'danger' | 'danger-outline' | 'success';

type ButtonProps = {
  children?: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  /** Shows a spinner and disables interaction. */
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Shared button adhering strictly to Google Material 3 (M3) Expressive Design:
 * Pill shape (rounded-full), tactile press feedback (active:scale-[0.98]), M3 color roles,
 * spring transitions, and accessible focus rings.
 */
export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  className = '',
  loading = false,
  onClick,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    'press inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-sys-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-md-sys-primary text-md-sys-on-primary font-semibold hover:brightness-105 hover:shadow-[var(--elevation-2)]',
    secondary:
      'bg-md-sys-secondary-container text-md-sys-on-secondary-container hover:brightness-95 border border-transparent',
    tonal:
      'bg-md-sys-secondary-container text-md-sys-on-secondary-container hover:brightness-95 border border-transparent',
    outline:
      'border border-md-sys-outline text-md-sys-primary hover:bg-md-sys-primary/10 font-medium',
    ghost:
      'text-md-sys-primary hover:bg-md-sys-primary/10',
    danger:
      'bg-md-sys-error text-md-sys-on-error font-semibold hover:brightness-105 hover:shadow-[var(--elevation-2)]',
    'danger-outline':
      'border border-md-sys-error text-md-sys-error hover:bg-md-sys-error/10 font-medium',
    success:
      'bg-md-sys-success text-md-sys-on-success font-semibold hover:brightness-105 hover:shadow-[var(--elevation-2)]',
  };
  const combined = `${base} ${variants[variant] || variants.primary} ${className}`.trim();
  return (
    <button
      type={type}
      className={combined}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
