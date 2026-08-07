
import { useEffect, useRef, useState } from 'react';

let mermaidReady: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      return mermaid;
    });
  }
  return mermaidReady;
}

let diagramCounter = 0;

export interface ChatMermaidDiagramProps {
  code: string;
  /** Rendered when the diagram fails to parse (e.g. a plain code block). */
  fallback: React.ReactNode;
}

export default function ChatMermaidDiagram({ code, fallback }: ChatMermaidDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`chat-mermaid-${++diagramCounter}`);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSvg(null);
    loadMermaid()
      .then((mermaid) => mermaid.render(idRef.current, code))
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) return <>{fallback}</>;
  if (!svg) return <div className="chat-prose-pre h-24 animate-pulse" aria-hidden />;

  return (
    <div
      className="chat-mermaid-diagram flex justify-center overflow-x-auto rounded-lg bg-[var(--code-bg)] p-3"
      // mermaid.render() SVG; securityLevel 'strict' sanitizes untrusted input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
