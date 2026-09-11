
import { ImageIcon } from 'lucide-react';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { strings } from '@/lib/strings';

export interface ImageAuditSummaryData {
  pagesMissingAlt: number;
  pagesWithoutLazy: number;
  pagesMissingDimensions: number;
  lighthouseImageDiagnostics: number;
  imagesTotal: number;
  ogCoveragePct?: number | null;
  ogMissingCount?: number | null;
  inventoryAvailable: boolean;
  inventoryProbed?: number | null;
}

const ib = strings.components.chat.blocks.imageAudit;

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'neutral';
}) {
  const toneClass =
    tone === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : tone === 'warn'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
        : 'border-md-sys-outline-variant/40 bg-md-sys-surface-container/40 text-md-sys-on-surface';

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

export default function ImageAuditSummaryCards({
  data,
  showHeader = true,
  className = '',
}: {
  data: ImageAuditSummaryData;
  showHeader?: boolean;
  className?: string;
}) {
  const chartItems = [
    { label: ib.missingAlt, value: data.pagesMissingAlt },
    { label: ib.noLazyLoad, value: data.pagesWithoutLazy },
    { label: ib.missingDimensions, value: data.pagesMissingDimensions },
    { label: ib.lighthouseIssues, value: data.lighthouseImageDiagnostics },
  ].filter((i) => i.value > 0);

  return (
    <div className={`rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container/40 p-4 ${className}`}>
      {showHeader ? (
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-md-sys-outline-variant/40 bg-md-sys-surface-container/50">
            <ImageIcon className="h-4 w-4 text-md-sys-on-surface-variant" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-md-sys-on-surface">{ib.title}</p>
            <p className="mt-0.5 text-xs text-md-sys-on-surface-variant">{ib.subtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-md-sys-on-surface">
              {data.imagesTotal.toLocaleString()}
            </p>
            <p className="text-[11px] text-md-sys-on-surface-variant">{ib.totalImages}</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label={ib.missingAlt}
          value={data.pagesMissingAlt}
          tone={data.pagesMissingAlt > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label={ib.noLazyLoad}
          value={data.pagesWithoutLazy}
          tone={data.pagesWithoutLazy > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label={ib.missingDimensions}
          value={data.pagesMissingDimensions}
          tone={data.pagesMissingDimensions > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label={ib.lighthouseIssues}
          value={data.lighthouseImageDiagnostics}
          tone={data.lighthouseImageDiagnostics > 0 ? 'warn' : 'ok'}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-md-sys-on-surface-variant">
        {data.ogCoveragePct != null ? (
          <span>
            {ib.ogCoverage}:{' '}
            <span className="font-medium text-md-sys-on-surface">
              {data.ogCoveragePct % 1 === 0
                ? data.ogCoveragePct
                : data.ogCoveragePct.toFixed(1)}
              %
            </span>
            {data.ogMissingCount != null && data.ogMissingCount > 0
              ? ` · ${data.ogMissingCount} missing`
              : ''}
          </span>
        ) : null}
        <span>
          {ib.sizeProbe}:{' '}
          <span
            className={
              data.inventoryAvailable ? 'font-medium text-emerald-300/90' : 'text-amber-300/90'
            }
          >
            {data.inventoryAvailable ? ib.probeOn : ib.probeOff}
          </span>
          {data.inventoryAvailable && data.inventoryProbed != null
            ? ` · ${data.inventoryProbed} URLs`
            : ''}
        </span>
      </div>

      {chartItems.length > 0 ? (
        <div className="mt-4 border-t border-md-sys-outline-variant/30 pt-4">
          <p className="mb-2 text-xs text-md-sys-on-surface-variant">{ib.issueBreakdown}</p>
          <SimpleBarChart
            labels={chartItems.map((i) => i.label)}
            values={chartItems.map((i) => i.value)}
            ariaLabel={ib.issueBreakdown}
          />
        </div>
      ) : null}
    </div>
  );
}
