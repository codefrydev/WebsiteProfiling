import { useCallback, useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { strings } from '../../lib/strings';

const t = strings.components.copyBtn;

/** @param {import('react').ReactNode} children */
function codeChildrenToString(children) {
  if (children == null) return '';
  if (Array.isArray(children)) {
    return children.map((c) => (typeof c === 'string' ? c : String(c))).join('');
  }
  return String(children);
}

/**
 * @param {string | undefined} className - e.g. `language-jsx` from react-markdown
 * @returns {{ prismLang: string, displayLabel: string }}
 */
function parseFenceLanguage(className) {
  const raw = String(className || '').trim();
  const prefix = 'language-';
  const idx = raw.indexOf(prefix);
  if (idx === -1) {
    return { prismLang: 'plaintext', displayLabel: 'code' };
  }
  let rest = raw.slice(idx + prefix.length).trim();
  const sp = rest.search(/\s/);
  if (sp !== -1) rest = rest.slice(0, sp);
  if (!rest) {
    return { prismLang: 'plaintext', displayLabel: 'code' };
  }
  const lower = rest.toLowerCase();
  const alias = {
    'c++': 'cpp',
    'c#': 'csharp',
    csharp: 'csharp',
    'f#': 'fsharp',
    fs: 'fsharp',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    txt: 'plaintext',
    text: 'plaintext',
  };
  let prismLang = alias[lower] ?? lower;
  if (prismLang === 'ts') prismLang = 'typescript';
  if (prismLang === 'js') prismLang = 'javascript';
  return { prismLang, displayLabel: rest };
}

/**
 * Fenced code block with Prism highlighting, language bar, and copy (lazy-loaded via parent Suspense).
 */
export default function CodeFenceBlock({ className, children }) {
  const { prismLang, displayLabel } = parseFenceLanguage(className);
  const code = codeChildrenToString(children).replace(/\n$/, '');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
  }, [code]);

  return (
    <div className="group relative my-2 overflow-hidden rounded-xl border border-gray-700/90 bg-[#0d1117] shadow-lg">
      <div className="flex items-center justify-between gap-3 border-b border-gray-800 bg-[#161b22] px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
          <span className="truncate font-mono text-[11px] font-medium uppercase tracking-wider text-gray-400">
            {displayLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-700/80 hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? t.copied : t.copy}
        </button>
      </div>
      <SyntaxHighlighter
        language={prismLang}
        style={oneDark}
        showLineNumbers={false}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          padding: '0.75rem 1rem',
          fontSize: '12px',
          lineHeight: 1.65,
          background: '#0d1117',
        }}
        codeTagProps={{ className: 'font-mono' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
