import { useState, useMemo } from 'react';
import { wcLabel, readingLabel, parseKeywords, normaliseKw } from '../../../utils/linkUtils';
import InlineRing from '../InlineRing';
import HeadingPills from '../HeadingPills';

export default function ContentTab({ link }) {
  const [kwHover, setKwHover] = useState(null);

  const wc = link.word_count || 0;
  const rl = link.reading_level || 0;
  const rlInfo = readingLabel(rl);
  const wcInfo = wcLabel(wc);
  const keywords = useMemo(() => parseKeywords(link.top_keywords), [link.top_keywords]);
  const ratio = link.content_html_ratio || 0;

  return (
    <div className="space-y-6">
      {/* Word Count + Reading Level */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-2">Word Count</div>
          <div className={`text-2xl font-bold ${wcInfo.color}`}>{wc.toLocaleString()}</div>
          <div className={`text-xs mt-1 ${wcInfo.color}`}>{wcInfo.label}</div>
          <div className="mt-2 bg-track rounded-full h-2 overflow-hidden">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500"
              style={{ width: `${Math.min(100, (wc / 2000) * 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-2">Reading Level</div>
          <div className={`text-2xl font-bold ${rlInfo.color}`}>{rl > 0 ? `Grade ${rl}` : '—'}</div>
          <div className={`text-xs mt-1 ${rlInfo.color}`}>{rlInfo.label}</div>
        </div>
      </div>

      {/* Content-to-HTML Ratio */}
      {ratio != null && (
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-3">Content-to-HTML Ratio</div>
          <div className="flex items-center gap-4">
            <InlineRing
              pct={Math.min(100, ratio * 100)}
              color={ratio > 0.3 ? '#22c55e' : ratio > 0.1 ? '#eab308' : '#ef4444'}
            />
            <div>
              <div className="text-xl font-bold text-bright">{(ratio * 100).toFixed(1)}%</div>
              <div className="text-xs text-slate-500">
                {ratio > 0.3
                  ? 'Good ratio — plenty of text content'
                  : ratio > 0.1
                    ? 'Moderate — consider adding more copy'
                    : 'Low — page is mostly markup with little text'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Heading Sequence */}
      {link.heading_sequence && (
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-3">Heading Structure</div>
          <HeadingPills sequence={link.heading_sequence} />
        </div>
      )}

      {/* Keywords */}
      {keywords.length > 0 && (
        <div className="bg-brand-900 border border-default rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-3">Top Keywords</div>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw, i) => {
              const { word, count } = normaliseKw(kw);
              return (
                <div key={i} className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setKwHover(i)}
                    onMouseLeave={() => setKwHover(null)}
                    className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2.5 py-1 rounded-full font-mono hover:bg-blue-500/20 transition-colors"
                  >
                    {word}
                  </button>
                  {kwHover === i && count != null && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 border border-default text-xs text-slate-300 px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                      {count} occurrences
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
