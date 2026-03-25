import { useMemo } from 'react';
import { ChevronRight, AlertTriangle } from 'lucide-react';

const H_COLORS = {
  h1: 'bg-blue-500/20 text-link-soft border-blue-500/30',
  h2: 'bg-purple-500/20 text-purple-800 dark:text-purple-300 border-purple-500/30',
  h3: 'bg-teal-500/20 text-teal-800 dark:text-teal-300 border-teal-500/30',
  h4: 'bg-brand-700/20 text-foreground border-brand-700/30',
  h5: 'bg-brand-700/20 text-muted-foreground border-brand-700/30',
  h6: 'bg-brand-700/20 text-muted-foreground border-brand-700/30',
};

export default function HeadingPills({ sequence }) {
  const pills = useMemo(() => {
    if (!sequence) return [];
    try {
      return JSON.parse(sequence);
    } catch {
      return typeof sequence === 'string'
        ? sequence.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    }
  }, [sequence]);

  if (!pills.length) {
    return <span className="text-muted-foreground text-xs">No heading data</span>;
  }

  let lastLevel = 0;
  const items = pills.map((h, i) => {
    const level = parseInt(h.replace('h', ''), 10) || 0;
    const skip = i > 0 && level > lastLevel + 1;
    lastLevel = level;
    return { h, level, skip };
  });

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {items.map(({ h, skip }, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <span
            className={`text-xs px-2 py-0.5 rounded border font-mono ${H_COLORS[h] || 'bg-brand-700/20 text-muted-foreground border-brand-700/30'}`}
            title={skip ? `⚠ Heading level skipped before ${h}` : h}
          >
            {h}
            {skip && <AlertTriangle className="inline h-2.5 w-2.5 ml-1 text-yellow-700 dark:text-yellow-400" />}
          </span>
        </div>
      ))}
    </div>
  );
}
