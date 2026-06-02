import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  children?: ReactNode;
  variant?: ButtonVariant;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Shared button: primary (Export style), secondary (border), ghost.
 * Same size: px-4 py-2 rounded-lg text-sm font-medium/bold for primary.
 */
export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  className = '',
  onClick,
  disabled,
  ...rest
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white font-bold',
    secondary: 'border border-default text-foreground hover:bg-brand-700/80',
    ghost: 'text-muted-foreground hover:text-foreground hover:bg-brand-800/80',
  };
  const combined = `${base} ${variants[variant] || variants.primary} ${className}`.trim();
  return (
    <button type={type} className={combined} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
