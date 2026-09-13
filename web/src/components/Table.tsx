import type { ReactNode } from 'react';
import HelpHint, { normalizeHintContent, type HelpHintContent } from './HelpHint';

interface TableProps {
  children?: ReactNode;
  className?: string;
  wrapperClassName?: string;
}

/**
 * Wrapper for consistent table styling: thead bg-md-sys-surface-container-low, uppercase text-xs font-semibold text-md-sys-on-surface-variant.
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
  <thead className={`bg-md-sys-surface-container-low text-md-sys-on-surface-variant uppercase text-xs font-semibold tracking-wider [&_tr]:hover:bg-transparent border-b border-md-sys-outline-variant/40 ${sticky ? 'sticky top-0 z-10' : ''}`}>
    {children}
  </thead>
);

export const TableHeadCell = ({
  children,
  className = '',
  title,
  hint,
}: {
  children?: ReactNode;
  className?: string;
  /** @deprecated Use hint for metric explanations; reserve title for native browser tooltip on truncation. */
  title?: string;
  hint?: HelpHintContent;
}) => {
  const hintContent = normalizeHintContent(hint);
  return (
    <th className={`px-4 py-3.5 whitespace-nowrap ${className}`.trim()} title={title}>
      <div className="inline-flex items-center gap-1 normal-case">
        {children}
        {hintContent ? (
          <HelpHint title={hintContent.title} className="normal-case">
            {hintContent.body}
          </HelpHint>
        ) : null}
      </div>
    </th>
  );
};

interface TableBodyProps {
  children?: ReactNode;
  striped?: boolean;
  className?: string;
}

export const TableBody = ({ children, striped = false, className = '' }: TableBodyProps) => (
  <tbody className={`divide-y divide-md-sys-outline-variant/30 ${striped ? '[&>tr:nth-child(even)]:bg-md-sys-surface-container-low/40' : ''} ${className}`.trim()}>
    {children}
  </tbody>
);

export const TableRow = ({ children, className = '' }: { children?: ReactNode; className?: string }) => (
  <tr className={`hover:bg-md-sys-surface-container-high/60 transition-colors duration-150 ${className}`.trim()}>{children}</tr>
);

export const TableCell = ({ children, className = '', title }: { children?: ReactNode; className?: string; title?: string }) => (
  <td className={`px-4 py-3 text-md-sys-on-surface ${className}`.trim()} title={title}>{children}</td>
);
