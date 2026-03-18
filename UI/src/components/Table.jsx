/**
 * Wrapper for consistent table styling: thead bg-brand-900, uppercase text-xs font-semibold text-slate-400.
 */
export default function Table({ children, className = '' }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left text-sm ${className}`.trim()}>
        {children}
      </table>
    </div>
  );
}

export const TableHead = ({ children }) => (
  <thead className="bg-brand-900 text-slate-400 uppercase text-xs font-semibold">
    {children}
  </thead>
);

export const TableHeadCell = ({ children, className = '' }) => (
  <th className={`px-6 py-4 ${className}`.trim()}>{children}</th>
);

export const TableBody = ({ children }) => (
  <tbody className="divide-y divide-slate-800/50">{children}</tbody>
);

export const TableRow = ({ children, className = '' }) => (
  <tr className={`hover:bg-brand-900/50 ${className}`.trim()}>{children}</tr>
);

export const TableCell = ({ children, className = '' }) => (
  <td className={`px-6 py-4 ${className}`.trim()}>{children}</td>
);
