import { useMemo } from 'react';
import { ChevronRight, AlertTriangle } from 'lucide-react';

const H_COLORS: Record<string, string> = {
  h1: 'bg-md-sys-primary-container/25 text-md-sys-primary border-md-sys-primary/30',
  h2: 'bg-md-sys-tertiary-container/25 text-md-sys-tertiary border-md-sys-tertiary/30',
  h3: 'bg-md-sys-secondary-container/25 text-md-sys-secondary border-md-sys-secondary/30',
  h4: 'bg-md-sys-surface-container-high/20 text-md-sys-on-surface border-md-sys-outline-variant/40',
  h5: 'bg-md-sys-surface-container-high/20 text-md-sys-on-surface-variant border-md-sys-outline-variant/40',
  h6: 'bg-md-sys-surface-container-high/20 text-md-sys-on-surface-variant border-md-sys-outline-variant/40',
};

export interface HeadingPillsProps {
  sequence: string | null | undefined;
}

export default function HeadingPills({ sequence }: HeadingPillsProps) {
  const pills = useMemo((): string[] => {
    if (!sequence) return [];
    try {
      const parsed = JSON.parse(sequence) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return typeof sequence === 'string'
        ? sequence.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    }
  }, [sequence]);

  if (!pills.length) {
    return <span className="text-md-sys-on-surface-variant text-xs">No heading data</span>;
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
          {i > 0 && <ChevronRight className="h-3 w-3 text-md-sys-on-surface-variant" />}
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full border font-mono ${H_COLORS[h] || 'bg-md-sys-surface-container-high/20 text-md-sys-on-surface-variant border-md-sys-outline-variant/40'}`}
            title={skip ? `⚠ Heading level skipped before ${h}` : h}
          >
            {h}
            {skip && <AlertTriangle className="inline h-2.5 w-2.5 ml-1 text-md-sys-warning" />}
          </span>
        </div>
      ))}
    </div>
  );
}
