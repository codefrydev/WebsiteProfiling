import { Badge } from '../../index';
import { rtColor, formatMs, wcLabel, readingLabel, titleCharColor, metaCharColor } from '../../../utils/linkUtils';
import CopyBtn from '../CopyBtn';
import CharBar from '../CharBar';

export default function OverviewTab({ link }) {
  const wc = link.word_count || 0;
  const rl = link.reading_level || 0;
  const rlInfo = readingLabel(rl);
  const wcInfo = wcLabel(wc);
  const titleLen = (link.title || '').length;
  const metaLen = link.meta_description_len || (link.meta_description || '').length;

  const stats = [
    { label: 'Status',        value: <Badge value={link.status ?? ''} />,                                                  raw: true },
    { label: 'Response Time', value: <span className={`font-bold ${rtColor(link.response_time_ms)}`}>{formatMs(link.response_time_ms)}</span>, raw: true },
    { label: 'Depth',         value: link.depth != null ? link.depth : '—' },
    { label: 'Inlinks',       value: link.inlinks ?? 0 },
    { label: 'Outlinks',      value: link.outlinks ?? 0 },
    {
      label: 'Words',
      value: wc > 0
        ? <span className={wcInfo.color}>{wc.toLocaleString()} <span className="text-xs font-normal">{wcInfo.label}</span></span>
        : '—',
      raw: true,
    },
    {
      label: 'Reading Level',
      value: rl > 0
        ? <span className={rlInfo.color}>Grade {rl} <span className="text-xs font-normal">{rlInfo.label}</span></span>
        : '—',
      raw: true,
    },
    {
      label: 'Redirects',
      value: link.redirect_chain_length > 0
        ? <span className="text-yellow-400">{link.redirect_chain_length}</span>
        : '0',
      raw: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(({ label, value, raw }) => (
          <div key={label} className="bg-brand-900 border border-default rounded-xl p-3">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className="text-sm font-semibold">
              {raw ? value : <span className="text-bright">{value}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Content-Type */}
      {link.content_type && (
        <div className="bg-brand-900 border border-default rounded-xl p-3">
          <div className="text-xs text-slate-500 mb-1">Content-Type</div>
          <div className="text-xs font-mono text-slate-300">{link.content_type}</div>
        </div>
      )}

      {/* Title */}
      <div className="bg-brand-900 border border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-slate-500">Title</div>
          <CopyBtn text={link.title} />
        </div>
        <div className="text-sm text-slate-200">
          {link.title || <span className="text-red-400">Missing</span>}
        </div>
        <CharBar len={titleLen} max={60} colorFn={titleCharColor} />
      </div>

      {/* Meta Description */}
      <div className="bg-brand-900 border border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-slate-500">Meta Description</div>
          <CopyBtn text={link.meta_description} />
        </div>
        <div className="text-sm text-slate-200">
          {link.meta_description || <span className="text-red-400">Missing</span>}
        </div>
        <CharBar len={metaLen} max={160} colorFn={metaCharColor} />
      </div>

      {/* H1 */}
      <div className="bg-brand-900 border border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-slate-500">H1</div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${
              link.h1_count === 1
                ? 'bg-green-500/20 text-green-400'
                : link.h1_count === 0
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              {link.h1_count ?? 0} H1{link.h1_count !== 1 ? 's' : ''}
            </span>
            <CopyBtn text={link.h1} />
          </div>
        </div>
        <div className="text-sm text-slate-200">
          {link.h1 || <span className="text-slate-500">—</span>}
        </div>
      </div>
    </div>
  );
}
