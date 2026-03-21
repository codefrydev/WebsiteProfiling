import { Badge } from '../../index';
import { strings, format } from '../../../lib/strings';
import { rtColor, formatMs, wcLabel, readingLabel, titleCharColor, metaCharColor } from '../../../utils/linkUtils';
import CopyBtn from '../CopyBtn';
import CharBar from '../CharBar';

export default function OverviewTab({ link }) {
  const o = strings.components.linkTabs.overview;
  const sj = strings.common;
  const wc = link.word_count || 0;
  const rl = link.reading_level || 0;
  const rlInfo = readingLabel(rl);
  const wcInfo = wcLabel(wc);
  const titleLen = (link.title || '').length;
  const metaLen = link.meta_description_len || (link.meta_description || '').length;

  const stats = [
    { label: o.statStatus, value: <Badge value={link.status ?? ''} />, raw: true },
    {
      label: o.statResponseTime,
      value: <span className={`font-bold ${rtColor(link.response_time_ms)}`}>{formatMs(link.response_time_ms)}</span>,
      raw: true,
    },
    { label: o.statDepth, value: link.depth != null ? link.depth : sj.emDash },
    { label: o.statInlinks, value: link.inlinks ?? 0 },
    { label: o.statOutlinks, value: link.outlinks ?? 0 },
    {
      label: o.statWords,
      value:
        wc > 0 ? (
          <span className={wcInfo.color}>
            {wc.toLocaleString()} <span className="text-xs font-normal">{wcInfo.label}</span>
          </span>
        ) : (
          sj.emDash
        ),
      raw: true,
    },
    {
      label: o.statReadingLevel,
      value:
        rl > 0 ? (
          <span className={rlInfo.color}>
            {format(o.readingGrade, { n: rl })} <span className="text-xs font-normal">{rlInfo.label}</span>
          </span>
        ) : (
          sj.emDash
        ),
      raw: true,
    },
    {
      label: o.statRedirects,
      value:
        link.redirect_chain_length > 0 ? (
          <span className="text-yellow-400">{link.redirect_chain_length}</span>
        ) : (
          '0'
        ),
      raw: true,
    },
  ];

  return (
    <div className="space-y-6">
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

      {link.content_type && (
        <div className="bg-brand-900 border border-default rounded-xl p-3">
          <div className="text-xs text-slate-500 mb-1">{o.contentType}</div>
          <div className="text-xs font-mono text-slate-300">{link.content_type}</div>
        </div>
      )}

      <div className="bg-brand-900 border border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-slate-500">{o.fieldTitle}</div>
          <CopyBtn text={link.title} />
        </div>
        <div className="text-sm text-slate-200">
          {link.title || <span className="text-red-400">{o.missing}</span>}
        </div>
        <CharBar len={titleLen} max={60} colorFn={titleCharColor} />
      </div>

      <div className="bg-brand-900 border border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-slate-500">{o.fieldMetaDesc}</div>
          <CopyBtn text={link.meta_description} />
        </div>
        <div className="text-sm text-slate-200">
          {link.meta_description || <span className="text-red-400">{o.missing}</span>}
        </div>
        <CharBar len={metaLen} max={160} colorFn={metaCharColor} />
      </div>

      <div className="bg-brand-900 border border-default rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-slate-500">{o.fieldH1}</div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                link.h1_count === 1
                  ? 'bg-green-500/20 text-green-400'
                  : link.h1_count === 0
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {format(o.h1Count, { n: link.h1_count ?? 0, s: link.h1_count !== 1 ? 's' : '' })}
            </span>
            <CopyBtn text={link.h1} />
          </div>
        </div>
        <div className="text-sm text-slate-200">{link.h1 || <span className="text-slate-500">{sj.emDash}</span>}</div>
      </div>
    </div>
  );
}
