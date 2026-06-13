import type { LucideIcon } from 'lucide-react';
import HelpHint, { normalizeHintContent, type HelpHintContent } from './HelpHint';
import { metricHelpHint } from '@/lib/metricHelp';

export interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  hint?: HelpHintContent;
  helpKey?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export default function SectionHeader({
  icon: Icon,
  title,
  description,
  hint,
  helpKey,
  size = 'md',
  className = '',
}: SectionHeaderProps) {
  const hintContent = normalizeHintContent(hint ?? (helpKey ? metricHelpHint(helpKey) : undefined));
  const iconClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const titleClass = size === 'sm' ? 'text-base' : 'text-lg';
  const descClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const wrapClass = size === 'sm' ? 'pb-3 mb-1' : 'pb-4';

  return (
    <div className={`${wrapClass} ${className}`.trim()}>
      <div className="flex items-center gap-2">
        <Icon className={`${iconClass} text-link shrink-0`} aria-hidden />
        <h2 className={`${titleClass} font-bold text-bright`}>{title}</h2>
        {hintContent ? (
          <HelpHint title={hintContent.title} ariaLabel={`About ${title}`}>
            {hintContent.body}
          </HelpHint>
        ) : null}
      </div>
      {description ? (
        <p className={`mt-1 ${descClass} text-muted-foreground leading-relaxed max-w-3xl`}>{description}</p>
      ) : null}
    </div>
  );
}
