import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

const LazyCodeFence = lazy(() => import('./CodeFenceBlock.jsx'));

const linkClass =
  'text-emerald-700 underline decoration-emerald-500/45 underline-offset-2 hover:text-emerald-800 hover:decoration-emerald-600/55 dark:text-emerald-300/95 dark:decoration-emerald-400/40 dark:hover:text-emerald-200 dark:hover:decoration-emerald-300/70';

const remarkPlugins = [remarkGfm, remarkBreaks];

const MarkdownFencePreContext = createContext(false);

/** @param {import('react').ReactNode} ch */
function normalizeCodeChildren(ch) {
  if (ch == null) return '';
  if (Array.isArray(ch)) return ch.map((x) => (typeof x === 'string' ? x : String(x))).join('');
  return String(ch);
}

function MarkdownCode({ className, children, enableSyntaxHighlight, ...props }) {
  const inFencePre = useContext(MarkdownFencePreContext);
  const codeStr = normalizeCodeChildren(children);
  if (!inFencePre) {
    return (
      <code
        className="rounded-md bg-brand-700/50 px-1.5 py-0.5 font-mono text-[0.88em] text-emerald-700 dark:text-emerald-200/95"
        {...props}
      >
        {children}
      </code>
    );
  }
  if (enableSyntaxHighlight) {
    return (
      <Suspense
        fallback={
          <code className={className} {...props}>
            {codeStr}
          </code>
        }
      >
        <LazyCodeFence className={className}>{codeStr}</LazyCodeFence>
      </Suspense>
    );
  }
  return (
    <code
      className={`block w-full whitespace-pre overflow-x-auto rounded-none bg-transparent p-3 font-mono text-[12px] leading-relaxed text-foreground ${className || ''}`}
      {...props}
    >
      {codeStr}
    </code>
  );
}

function isHttpsImageUrl(src) {
  if (src == null || typeof src !== 'string') return false;
  try {
    const u = new URL(String(src).trim());
    return u.protocol === 'https:';
  } catch {
    return /^https:\/\//i.test(String(src).trim());
  }
}

/**
 * Renders assistant message text as GitHub-flavored Markdown (lists, tables, code fences, etc.).
 * Raw HTML in the source is not executed (react-markdown default).
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {boolean} [props.enableImageLightbox]
 * @param {boolean} [props.enableSyntaxHighlight]
 * @param {boolean} [props.httpsOnlyImages] — when true, skip remote images that are not https:
 */
export default function AssistantMarkdown({
  children,
  enableImageLightbox = true,
  enableSyntaxHighlight = true,
  httpsOnlyImages = true,
}) {
  const text = typeof children === 'string' ? children : '';
  const [lightbox, setLightbox] = useState(null);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, closeLightbox]);

  const components = useMemo(() => {
    const Code = (p) => <MarkdownCode {...p} enableSyntaxHighlight={enableSyntaxHighlight} />;
    const Img = ({ src, alt, title, ...rest }) => {
      if (!src || (httpsOnlyImages && !isHttpsImageUrl(src))) {
        return null;
      }
      const caption = typeof alt === 'string' && alt.trim() ? alt.trim() : '';
      const imgEl = (
        <img
          src={src}
          alt={alt ?? ''}
          title={title}
          loading="lazy"
          className="max-h-[min(40vh,320px)] max-w-full rounded-xl border border-default object-contain shadow-md"
          {...rest}
        />
      );
      const wrap = (
        <span className="my-3 block">
          {imgEl}
          {caption ? (
            <p className="mt-2 text-center text-[11px] italic text-muted-foreground">{caption}</p>
          ) : null}
        </span>
      );
      if (!enableImageLightbox) {
        return wrap;
      }
      return (
        <button
          type="button"
          className="my-3 block w-full cursor-zoom-in rounded-xl border border-transparent p-0 text-left transition hover:border-emerald-500/35"
          onClick={() => setLightbox({ src, alt: alt ?? '' })}
          aria-label={alt ? `${alt} (enlarge)` : 'Enlarge image'}
        >
          {imgEl}
          {caption ? (
            <p className="mt-2 text-center text-[11px] italic text-muted-foreground">{caption}</p>
          ) : null}
        </button>
      );
    };

    return {
      a: ({ href, children: ch, ...props }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass} {...props}>
          {ch}
        </a>
      ),
      p: ({ children: ch }) => <p className="mb-2 last:mb-0 leading-relaxed">{ch}</p>,
      strong: ({ children: ch }) => <strong className="font-semibold text-bright">{ch}</strong>,
      em: ({ children: ch }) => <em className="italic">{ch}</em>,
      del: ({ children: ch }) => <del className="text-muted-foreground line-through">{ch}</del>,
      hr: () => <hr className="my-3 border-0 border-t border-default" />,
      blockquote: ({ children: ch }) => (
        <blockquote className="my-2 border-l-2 border-emerald-500/45 pl-3 text-foreground [&_p]:mb-1 [&_p:last-child]:mb-0">
          {ch}
        </blockquote>
      ),
      h1: ({ children: ch }) => (
        <h1 className="mt-3 mb-1.5 text-lg font-semibold tracking-tight text-bright first:mt-0">{ch}</h1>
      ),
      h2: ({ children: ch }) => (
        <h2 className="mt-3 mb-1.5 text-base font-semibold tracking-tight text-bright first:mt-0">{ch}</h2>
      ),
      h3: ({ children: ch }) => (
        <h3 className="mt-2 mb-1 text-[15px] font-semibold text-bright first:mt-0">{ch}</h3>
      ),
      h4: ({ children: ch }) => (
        <h4 className="mt-2 mb-1 text-[13px] font-semibold text-foreground first:mt-0">{ch}</h4>
      ),
      ul: ({ children: ch }) => (
        <ul className="my-2 list-outside list-disc space-y-1 pl-5 marker:text-muted-foreground [&_ul]:mt-2 [&_ol]:mt-2">
          {ch}
        </ul>
      ),
      ol: ({ children: ch }) => (
        <ol className="my-2 list-outside list-decimal space-y-1 pl-5 marker:text-muted-foreground [&_ul]:mt-2 [&_ol]:mt-2">
          {ch}
        </ol>
      ),
      li: ({ children: ch }) => (
        <li className="leading-relaxed [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">{ch}</li>
      ),
      table: ({ children: ch }) => (
        <div className="my-2 max-w-full overflow-x-auto rounded-lg border border-default bg-brand-700/30">
          <table className="w-full min-w-[16rem] border-collapse text-left text-[12px] text-foreground">{ch}</table>
        </div>
      ),
      thead: ({ children: ch }) => <thead className="bg-brand-700/40">{ch}</thead>,
      tbody: ({ children: ch }) => <tbody>{ch}</tbody>,
      tr: ({ children: ch }) => <tr className="border-b border-default even:bg-brand-700/20">{ch}</tr>,
      th: ({ children: ch }) => (
        <th className="border border-default px-2 py-1.5 text-left font-semibold text-bright">{ch}</th>
      ),
      td: ({ children: ch }) => <td className="border border-default px-2 py-1.5 align-top">{ch}</td>,
      img: Img,
      pre: ({ children: ch }) => (
        <MarkdownFencePreContext.Provider value={true}>
          <div className="my-2 min-w-0 max-w-full overflow-x-auto font-mono text-[12px] leading-relaxed text-foreground">
            {ch}
          </div>
        </MarkdownFencePreContext.Provider>
      ),
      code: Code,
    };
  }, [enableImageLightbox, enableSyntaxHighlight, httpsOnlyImages]);

  return (
    <div className="chat-md min-w-0 text-[13px] leading-[1.65] text-foreground [&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:translate-y-0.5 [&_input[type=checkbox]]:accent-emerald-500">
      <Markdown remarkPlugins={remarkPlugins} components={components}>
        {text}
      </Markdown>
      {lightbox ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            aria-label="Close image preview"
            onClick={closeLightbox}
          />
          <div
            className="relative z-[81] max-h-[min(92vh,900px)] max-w-[min(96vw,1200px)] overflow-auto rounded-lg border border-default bg-brand-900 p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.src}
              alt={lightbox.alt}
              className="max-h-[min(88vh,860px)] w-auto max-w-full object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
