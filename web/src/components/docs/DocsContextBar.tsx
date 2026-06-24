
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { docsBackLink, parseDocsFromParam } from '@/lib/docs/docsFromParam';
import { strings } from '@/lib/strings';

const d = strings.docs;

export interface DocsContextBarProps {
  title?: string;
  subtitle?: string;
}

export default function DocsContextBar({ title, subtitle }: DocsContextBarProps) {
  const [searchParams] = useSearchParams();
  const from = parseDocsFromParam(searchParams.get('from'));
  const back = from ? docsBackLink(from) : null;

  const displayTitle = title ?? d.pageTitle;
  const displaySubtitle = subtitle ?? d.pageSubtitle;

  return (
    <header className="chat-context-bar flex items-center gap-3 border-b border-muted/30 bg-[var(--chat-bg)] px-4 py-2.5">
      {back ? (
        <Link
          to={back.href}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-link transition-colors hover:bg-[var(--chat-surface-hover)] sm:text-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{back.label}</span>
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-bright" title={displayTitle}>
            {displayTitle}
          </p>
          {displaySubtitle ? (
            <p className="truncate text-xs text-muted-foreground" title={displaySubtitle}>
              {displaySubtitle}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
