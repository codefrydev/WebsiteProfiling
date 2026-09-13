import type { SelectHTMLAttributes, ReactNode } from 'react';

export const SELECT_CLASS =
  'bg-md-sys-surface-container-high border border-md-sys-outline-variant text-sm rounded-xl px-3.5 py-2 text-md-sys-on-surface outline-none focus:ring-2 focus:ring-md-sys-primary transition-all duration-200';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  className?: string;
}

export default function Select({ children, className = '', ...rest }: SelectProps) {
  return (
    <select className={`${SELECT_CLASS} ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}
