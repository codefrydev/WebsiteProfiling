import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

const linkClass =
  'text-emerald-300/95 underline decoration-emerald-400/40 underline-offset-2 hover:text-emerald-200 hover:decoration-emerald-300/70';

const components = {
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass} {...props}>
      {children}
    </a>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-bright">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-muted-foreground line-through">{children}</del>,
  hr: () => <hr className="my-3 border-0 border-t border-default" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-emerald-500/45 pl-3 text-foreground [&_p]:mb-1 [&_p:last-child]:mb-0">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => (
    <h1 className="mt-3 mb-1.5 text-lg font-semibold tracking-tight text-bright first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-3 mb-1.5 text-base font-semibold tracking-tight text-bright first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2 mb-1 text-[15px] font-semibold text-bright first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-2 mb-1 text-[13px] font-semibold text-foreground first:mt-0">{children}</h4>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-outside list-disc space-y-1 pl-5 marker:text-muted-foreground [&_ul]:mt-2 [&_ol]:mt-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-outside list-decimal space-y-1 pl-5 marker:text-muted-foreground [&_ul]:mt-2 [&_ol]:mt-2">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">{children}</li>
  ),
  table: ({ children }) => (
    <div className="my-2 max-w-full overflow-x-auto rounded-lg border border-default bg-brand-700/30">
      <table className="w-full min-w-[16rem] border-collapse text-left text-[12px] text-foreground">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-brand-700/40">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-default even:bg-brand-700/20">{children}</tr>,
  th: ({ children }) => (
    <th className="border border-default px-2 py-1.5 text-left font-semibold text-bright">{children}</th>
  ),
  td: ({ children }) => <td className="border border-default px-2 py-1.5 align-top">{children}</td>,
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-x-auto rounded-xl border border-default bg-brand-900/50 p-3 font-mono text-[12px] leading-relaxed text-foreground [&>code]:!block [&>code]:!w-full [&>code]:whitespace-pre [&>code]:!rounded-none [&>code]:!bg-transparent [&>code]:!p-0 [&>code]:font-mono [&>code]:!text-[12px] [&>code]:!text-foreground">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isFence = Boolean(className && /language-/.test(className));
    if (isFence) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded-md bg-brand-700/50 px-1.5 py-0.5 font-mono text-[0.88em] text-emerald-700 dark:text-emerald-200/95"
        {...props}
      >
        {children}
      </code>
    );
  },
};

const remarkPlugins = [remarkGfm, remarkBreaks];

/**
 * Renders assistant message text as GitHub-flavored Markdown (lists, tables, code fences, etc.).
 * Raw HTML in the source is not executed (react-markdown default).
 */
export default function AssistantMarkdown({ children }) {
  const text = typeof children === 'string' ? children : '';
  return (
    <div className="chat-md min-w-0 text-[13px] leading-[1.65] text-foreground [&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:translate-y-0.5 [&_input[type=checkbox]]:accent-emerald-500">
      <Markdown remarkPlugins={remarkPlugins} components={components}>
        {text}
      </Markdown>
    </div>
  );
}
