import { useEffect, useState } from 'react';
import HelpHint from '../HelpHint';
import { METRIC_THRESHOLDS, metricStatus, formatMetric } from '../../utils/lighthouseUtils';

export interface ThresholdBarProps {
  metricKey: keyof typeof METRIC_THRESHOLDS;
  value: number | null | undefined;
}

export default function ThresholdBar({ metricKey, value }: ThresholdBarProps) {
  const t = METRIC_THRESHOLDS[metricKey];
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(id);
  }, []);

  if (!t || value == null) {
    return (
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-md-sys-on-surface text-sm">{t?.label || metricKey}</span>
        <span className="text-md-sys-on-surface-variant font-semibold text-sm">—</span>
      </div>
    );
  }

  const v = Number(value);
  const status = metricStatus(metricKey, v);
  const barColor = status === 'good' ? 'bg-md-sys-success' : status === 'warn' ? 'bg-md-sys-warning' : 'bg-md-sys-error';
  const textColor =
    status === 'good'
      ? 'text-md-sys-success'
      : status === 'warn'
        ? 'text-md-sys-warning'
        : 'text-md-sys-error';
  const refVal = t.good * 1.5;
  const pct = Math.min(100, (v / refVal) * 100);
  const hintBody = `${t.desc} Good: ≤${formatMetric(metricKey, t.good)}. Needs improvement: ≤${formatMetric(metricKey, t.warn)}.`;

  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-md-sys-surface-container transition-colors">
      <span className="text-md-sys-on-surface text-sm w-44 shrink-0 inline-flex items-center gap-1">
        {t.label}
        <HelpHint title={t.label} ariaLabel={`About ${t.label}`}>
          {hintBody}
        </HelpHint>
      </span>
      <div className="flex-1 flex items-center gap-3">
        <div className="flex-1 bg-md-sys-surface-container-highest/40 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-700 ease-out ${barColor}`}
            style={{ width: mounted ? `${pct}%` : '0%' }}
          />
        </div>
        <div className="relative w-2 shrink-0">
          <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-md-sys-surface-container-high rounded" style={{ left: 0 }} />
        </div>
        <span className={`font-semibold text-sm tabular-nums w-16 text-right ${textColor}`}>
          {formatMetric(metricKey, v)}
        </span>
      </div>
    </div>
  );
}
