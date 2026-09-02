import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';

type ButtonProps = {
  children?: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  /** Shows a spinner and disables interaction. */
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Shared button: primary (Export style), secondary (border), ghost, danger, danger-outline.
 * Same size: px-4 py-2 rounded-lg text-sm font-medium/bold for primary.
 * Includes tactile press feedback (.press) and, for primary/danger, hover elevation.
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
    'press inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white font-bold hover:shadow-[var(--elevation-2)]',
    secondary: 'border border-default text-foreground hover:bg-brand-700/80',
    ghost: 'text-muted-foreground hover:text-foreground hover:bg-brand-800/80',
    danger: 'bg-red-600 hover:bg-red-500 text-white font-bold hover:shadow-[var(--elevation-2)]',
    'danger-outline': 'border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-medium',
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
