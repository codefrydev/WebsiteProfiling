'use client';

import { Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from '@/components';
import type { UrlMetadataChangeRow } from '@/lib/reportCompare';

interface CompareUrlMetadataTableProps {
  rows: UrlMetadataChangeRow[];
  emptyLabel: string;
}

export default function CompareUrlMetadataTable({ rows, emptyLabel }: CompareUrlMetadataTableProps) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-4">{emptyLabel}</p>;
  }
  return (
    <div className="max-h-[min(480px,55vh)] overflow-y-auto border border-default rounded-lg">
      <Table>
        <TableHead sticky>
          <TableRow>
            <TableHeadCell>URL</TableHeadCell>
            <TableHeadCell>Field</TableHeadCell>
            <TableHeadCell>Baseline</TableHeadCell>
            <TableHeadCell>Current</TableHeadCell>
          </TableRow>
        </TableHead>
        <TableBody striped>
          {rows.map((row) => (
            <TableRow key={`${row.url}-${row.field}`}>
              <TableCell className="font-mono text-xs break-all max-w-[220px]">{row.url}</TableCell>
              <TableCell className="text-xs">{row.field}</TableCell>
              <TableCell className="text-xs break-all max-w-[180px]">{row.baseline || '—'}</TableCell>
              <TableCell className="text-xs break-all max-w-[180px]">{row.current || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
