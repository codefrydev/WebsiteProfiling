import { useMemo, useState } from 'react';
import type { LhTableHeading } from '@/types/report';

type LhCellValue = unknown;
type LhRow = Record<string, unknown>;

function inferHeadings(items: unknown[]): LhTableHeading[] {
  const keys = new Set<string>();
  (items || []).slice(0, 80).forEach((n) => {
    if (n && typeof n === 'object' && !Array.isArray(n)) {
      Object.keys(n as Record<string, unknown>).forEach((k) => keys.add(k));
    }
  });
  return Array.from(keys).map((k) => ({ key: k, label: k, valueType: 'text' }));
}

function isDataImageUrl(s: unknown): s is string {
  return typeof s === 'string' && /^data:image\//i.test(s);
}

function dataImageImg(src: string) {
  return (
    <img
      src={src}
      alt=""
      className="max-h-24 max-w-[140px] rounded border border-muted object-contain bg-brand-950"
      loading="lazy"
    />
  );
}

function looksLikeImageHttpUrl(u: string): boolean {
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    return false;
  }
  try {
    const parsed = new URL(u);
    const path = parsed.pathname.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|heic|heif)(\/|\?|#|$)/i.test(path)) return true;
    const fmt = parsed.searchParams.get('format') || parsed.searchParams.get('fm');
    if (fmt && /^(jpg|jpeg|png|webp|gif|avif)$/i.test(String(fmt))) return true;
    if (/(\/image\/|\/images\/|\/img\/|\/uploads\/|\/media\/|\/photos\/)/i.test(path)) return true;
    return false;
  } catch {
    return /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(\?|#|$)/i.test(u);
  }
}

function obviousNonImageHttpUrl(u: string): boolean {
  try {
    const p = new URL(u).pathname.toLowerCase();
    return /\.(css|js|mjs|json|html|htm|wasm|woff2?|ttf|otf|eot|map|xml|php)(\?|#|$)/i.test(p);
  } catch {
    return false;
  }
}

function shouldShowHttpImagePreview(u: string, columnKey: string, valueType: string): boolean {
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false;
  if (obviousNonImageHttpUrl(u)) return false;
  if (looksLikeImageHttpUrl(u)) return true;
  if (columnKey === 'url' || valueType === 'url' || valueType === 'thumbnail') return true;
  return false;
}

function isTruncatedDataUriForPreview(s: string): boolean {
  return /^data:/i.test(s) && s.length <= 120;
}

interface HttpImagePreviewAndLinkProps {
  href: string;
}

function HttpImagePreviewAndLink({ href }: HttpImagePreviewAndLinkProps) {
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const label = href.length > 140 ? `${href.slice(0, 137)}…` : href;

  return (
    <div className="space-y-1.5 max-w-[min(100%,320px)]">
      {loadState !== 'error' && (
        <img
          key={href}
          src={href}
          alt=""
          className="max-h-28 max-w-full rounded border border-muted object-contain bg-brand-950 block"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadState('ok')}
          onError={() => setLoadState('error')}
        />
      )}
      {loadState === 'error' && (
        <div className="text-[10px] text-muted-foreground italic px-1 py-1.5 rounded border border-dashed border-brand-700/80 bg-brand-900/50">
          Inline preview blocked or failed to load; use the link below (hotlink/CORS policies on the image host).
        </div>
      )}
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-link hover:underline break-all text-[11px] block"
      >
        {label}
      </a>
    </div>
  );
}

function HttpImageThumbOnly({ href }: HttpImagePreviewAndLinkProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      key={href}
      src={href}
      alt=""
      className="max-h-20 max-w-[100px] rounded border border-muted object-contain bg-brand-950 mb-2 block"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function pickDataImageSrc(obj: Record<string, unknown>): string | null {
  if (obj.type === 'thumbnail' && typeof obj.url === 'string' && isDataImageUrl(obj.url)) {
    return obj.url;
  }
  if (typeof obj.thumbnail === 'string' && isDataImageUrl(obj.thumbnail)) return obj.thumbnail;
  if (obj.thumbnail && typeof obj.thumbnail === 'object' && typeof (obj.thumbnail as Record<string, unknown>).url === 'string') {
    const thumbUrl = (obj.thumbnail as Record<string, unknown>).url as string;
    return isDataImageUrl(thumbUrl) ? thumbUrl : null;
  }
  return null;
}

interface LhCellProps {
  value: LhCellValue;
  columnKey?: string;
  valueType?: string;
  row?: LhRow | null;
}

function LhCell({ value, columnKey = '', valueType = '', row = null }: LhCellProps) {
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>;

  if (typeof value === 'string') {
    if (isDataImageUrl(value) && !isTruncatedDataUriForPreview(value)) {
      return dataImageImg(value);
    }
    if (isDataImageUrl(value) && isTruncatedDataUriForPreview(value)) {
      return (
        <span className="text-[10px] text-muted-foreground break-all" title={value}>
          Data URI truncated in Lighthouse JSON (preview unavailable).{' '}
          <a href={value} target="_blank" rel="noreferrer" className="text-link hover:underline">
            Open raw value
          </a>
        </span>
      );
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      if (shouldShowHttpImagePreview(value, columnKey, valueType)) {
        return <HttpImagePreviewAndLink href={value} />;
      }
      return (
        <a href={value} target="_blank" rel="noreferrer" className="text-link hover:underline break-all">
          {value.length > 120 ? `${value.slice(0, 117)}…` : value}
        </a>
      );
    }
    return <span className="break-all">{value}</span>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span>{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    return <span className="text-muted-foreground">{value.length} items</span>;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.type === 'url' && typeof obj.value === 'string') {
      const u = obj.value;
      if ((u.startsWith('http://') || u.startsWith('https://')) && shouldShowHttpImagePreview(u, columnKey, valueType)) {
        return <HttpImagePreviewAndLink href={u} />;
      }
      if (u.startsWith('http://') || u.startsWith('https://')) {
        return (
          <a href={u} target="_blank" rel="noreferrer" className="text-link hover:underline break-all">
            {u.length > 120 ? `${u.slice(0, 117)}…` : u}
          </a>
        );
      }
      return <span className="break-all">{u}</span>;
    }
    if (obj.type === 'link' && typeof obj.url === 'string') {
      return (
        <a href={obj.url} target="_blank" rel="noreferrer" className="text-link hover:underline break-all">
          {String(obj.text || obj.url)}
        </a>
      );
    }
    if (obj.type === 'text' && obj.value != null) {
      return <span className="break-all">{String(obj.value)}</span>;
    }
    if (obj.type === 'numeric' && obj.value != null) {
      return <span className="font-mono">{String(obj.value)}</span>;
    }
    if (obj.type === 'code' && obj.value != null) {
      return <code className="text-[10px] break-all text-amber-800 dark:text-amber-200/90">{String(obj.value)}</code>;
    }

    const imgSrc = pickDataImageSrc(obj);
    if (imgSrc && obj.type === 'thumbnail') {
      return dataImageImg(imgSrc);
    }

    const remoteImageUrl =
      typeof obj.url === 'string' && shouldShowHttpImagePreview(obj.url, 'url', 'url') ? obj.url : null;

    const node =
      obj.type === 'node'
        ? obj
        : obj.node && typeof obj.node === 'object'
          ? (obj.node as Record<string, unknown>)
          : obj;
    const sel = node.selector || obj.selector;
    const snip = node.snippet || obj.snippet;
    const label = node.nodeLabel || obj.nodeLabel;
    const hasNode = Boolean(sel || snip || label);

    const rowImageForNodeCol =
      row &&
      typeof row.url === 'string' &&
      (columnKey === 'node' || valueType === 'node') &&
      shouldShowHttpImagePreview(row.url, 'url', 'url')
        ? row.url
        : null;

    if (imgSrc || hasNode || remoteImageUrl) {
      return (
        <div className="space-y-2 max-w-md">
          {imgSrc && <div className="shrink-0">{dataImageImg(imgSrc)}</div>}
          {remoteImageUrl && (
            <div className="shrink-0">
              <HttpImagePreviewAndLink href={remoteImageUrl} />
            </div>
          )}
          {hasNode && (
            <div className="space-y-1">
              {rowImageForNodeCol && (
                <HttpImageThumbOnly href={rowImageForNodeCol} />
              )}
              {label != null && label !== '' && <div className="text-foreground">{String(label)}</div>}
              {sel != null && sel !== '' && <code className="block text-[10px] text-amber-800 dark:text-amber-200/90 break-all">{String(sel)}</code>}
              {snip != null && snip !== '' && <div className="text-muted-foreground text-[10px] line-clamp-3 font-mono">{String(snip)}</div>}
            </div>
          )}
        </div>
      );
    }

    if (imgSrc) {
      return dataImageImg(imgSrc);
    }

    return (
      <pre className="text-[10px] text-muted-foreground overflow-auto max-w-md max-h-24 whitespace-pre-wrap">
        {JSON.stringify(value, null, 0)}
      </pre>
    );
  }

  return <span>{String(value)}</span>;
}

export interface LhDetailsTableProps {
  headings?: LhTableHeading[];
  items: unknown[];
  maxRows?: number;
}

export default function LhDetailsTable({
  headings,
  items,
  maxRows = 250,
}: LhDetailsTableProps) {
  const heads = useMemo(() => {
    if (Array.isArray(headings) && headings.length) return headings;
    return inferHeadings(items);
  }, [headings, items]);

  if (!Array.isArray(items) || items.length === 0) return null;

  const rows = items.slice(0, maxRows);
  if (!heads.length) return null;

  return (
    <div className="overflow-x-auto border border-muted rounded-lg bg-brand-950/40">
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-muted bg-brand-900/80">
            {heads.map((h, hi) => (
              <th key={h.key != null ? String(h.key) : `col-${hi}`} className="px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">
                {typeof h.label === 'string' ? h.label : (h.label as { formattedDefault?: string } | undefined)?.formattedDefault || h.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const rowObj = row && typeof row === 'object' && !Array.isArray(row) ? (row as LhRow) : null;
            return (
              <tr key={ri} className="border-b border-muted/30 align-top hover:bg-brand-900/30">
                {heads.map((h, hi) => {
                  const key = h.key != null ? String(h.key) : '';
                  const cellValue = rowObj && key ? rowObj[key] : undefined;
                  return (
                    <td key={h.key != null ? String(h.key) : `cell-${ri}-${hi}`} className="px-2 py-2 align-top">
                      <LhCell
                        value={cellValue}
                        columnKey={key}
                        valueType={typeof h.valueType === 'string' ? h.valueType : ''}
                        row={rowObj}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length > maxRows && (
        <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-t border-muted">
          Showing {maxRows} of {items.length} rows
        </div>
      )}
    </div>
  );
}
