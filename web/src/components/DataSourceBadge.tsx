import { dataSourceMeta, type DataSourceId } from '@/lib/dataProvenance';

export interface DataSourceBadgeProps {
  source: DataSourceId;
  className?: string;
  title?: string;
}

export default function DataSourceBadge({ source, className = '', title }: DataSourceBadgeProps) {
  const meta = dataSourceMeta(source);
  return (
    <span
      title={title ?? meta.label}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.className} ${className}`}
    >
      {meta.shortLabel}
    </span>
  );
}

export function DataSourceBadgeRow({
  sources,
  className = '',
}: {
  sources: DataSourceId[];
  className?: string;
}) {
  const unique = [...new Set(sources)];
  if (!unique.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {unique.map((s) => (
        <DataSourceBadge key={s} source={s} />
      ))}
    </div>
  );
}
