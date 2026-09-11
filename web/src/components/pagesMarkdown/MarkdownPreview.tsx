
import ReactMarkdown from 'react-markdown';

interface MarkdownPreviewProps {
  content: string;
  raw?: boolean;
}

export default function MarkdownPreview({ content, raw = false }: MarkdownPreviewProps) {
  if (raw) {
    return (
      <pre className="text-xs text-md-sys-on-surface font-mono whitespace-pre-wrap break-words leading-relaxed overflow-auto">
        {content}
      </pre>
    );
  }
  return (
    <div className="prose prose-invert prose-sm max-w-none text-md-sys-on-surface overflow-auto">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
