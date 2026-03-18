import { useMemo } from 'react';
import { parseKeywords, normaliseKw } from '../../utils/linkUtils';

export default function RowTooltip({ link, style }) {
  const kws = useMemo(() => parseKeywords(link.top_keywords).slice(0, 3), [link.top_keywords]);

  return (
    <div
      className="absolute z-50 bg-slate-800 border border-default rounded-xl shadow-2xl p-4 w-72 pointer-events-none"
      style={style}
    >
      <p className="text-xs font-semibold text-bright mb-1 truncate">{link.title || link.url}</p>
      {link.meta_description && (
        <p className="text-xs text-slate-400 line-clamp-2 mb-2">{link.meta_description}</p>
      )}
      <div className="flex gap-4 text-xs text-slate-500">
        {link.reading_level > 0 && (
          <span>Grade <span className="text-bright">{link.reading_level}</span></span>
        )}
        {link.word_count > 0 && (
          <span><span className="text-bright">{link.word_count}</span> words</span>
        )}
      </div>
      {kws.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {kws.map((kw, i) => {
            const { word } = normaliseKw(kw);
            return (
              <span key={i} className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">
                {word}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
