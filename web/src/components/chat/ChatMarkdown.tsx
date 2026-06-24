
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Components } from 'react-markdown';
import { preprocessChatMarkdown } from '@/components/chat/preprocessChatMarkdown';

function flattenText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return flattenText(props?.children);
  }
  return '';
}

function insightHeadingClass(children: unknown, base: string): string {
  const text = flattenText(children);
  return /💡|power insights|recommended actions|quick wins|priority fixes/i.test(text)
    ? `${base} chat-prose-insight-title`
    : base;
}

export interface ChatMarkdownProps {
  content: string;
  streaming?: boolean;
  nested?: boolean;
}

export default function ChatMarkdown({ content, streaming, nested }: ChatMarkdownProps) {
  const normalized = useMemo(() => preprocessChatMarkdown(content), [content]);

  const components = useMemo<Components>(
    () => ({
      h1: ({ children }) => <h3 className={insightHeadingClass(children, 'chat-prose-h1')}>{children}</h3>,
      h2: ({ children }) => <h4 className={insightHeadingClass(children, 'chat-prose-h2')}>{children}</h4>,
      h3: ({ children }) => <h5 className={insightHeadingClass(children, 'chat-prose-h3')}>{children}</h5>,
      p: ({ children }) => <p className="chat-prose-p">{children}</p>,
      ul: ({ children }) => <ul className="chat-prose-ul">{children}</ul>,
      ol: ({ children }) => <ol className="chat-prose-ol">{children}</ol>,
      li: ({ children }) => <li className="chat-prose-li">{children}</li>,
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noreferrer" className="chat-prose-a">
          {children}
        </a>
      ),
      strong: ({ children }) => <strong className="font-semibold text-bright">{children}</strong>,
      em: ({ children }) => <em>{children}</em>,
      blockquote: ({ children }) => {
        const text = String(children ?? '');
        const isInsight = /💡|power insights|key takeaway/i.test(text);
        return (
          <blockquote
            className={isInsight ? 'chat-prose-insight' : 'chat-prose-blockquote'}
          >
            {children}
          </blockquote>
        );
      },
      hr: () => <hr className="chat-prose-hr" />,
      table: ({ children }) => (
        <div className="chat-prose-table-wrap">
          <table className="chat-prose-table">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr className="chat-prose-tr">{children}</tr>,
      th: ({ children }) => <th className="chat-prose-th">{children}</th>,
      td: ({ children }) => <td className="chat-prose-td">{children}</td>,
      pre: ({ children }) => <div className="chat-prose-pre">{children}</div>,
      code: ({ className, children }) => {
        const text = String(children).replace(/\n$/, '');
        const lang = /language-(\w+)/.exec(className || '')?.[1];
        if (lang) {
          return (
            <SyntaxHighlighter
              language={lang}
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                background: 'var(--code-bg)',
              }}
            >
              {text}
            </SyntaxHighlighter>
          );
        }
        return <code className="chat-inline-code">{children}</code>;
      },
    }),
    [],
  );

  if (!normalized.trim()) return null;

  return (
    <div
      className={`chat-prose ${streaming ? 'opacity-90' : ''} ${nested ? 'chat-prose-nested' : ''}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
