import type { ReactNode } from 'react';

export interface ChartAccessibleFallbackProps {
  summary: string;
  /** Optional rows for sr-only table: [label, value] */
  rows?: Array<[string, string | number]>;
  children?: ReactNode;
}

/** WCAG text alternative: visible chart + sr-only summary and optional data table. */
export function ChartAccessibleFallback({ summary, rows, children }: ChartAccessibleFallbackProps) {
  return (
    <>
      {children}
      <p className="sr-only">{summary}</p>
      {rows && rows.length > 0 ? (
        <table className="sr-only">
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
