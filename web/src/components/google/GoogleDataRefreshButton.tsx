import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import Button from '@/components/Button';
import { strings } from '@/lib/strings';
import { dispatchOpenIntegrations } from '@/lib/pipelineJobEvents';
import { useGoogleDataRefresh } from '@/hooks/useGoogleDataRefresh';
import type { IntegrationToast } from '@/types/api';

type GoogleDataRefreshVariant = 'gsc' | 'google';

type Props = {
  /** `gsc` for Search Performance; `google` for Traffic (GSC + GA4). */
  variant?: GoogleDataRefreshVariant;
};

function stringsForVariant(variant: GoogleDataRefreshVariant) {
  if (variant === 'google') {
    const t = strings.views.traffic;
    return {
      label: t.refreshGoogle,
      refreshing: t.refreshingGoogle,
      success: t.refreshGoogleSuccess,
      failed: t.refreshGoogleFailed,
      noProperty: t.refreshGoogleNoProperty,
      readOnly: t.refreshGoogleReadOnly,
    };
  }
  const s = strings.views.searchPerformance;
  return {
    label: s.refreshGsc,
    refreshing: s.refreshingGsc,
    success: s.refreshGscSuccess,
    failed: s.refreshGscFailed,
    noProperty: s.refreshGscNoProperty,
    readOnly: s.refreshGscReadOnly,
  };
}

export default function GoogleDataRefreshButton({ variant = 'gsc' }: Props) {
  const copy = stringsForVariant(variant);
  const { refresh, refreshing, readOnly, propertyReady, propertyId, stale } = useGoogleDataRefresh();
  const [toast, setToast] = useState<IntegrationToast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleClick = useCallback(async () => {
    if (!propertyReady || propertyId == null) {
      dispatchOpenIntegrations();
      return;
    }
    const result = await refresh();
    if (result.ok) {
      setToast({ type: 'success', message: copy.success });
      return;
    }
    if (result.message === 'readOnly') {
      setToast({ type: 'error', message: copy.readOnly });
      return;
    }
    if (result.message === 'noProperty') {
      setToast({ type: 'error', message: copy.noProperty });
      dispatchOpenIntegrations();
      return;
    }
    setToast({ type: 'error', message: `${copy.failed} ${result.message}`.trim() });
  }, [copy, propertyId, propertyReady, refresh]);

  const disabled = readOnly || refreshing || !propertyReady;
  const title =
    propertyId == null && propertyReady
      ? copy.noProperty
      : readOnly
        ? copy.readOnly
        : stale
          ? copy.label
          : undefined;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        loading={refreshing}
        disabled={disabled}
        title={title}
        className="border-green-700/40 text-green-800 hover:bg-green-500/10 dark:text-green-300"
        onClick={() => void handleClick()}
      >
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden />
        )}
        {refreshing ? copy.refreshing : copy.label}
      </Button>
      {toast ? (
        <p
          role="status"
          className={`max-w-xs text-right text-xs ${
            toast.type === 'success'
              ? 'text-green-700 dark:text-green-400'
              : 'text-red-700 dark:text-red-400'
          }`}
        >
          {toast.message}
        </p>
      ) : stale && propertyId != null ? (
        <p className="max-w-xs text-right text-xs text-muted-foreground">{copy.label} — data may be outdated</p>
      ) : null}
    </div>
  );
}
