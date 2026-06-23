
import ReactMarkdown from 'react-markdown';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

export function MarkdownViz({ opts }: VizRenderProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none overflow-auto text-foreground">
      <ReactMarkdown>{opts.markdownContent ?? '*No content. Edit this widget to add markdown.*'}</ReactMarkdown>
    </div>
  );
}
