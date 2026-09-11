
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { VizOptions } from '@/lib/dashboard/engine/doc';

export function TextWidget({ options }: { options?: VizOptions }) {
  const text = options?.text ?? '';
  return (
    <div className="prose prose-invert prose-sm max-w-none h-full overflow-auto text-sm text-md-sys-on-surface">
      {text.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      ) : (
        <p className="text-md-sys-on-surface-variant">Empty text widget — edit to add content.</p>
      )}
    </div>
  );
}
