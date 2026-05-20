'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatGscCtr } from '../../lib/gscMetrics';
import { INTENT_COLORS, SOURCE_CONFIG, difficultyColor } from './keywordTableUtils';

function KwBadge({ label, colorClass }) {
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colorClass}`}>
      {label}
    </span>
  );
}

function PositionBadge({ pos }) {
  if (pos == null) return <span className="text-muted-foreground">—</span>;
  const p = parseFloat(pos).toFixed(1);
  const color =
    pos <= 3
      ? 'text-green-700 dark:text-green-400'
      : pos <= 10
        ? 'text-yellow-700 dark:text-yellow-400'
        : pos <= 20
          ? 'text-orange-700 dark:text-orange-400'
          : 'text-red-700 dark:text-red-400';
  return <span className={`font-mono font-bold tabular-nums ${color}`}>{p}</span>;
}

function TrendIcon({ trend }) {
  if (!trend) return <span className="text-muted-foreground">—</span>;
  if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-700 dark:text-green-400 inline" />;
  if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-700 dark:text-red-400 inline" />;
  return <Minus className="w-4 h-4 text-muted-foreground inline" />;
}

export function MiniSparkline({ history }) {
  if (!history || history.length < 2) return null;
  const positions = history.map((h) => parseFloat(h.position || 0)).filter((v) => v > 0);
  if (positions.length < 2) return null;
  const max = Math.max(...positions);
  const min = Math.min(...positions);
  const range = max - min || 1;
  const W = 60;
  const H = 20;
  const points = positions.map((p, i) => {
    const x = (i / (positions.length - 1)) * W;
    const y = H - ((p - min) / range) * H;
    return `${x},${y}`;
  });
  return (
    <svg width={W} height={H} className="inline-block ml-1 opacity-70" aria-hidden>
      <polyline points={points.join(' ')} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
    </svg>
  );
}

export function buildKeywordColumns(showParentTopic, showTrend, historyByKeyword, ke) {
  const cols = [
    {
      key: 'keyword',
      label: ke.table.keyword,
      render: (v, row) => (
        <div className="min-w-[140px]">
          <span className="font-medium text-foreground">{v}</span>
          {row.is_branded && (
            <span className="ml-1.5 text-[10px] bg-orange-500/20 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-full font-semibold">
              {ke.table.brand}
            </span>
          )}
          {row.is_question && (
            <span className="ml-1 text-[10px] bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold">
              {ke.table.question}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'sources',
      label: ke.table.sources,
      render: (v) => (
        <div className="flex flex-wrap gap-1 min-w-[100px]">
          {(v || []).map((s) => {
            const cfg = SOURCE_CONFIG[s] || { label: s, color: 'bg-gray-500/20 text-gray-700 dark:text-gray-300' };
            return <KwBadge key={s} label={cfg.label} colorClass={cfg.color} />;
          })}
        </div>
      ),
    },
    {
      key: 'intent',
      label: ke.table.intent,
      render: (v) =>
        v ? <KwBadge label={v} colorClass={INTENT_COLORS[v] || 'bg-gray-500/20 text-gray-700 dark:text-gray-300'} /> : '—',
    },
  ];

  if (showParentTopic) {
    cols.push({
      key: 'parent_topic',
      label: ke.table.parentTopic,
      render: (v) => (v ? <span className="text-xs text-muted-foreground truncate block max-w-xs lg:max-w-md">{v}</span> : '—'),
    });
  }

  cols.push(
    {
      key: 'difficulty',
      label: ke.table.kd,
      render: (v) =>
        v != null ? <span className={`font-bold tabular-nums ${difficultyColor(v)}`}>{v}</span> : '—',
    },
    {
      key: 'gsc_position',
      label: ke.table.position,
      render: (v, row) => {
        const history = historyByKeyword[row.keyword] || historyByKeyword[String(row.keyword || '')];
        return (
          <div className="flex items-center gap-1">
            <PositionBadge pos={v} />
            {history?.length >= 2 && <MiniSparkline history={history} />}
          </div>
        );
      },
    },
    {
      key: 'gsc_impressions',
      label: ke.table.impressions,
      render: (v) => (v != null ? <span className="tabular-nums">{Number(v).toLocaleString()}</span> : '—'),
    },
    {
      key: 'gsc_clicks',
      label: ke.table.clicks,
      render: (v) => (v != null ? <span className="tabular-nums">{Number(v).toLocaleString()}</span> : '—'),
    },
    {
      key: 'gsc_ctr',
      label: ke.table.ctr,
      render: (v) => <span className="tabular-nums">{formatGscCtr(v)}</span>,
    },
    {
      key: 'traffic_potential',
      label: ke.table.trafficPotential,
      render: (v) =>
        v ? (
          <span className="tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
            {Number(v).toLocaleString()}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'opportunity_clicks',
      label: ke.table.opportunityClicks,
      render: (v) =>
        v > 0 ? (
          <span className="tabular-nums text-yellow-700 dark:text-yellow-400 font-semibold">+{v.toLocaleString()}</span>
        ) : (
          '—'
        ),
    },
  );

  if (showTrend) {
    cols.push({
      key: 'trend',
      label: ke.table.trend,
      render: (v) => <TrendIcon trend={v} />,
    });
  }

  cols.push({
    key: 'recommended_action',
    label: ke.table.action,
    render: (v) => <span className="text-xs text-muted-foreground block min-w-[12rem]">{v || '—'}</span>,
  });

  return cols;
}
