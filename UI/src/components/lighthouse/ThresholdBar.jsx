import { useState, useEffect, useRef } from 'react';
import { METRIC_THRESHOLDS, metricStatus, formatMetric } from '../../utils/lighthouseUtils';

export default function ThresholdBar({ metricKey, value }) {
  const t = METRIC_THRESHOLDS[metricKey];
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const barRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(id);
  }, []);

  if (!t || value == null) {
    return (
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-foreground text-sm">{t?.label || metricKey}</span>
        <span className="text-muted-foreground font-semibold text-sm">—</span>
      </div>
    );
  }

  const v = Number(value);
  const status = metricStatus(metricKey, v);
  const barColor = status === 'good' ? 'bg-green-500' : status === 'warn' ? 'bg-yellow-500' : 'bg-red-500';
  const textColor =
    status === 'good'
      ? 'text-green-700 dark:text-green-400'
      : status === 'warn'
        ? 'text-yellow-800 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400';
  const refVal = t.good * 1.5;
  const pct = Math.min(100, (v / refVal) * 100);

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 hover:bg-brand-800 transition-colors relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={barRef}
    >
      <span className="text-foreground text-sm w-44 shrink-0">{t.label}</span>
      <div className="flex-1 flex items-center gap-3">
        <div className="flex-1 bg-track rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-700 ease-out ${barColor}`}
            style={{ width: mounted ? `${pct}%` : '0%' }}
          />
        </div>
        <div className="relative w-2 shrink-0">
          <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand-700 rounded" style={{ left: 0 }} />
        </div>
        <span className={`font-semibold text-sm tabular-nums w-16 text-right ${textColor}`}>
          {formatMetric(metricKey, v)}
        </span>
      </div>

      {hovered && (
        <div className="absolute left-0 bottom-full mb-2 ml-4 z-50 bg-brand-800 border border-default rounded-xl shadow-2xl p-3 w-72 pointer-events-none">
          <div className="font-semibold text-bright text-sm mb-1">{t.label}</div>
          <p className="text-xs text-muted-foreground mb-2">{t.desc}</p>
          <div className="flex gap-4 text-xs">
            <span><span className="text-muted-foreground">Value:</span> <span className={textColor}>{formatMetric(metricKey, v)}</span></span>
            <span><span className="text-muted-foreground">Good:</span> <span className="text-green-700 dark:text-green-400">≤{formatMetric(metricKey, t.good)}</span></span>
            <span><span className="text-muted-foreground">Warn:</span> <span className="text-yellow-800 dark:text-yellow-400">≤{formatMetric(metricKey, t.warn)}</span></span>
          </div>
          <div className={`mt-2 text-xs font-semibold ${textColor}`}>
            {status === 'good' ? '✓ Good' : status === 'warn' ? '⚠ Needs improvement' : '✕ Poor'}
          </div>
        </div>
      )}
    </div>
  );
}
