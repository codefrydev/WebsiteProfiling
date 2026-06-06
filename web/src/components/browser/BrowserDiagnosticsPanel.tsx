import { useState } from 'react';
import type { BrowserDiagnostics } from '@/types/report';
import { strings, format } from '@/lib/strings';

export interface BrowserDiagnosticsPanelProps {
  browser: BrowserDiagnostics | undefined;
  /** When false, omit the section heading (e.g. inside an expanded row). */
  showTitle?: boolean;
  /** Override strings namespace; defaults to pageAnalysis copy. */
  title?: string;
  cleanMessage?: string;
}

export default function BrowserDiagnosticsPanel({
  browser,
  showTitle = true,
  title,
  cleanMessage,
}: BrowserDiagnosticsPanelProps) {
  const p = strings.components.linkTabs.pageAnalysis;
  const [expandedStacks, setExpandedStacks] = useState<Record<number, boolean>>({});

  if (!browser || typeof browser !== 'object') return null;

  const consoleMsgs = Array.isArray(browser.console) ? browser.console : [];
  const pageErrors = Array.isArray(browser.page_errors) ? browser.page_errors : [];
  const failedRequests = Array.isArray(browser.failed_requests) ? browser.failed_requests : [];
  const hasAny = consoleMsgs.length > 0 || pageErrors.length > 0 || failedRequests.length > 0;

  return (
    <div>
      {showTitle ? (
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
          {title ?? p.browserConsoleTitle}
        </h3>
      ) : null}
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">{cleanMessage ?? p.browserConsoleClean}</p>
      ) : (
        <div className="space-y-4">
          {consoleMsgs.length > 0 ? (
            <div className="bg-brand-900 border border-default rounded-lg overflow-hidden">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-default">
                {p.browserConsoleMessages}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-muted/60">
                    <th className="px-4 py-2 w-24">{p.browserThLevel}</th>
                    <th className="px-4 py-2">{p.browserThMessage}</th>
                    <th className="px-4 py-2 w-48">{p.browserThLocation}</th>
                  </tr>
                </thead>
                <tbody>
                  {consoleMsgs.map((msg, i) => (
                    <tr key={i} className="border-b border-muted/60 last:border-0">
                      <td className="px-4 py-2 text-xs uppercase text-muted-foreground">{msg.level || '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-foreground break-all">{msg.text || '—'}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground font-mono break-all">
                        {msg.source_url
                          ? `${msg.source_url}${msg.line != null ? `:${msg.line}` : ''}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {pageErrors.length > 0 ? (
            <div className="bg-brand-900 border border-default rounded-lg overflow-hidden">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-default">
                {p.browserUncaughtExceptions}
              </div>
              <ul className="divide-y divide-muted/60">
                {pageErrors.map((err, i) => (
                  <li key={i} className="px-4 py-3 text-sm">
                    <div className="font-mono text-foreground break-all">{err.message || '—'}</div>
                    {err.stack ? (
                      <button
                        type="button"
                        className="mt-1 text-xs text-brand-400 hover:underline"
                        onClick={() => setExpandedStacks((prev) => ({ ...prev, [i]: !prev[i] }))}
                      >
                        {expandedStacks[i] ? p.browserHideStack : p.browserShowStack}
                      </button>
                    ) : null}
                    {err.stack && expandedStacks[i] ? (
                      <pre className="mt-2 text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all">
                        {err.stack}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {failedRequests.length > 0 ? (
            <div className="bg-brand-900 border border-default rounded-lg overflow-hidden">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-default">
                {p.browserFailedRequests}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-muted/60">
                    <th className="px-4 py-2 w-20">{p.browserThMethod}</th>
                    <th className="px-4 py-2">{p.browserThUrl}</th>
                    <th className="px-4 py-2 w-48">{p.browserThFailure}</th>
                  </tr>
                </thead>
                <tbody>
                  {failedRequests.map((req, i) => (
                    <tr key={i} className="border-b border-muted/60 last:border-0">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{req.method || '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-foreground break-all">{req.url || '—'}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground break-all">{req.failure || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Build inspector issue rows from page browser diagnostics. */
export function browserInspectorIssueRows(
  browser: BrowserDiagnostics | undefined,
): Array<{ severity: string; message: string; detail?: string; recommendation?: string }> {
  if (!browser || typeof browser !== 'object') return [];
  const p = strings.components.linkTabs.pageAnalysis;
  const vj = strings.views.javascriptErrors;
  const rows: Array<{ severity: string; message: string; detail?: string; recommendation?: string }> = [];

  for (const msg of browser.console ?? []) {
    if (String(msg.level ?? '').toLowerCase() !== 'error') continue;
    const loc = msg.source_url
      ? `${msg.source_url}${msg.line != null ? `:${msg.line}` : ''}`
      : undefined;
    rows.push({
      severity: 'High',
      message: msg.text || vj.consoleErrorFallback,
      detail: loc,
      recommendation: vj.inspectorConsoleRecommendation,
    });
  }

  for (const err of browser.page_errors ?? []) {
    rows.push({
      severity: 'Critical',
      message: err.message || vj.exceptionFallback,
      detail: err.stack ? format(vj.stackPreview, { stack: err.stack.slice(0, 200) }) : undefined,
      recommendation: vj.inspectorExceptionRecommendation,
    });
  }

  return rows;
}
