/**
 * Wrapper for consistent table styling: thead bg-brand-900, uppercase text-xs font-semibold text-slate-400.
 * Use `striped` on TableBody for alternating row backgrounds.
 */
export default function Table({ children, className = '' }) {
  return (
    <div className="overflow-x-auto w-full">
      <table className={`w-full text-left text-sm ${className}`.trim()}>
        {children}
      </table>
    </div>
  );
}

export const TableHead = ({ children, sticky = false }) => (
  <thead className={`bg-brand-900 text-slate-400 uppercase text-xs font-semibold ${sticky ? 'sticky top-0 z-10' : ''}`}>
    {children}
  </thead>
);

export const TableHeadCell = ({ children, className = '' }) => (
  <th className={`px-4 py-3 whitespace-nowrap ${className}`.trim()}>{children}</th>
);

export const TableBody = ({ children, striped = false }) => (
  <tbody className={`divide-y divide-muted ${striped ? '[&>tr:nth-child(even)]:bg-brand-900/30' : ''}`}>
    {children}
  </tbody>
);

export const TableRow = ({ children, className = '' }) => (
  <tr className={`hover:bg-brand-900/60 transition-colors ${className}`.trim()}>{children}</tr>
);

export const TableCell = ({ children, className = '' }) => (
  <td className={`px-4 py-3 ${className}`.trim()}>{children}</td>
);
