import type { ReactNode } from 'react';

interface TableProps {
  children?: ReactNode;
  className?: string;
  wrapperClassName?: string;
}

/**
 * Wrapper for consistent table styling: thead bg-brand-900, uppercase text-xs font-semibold text-muted-foreground.
 * Use `striped` on TableBody for alternating row backgrounds.
 */
export default function Table({ children, className = '', wrapperClassName = '' }: TableProps) {
  return (
    <div className={`overflow-x-auto w-full touch-pan-x overscroll-x-contain scroll-smooth ${wrapperClassName}`.trim()}>
      <table className={`w-full text-left text-sm ${className}`.trim()}>
        {children}
      </table>
    </div>
  );
}

interface TableHeadProps {
  children?: ReactNode;
  sticky?: boolean;
}

export const TableHead = ({ children, sticky = false }: TableHeadProps) => (
  <thead className={`bg-brand-900 text-muted-foreground uppercase text-xs font-semibold ${sticky ? 'sticky top-0 z-10' : ''}`}>
    {children}
  </thead>
);

export const TableHeadCell = ({ children, className = '', title }: { children?: ReactNode; className?: string; title?: string }) => (
  <th className={`px-4 py-3 whitespace-nowrap ${className}`.trim()} title={title}>{children}</th>
);

interface TableBodyProps {
  children?: ReactNode;
  striped?: boolean;
  className?: string;
}

export const TableBody = ({ children, striped = false, className = '' }: TableBodyProps) => (
  <tbody className={`divide-y divide-muted ${striped ? '[&>tr:nth-child(even)]:bg-brand-900/30' : ''} ${className}`.trim()}>
    {children}
  </tbody>
);

export const TableRow = ({ children, className = '' }: { children?: ReactNode; className?: string }) => (
  <tr className={`hover:bg-brand-900/60 transition-colors ${className}`.trim()}>{children}</tr>
);

export const TableCell = ({ children, className = '', title }: { children?: ReactNode; className?: string; title?: string }) => (
  <td className={`px-4 py-3 ${className}`.trim()} title={title}>{children}</td>
);
