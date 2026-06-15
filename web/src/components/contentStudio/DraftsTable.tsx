'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { strings } from '@/lib/strings';
import {
  Table,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableCell,
  Button,
} from '@/components';
import type { ContentDraftListItem } from '@/types/contentStudio';

interface DraftsTableProps {
  drafts: ContentDraftListItem[];
  readOnly: boolean;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  deletingId: number | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function DraftsTable({
  drafts,
  readOnly,
  onEdit,
  onDelete,
  deletingId,
}: DraftsTableProps) {
  const t = strings.views.contentStudio.table;

  if (drafts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">{t.empty}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeadCell>{t.colTitle}</TableHeadCell>
            <TableHeadCell>{t.colKeyword}</TableHeadCell>
            <TableHeadCell>{t.colGrade}</TableHeadCell>
            <TableHeadCell>{t.colStatus}</TableHeadCell>
            <TableHeadCell>{t.colUpdated}</TableHeadCell>
            {!readOnly ? <TableHeadCell>{t.colActions}</TableHeadCell> : null}
          </TableRow>
        </TableHead>
        <TableBody>
          {drafts.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium max-w-[200px] truncate">{d.title}</TableCell>
              <TableCell className="max-w-[160px] truncate text-muted-foreground">
                {d.target_keyword || t.noKeyword}
              </TableCell>
              <TableCell className="tabular-nums">
                {d.grade_score != null ? `${d.grade_score}` : t.noGrade}
              </TableCell>
              <TableCell className="capitalize">{d.status}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(d.updated_at)}
              </TableCell>
              {!readOnly ? (
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="!px-2 !py-1"
                      onClick={() => onEdit(d.id)}
                      title={t.edit}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="!px-2 !py-1 text-red-700 dark:text-red-400"
                      onClick={() => onDelete(d.id)}
                      loading={deletingId === d.id}
                      title={t.delete}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
