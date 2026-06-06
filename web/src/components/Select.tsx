import type { SelectHTMLAttributes, ReactNode } from 'react';

export const SELECT_CLASS =
  'bg-brand-800 border border-brand-700 text-sm rounded-lg px-3 py-2 text-foreground outline-none focus:border-blue-500 transition-colors';

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
