
import {
  BarChart3,
  FileText,
  HelpCircle,
  Key,
  Lightbulb,
  List,
  MousePointerClick,
  Split,
  Zap,
  Target,
  ArrowRightLeft,
  Layers,
  BookOpen,
  Users,
} from 'lucide-react';
import type { KeywordTabId } from './keywordTabMeta';
import { strings } from '../../lib/strings';

const TAB_ICONS: Record<KeywordTabId, typeof Key> = {
  overview: BarChart3,
  all: List,
  questions: HelpCircle,
  quickwins: Zap,
  striking: Target,
  lostclicks: MousePointerClick,
  opportunities: Lightbulb,
  cannib: Split,
  alignment: ArrowRightLeft,
  bypage: FileText,
  topics: Layers,
  templates: BookOpen,
  competitor: Users,
};

export interface KeywordTabBannerProps {
  tab: KeywordTabId;
  count?: number | null;
}

export default function KeywordTabBanner({ tab, count }: KeywordTabBannerProps) {
  const help = strings.views.keywordsExplorer.tabHelp as Record<KeywordTabId, string>;
  const Icon = TAB_ICONS[tab] || Key;
  const title = (strings.views.keywordsExplorer.tabs as Record<KeywordTabId, string>)[tab];

  return (
    <div className="px-4 py-3 border-b border-default bg-brand-900/50 flex flex-wrap items-start gap-3">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-bright">{title}</h2>
            {count != null && count > 0 && (
              <span className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full bg-brand-800 text-muted-foreground">
                {count.toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-3xl">{help[tab]}</p>
        </div>
      </div>
    </div>
  );
}
