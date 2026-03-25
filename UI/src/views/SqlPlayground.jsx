import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import initSqlJs from 'sql.js';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { keymap } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Database,
  Download,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Table2,
  Terminal,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { PageLayout, Button, Card } from '../components';
import { introspectDatabaseSchema } from '../lib/loadReportDb.js';
import { filterAuditExamplesForSchema } from '../lib/auditSqlExamples.js';
import { strings, format } from '../lib/strings';

const locateFile = (file) => `${import.meta.env.BASE_URL}${file}`;

const DEFAULT_AUDIT_SQL = `-- Open the Schema tab to browse tables, or Examples for guided queries.
SELECT name FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;
`;

const DIFF_BADGE = {
  Easy: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  Medium: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  Hard: 'bg-rose-500/15 text-rose-300 border border-rose-500/25',
};

/** Cap rows rendered so huge SELECT * does not blow layout or freeze the tab. */
const MAX_SQL_UI_ROWS = 500;

const MIN_COL_PX = 48;

/**
 * Single scroll surface, sticky header, resizable columns (drag handle), zebra rows, truncated cells.
 * @param {{ columns: string[], values: any[][], vr: object, format: Function }} props
 */
function SqlExplorerTable({ columns, values, vr, format }) {
  const [colWidths, setColWidths] = useState(null);
  const colKey = columns.join('\0');

  useEffect(() => {
    setColWidths(null);
  }, [colKey]);

  const startResize = useCallback((e, colIndex) => {
    e.preventDefault();
    e.stopPropagation();
    const tr = e.currentTarget.closest('tr');
    if (!tr) return;
    const thEls = tr.querySelectorAll('th');
    const initialWidths = Array.from(thEls).map((el) => Math.round(el.getBoundingClientRect().width));
    const startX = e.clientX;
    const startW = initialWidths[colIndex] ?? MIN_COL_PX;

    const onMove = (ev) => {
      ev.preventDefault();
      const newW = Math.max(MIN_COL_PX, Math.round(startW + (ev.clientX - startX)));
      setColWidths((prev) => {
        const base = prev ?? initialWidths;
        const next = [...base];
        next[colIndex] = newW;
        return next;
      });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const all = values || [];
  const total = all.length;
  const truncated = total > MAX_SQL_UI_ROWS;
  const rows = truncated ? all.slice(0, MAX_SQL_UI_ROWS) : all;

  const tablePixelWidth = colWidths?.reduce((a, b) => a + b, 0);

  const thBase =
    'sticky top-0 z-10 border-b border-default bg-brand-800/95 py-2.5 pl-3 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground shadow-[0_1px_0_0] shadow-black/20 backdrop-blur-sm relative pr-1';
  const tdBase =
    'border-b border-muted/25 px-3 py-1.5 align-top font-mono text-[11px]';

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {truncated && (
        <p className="shrink-0 rounded-md border border-amber-500/25 bg-amber-100/55 dark:bg-amber-500/10 px-2.5 py-2 text-xs text-amber-900 dark:text-amber-200/95">
          {format(vr.resultsUiTruncated, { shown: MAX_SQL_UI_ROWS, total })}
        </p>
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain rounded-lg border border-default bg-brand-900/50 shadow-inner">
        <table
          className={`border-collapse text-left text-xs leading-snug ${colWidths ? 'table-fixed' : 'w-max min-w-full'}`}
          style={tablePixelWidth ? { width: tablePixelWidth } : undefined}
        >
          <thead>
            <tr>
              {columns.map((col, ci) => (
                <th
                  key={`${ci}-${col}`}
                  className={thBase}
                  style={
                    colWidths
                      ? {
                          width: colWidths[ci],
                          minWidth: colWidths[ci],
                          maxWidth: colWidths[ci],
                        }
                      : { minWidth: '4.5rem' }
                  }
                >
                  <span className="block truncate whitespace-nowrap pr-3">{col}</span>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={format(vr.resizeColumnAria, { column: col })}
                    title={vr.resetColumnWidthsHint}
                    className="absolute right-0 top-0 z-30 h-full w-4 translate-x-1/2 cursor-col-resize border-0 bg-transparent p-0 hover:bg-blue-500/30 active:bg-blue-500/45"
                    onMouseDown={(ev) => startResize(ev, ci)}
                    onDoubleClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setColWidths(null);
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-bright/90">
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={`transition-colors hover:bg-blue-500/10 ${
                  ri % 2 === 1 ? 'bg-brand-900/40' : 'bg-brand-900/20'
                }`}
              >
                {row.map((cell, ci) => {
                  const text = cell == null ? null : String(cell);
                  return (
                    <td
                      key={ci}
                      className={`${tdBase} truncate ${colWidths ? '' : 'max-w-[min(18rem,30vw)] sm:max-w-[min(22rem,26vw)]'}`}
                      style={
                        colWidths
                          ? {
                              width: colWidths[ci],
                              minWidth: colWidths[ci],
                              maxWidth: colWidths[ci],
                            }
                          : undefined
                      }
                      title={text || undefined}
                    >
                      {text == null ? (
                        <span className="font-sans italic text-muted-foreground">null</span>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * @param {string} name
 */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * @param {import('sql.js').Database} db
 * @param {string} sqlStr
 */
function runAllSql(db, sqlStr) {
  const text = String(sqlStr || '').trim();
  if (!text) {
    return { ok: true, kind: 'empty', message: '' };
  }
  try {
    const resultSets = db.exec(text);
    const rowsModified = db.getRowsModified();
    return { ok: true, kind: 'ran', resultSets, rowsModified };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export default function SqlPlayground() {
  const vr = strings.views.sqlPlayground;
  const fileInputRef = useRef(null);
  const cmRef = useRef(null);
  const seededEditor = useRef(false);
  const runRef = useRef(() => {});

  const [sidebarTab, setSidebarTab] = useState('schema');
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState(null);
  const [dbStatus, setDbStatus] = useState('idle');
  const [dbError, setDbError] = useState(null);
  const [schema, setSchema] = useState({ tables: [] });
  const [sqlText, setSqlText] = useState(DEFAULT_AUDIT_SQL);
  const [out, setOut] = useState(null);
  const [exampleSearch, setExampleSearch] = useState('');
  const [exampleDiff, setExampleDiff] = useState('All');
  const [activeExample, setActiveExample] = useState(null);

  const sqlModuleRef = useRef(null);
  const dbRef = useRef(null);

  const tableNameSet = useMemo(
    () => new Set((schema.tables || []).map((t) => t.name)),
    [schema.tables]
  );

  const visibleExamples = useMemo(
    () => filterAuditExamplesForSchema(tableNameSet),
    [tableNameSet]
  );

  const filteredExamples = useMemo(() => {
    const q = exampleSearch.toLowerCase().trim();
    return visibleExamples.filter((ex) => {
      if (exampleDiff !== 'All' && ex.diff !== exampleDiff) return false;
      if (!q) return true;
      return (
        ex.title.toLowerCase().includes(q) ||
        ex.text.toLowerCase().includes(q) ||
        ex.sql.toLowerCase().includes(q)
      );
    });
  }, [visibleExamples, exampleSearch, exampleDiff]);

  const applyBuffer = useCallback((buf) => {
    const SQL = sqlModuleRef.current;
    if (!SQL) return;
    dbRef.current?.close();
    const database = new SQL.Database(new Uint8Array(buf));
    dbRef.current = database;
    setSchema(introspectDatabaseSchema(database, { maxTables: 128, maxColumnsPerTable: 96 }));
    setDbError(null);
    setDbStatus('ready');
    setOut(null);
    setActiveExample(null);
  }, []);

  const loadReportFromUrl = useCallback(async () => {
    const SQL = sqlModuleRef.current;
    if (!SQL) return;
    setDbStatus('loading');
    setDbError(null);
    try {
      const url = `${import.meta.env.BASE_URL}report.db`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${vr.loadFailedHttp} ${response.status}`);
      const buf = await response.arrayBuffer();
      applyBuffer(buf);
    } catch (e) {
      dbRef.current?.close();
      dbRef.current = null;
      setSchema({ tables: [] });
      setDbStatus('error');
      setDbError(e?.message || String(e));
    }
  }, [applyBuffer, vr.loadFailedHttp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const SQL = await initSqlJs({ locateFile });
        if (cancelled) return;
        sqlModuleRef.current = SQL;
        setEngineReady(true);
        setEngineError(null);
      } catch (e) {
        if (!cancelled) {
          setEngineError(e?.message || String(e));
          setEngineReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!engineReady) return;
    loadReportFromUrl();
  }, [engineReady, loadReportFromUrl]);

  useEffect(() => {
    if (dbStatus === 'ready' && !seededEditor.current) {
      seededEditor.current = true;
      setSqlText(DEFAULT_AUDIT_SQL);
    }
  }, [dbStatus]);

  const run = useCallback(() => {
    const db = dbRef.current;
    if (!db) return;
    const res = runAllSql(db, sqlText);
    setOut(res);
  }, [sqlText]);

  runRef.current = run;

  const cmExtensions = useMemo(
    () => [
      sql(),
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            runRef.current();
            return true;
          },
        },
      ]),
    ],
    []
  );

  const onPickLocalFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result;
        if (!(r instanceof ArrayBuffer)) {
          setDbStatus('error');
          setDbError(vr.localLoadError);
          return;
        }
        try {
          applyBuffer(r);
        } catch (err) {
          setDbStatus('error');
          setDbError(err?.message || vr.localLoadError);
        }
      };
      reader.onerror = () => {
        setDbStatus('error');
        setDbError(vr.localLoadError);
      };
      reader.readAsArrayBuffer(file);
    },
    [applyBuffer, vr.localLoadError]
  );

  const downloadDb = useCallback(() => {
    const db = dbRef.current;
    if (!db) return;
    try {
      const data = db.export();
      const blob = new Blob([data], { type: 'application/x-sqlite3' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'report-copy.sqlite';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setOut({ ok: false, error: e?.message || String(e) });
    }
  }, []);

  const insertSelectForTable = useCallback((tableName) => {
    setSqlText(`SELECT * FROM ${quoteIdent(tableName)} LIMIT 100;\n`);
    requestAnimationFrame(() => cmRef.current?.view?.focus());
  }, []);

  const insertColumnIdent = useCallback((colName) => {
    const view = cmRef.current?.view;
    const piece = quoteIdent(colName);
    if (!view) {
      setSqlText((prev) => `${prev}${piece}`);
      return;
    }
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: piece },
      selection: { anchor: from + piece.length },
    });
    view.focus();
  }, []);

  const loadExample = useCallback(
    (ex) => {
      setActiveExample(ex);
      setSqlText(format(vr.challengeStarter, { title: ex.title }));
      setSidebarTab('schema');
      requestAnimationFrame(() => cmRef.current?.view?.focus());
    },
    [vr.challengeStarter]
  );

  const insertSolution = useCallback(() => {
    if (!activeExample) return;
    setSqlText(`-- Solution: ${activeExample.title}\n${activeExample.sql}\n`);
    requestAnimationFrame(() => {
      runRef.current();
      cmRef.current?.view?.focus();
    });
  }, [activeExample]);

  const hasDb = dbStatus === 'ready' && dbRef.current;
  const busy = dbStatus === 'loading';

  const statusChip = useMemo(() => {
    if (engineError && !engineReady) {
      return { label: vr.statusError, spin: false, tone: 'error' };
    }
    if (!engineReady) {
      return { label: vr.statusEngine, spin: true, tone: 'muted' };
    }
    if (busy) {
      return { label: vr.statusDb, spin: true, tone: 'muted' };
    }
    if (dbStatus === 'error') {
      return { label: vr.statusError, spin: false, tone: 'error' };
    }
    if (hasDb) {
      return { label: vr.statusReady, spin: false, tone: 'ok' };
    }
    return { label: vr.statusError, spin: false, tone: 'muted' };
  }, [busy, dbStatus, engineError, engineReady, hasDb, vr]);

  const firstResultRows =
    out?.ok && out.kind === 'ran' && out.resultSets[0]?.values?.length != null
      ? out.resultSets[0].values.length
      : null;

  if (engineError && !engineReady) {
    return (
      <PageLayout className="flex min-h-0 flex-1 flex-col max-w-none !px-3 !pb-2 !pt-0 sm:!px-4 lg:!px-5">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-bright">{vr.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{vr.subtitle}</p>
        </div>
        <p className="text-red-400 text-sm">
          {vr.engineFailed}: {engineError}
        </p>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="flex min-h-0 flex-1 flex-col max-w-none !px-3 !pb-2 !pt-0 sm:!px-4 lg:!px-5 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept={vr.pickFileAccept}
        className="hidden"
        onChange={onPickLocalFile}
      />

      {/* Top bar */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0 mb-3 pr-1">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-600/90 flex items-center justify-center shrink-0 shadow-inner">
            <Database className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-bright tracking-tight">{vr.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{vr.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              statusChip.tone === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : statusChip.tone === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-800 dark:text-red-300'
                  : 'bg-brand-800 border-default text-muted-foreground'
            }`}
          >
            {statusChip.spin ? <Loader2 className="h-3.5 w-3.5 animate-spin text-link" /> : null}
            <span>{statusChip.label}</span>
          </div>
          <Button type="button" variant="secondary" onClick={loadReportFromUrl} disabled={!engineReady || busy}>
            <RefreshCw className={`h-4 w-4 shrink-0 ${busy ? 'animate-spin' : ''}`} />
            {busy ? vr.loadingReport : vr.reloadReport}
          </Button>
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={!engineReady}>
            <Upload className="h-4 w-4 shrink-0" />
            {vr.openLocalFile}
          </Button>
          <Button type="button" variant="secondary" onClick={downloadDb} disabled={!hasDb}>
            <Download className="h-4 w-4 shrink-0" />
            {vr.downloadDb}
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-4 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full lg:w-[min(100%,340px)] shrink-0 flex flex-col min-h-[200px] lg:min-h-0 max-h-[40vh] lg:max-h-none overflow-hidden rounded-xl border border-default bg-brand-800/50 shadow-[4px_0_24px_rgba(0,0,0,0.12)]">
          <div className="p-2 border-b border-default shrink-0">
            <div className="flex rounded-lg bg-brand-900/80 p-1 gap-0.5">
              <button
                type="button"
                onClick={() => setSidebarTab('schema')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all ${
                  sidebarTab === 'schema'
                    ? 'tab-active bg-blue-500/15 text-link border border-blue-500/25 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Table2 className="h-3.5 w-3.5 opacity-80" />
                {vr.tabSchema}
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('examples')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all ${
                  sidebarTab === 'examples'
                    ? 'tab-active bg-blue-500/15 text-link border border-blue-500/25 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 opacity-80" />
                {vr.tabExamples}
              </button>
            </div>
          </div>

          {sidebarTab === 'schema' && (
            <div className="p-3 overflow-y-auto flex-1 text-sm min-h-0">
              {busy && <p className="text-muted-foreground py-2">{vr.panelLoading}</p>}
              {!busy && dbStatus === 'error' && (
                <div className="space-y-2">
                  <p className="text-sm text-red-300/90">{dbError}</p>
                  <Button type="button" variant="secondary" className="w-full" onClick={loadReportFromUrl}>
                    {vr.reloadReport}
                  </Button>
                </div>
              )}
              {!busy && dbStatus !== 'error' && !hasDb && (
                <p className="text-muted-foreground py-2">{vr.panelNoDb}</p>
              )}
              {schema.error && <p className="text-xs text-amber-400/90 mb-2">{schema.error}</p>}
              {!busy && hasDb && schema.tables.length === 0 && !schema.error && (
                <p className="text-muted-foreground py-2">{vr.panelEmpty}</p>
              )}
              {!busy && hasDb && schema.tables.length > 0 && (
                <>
                  {schema.truncated && (
                    <p className="text-xs text-muted-foreground mb-3">{vr.schemaTruncated}</p>
                  )}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                    {vr.schemaTableHint}
                  </p>
                  <div className="space-y-4">
                    {schema.tables.map((t) => {
                      const rc = t.row_count;
                      const countLabel =
                        rc == null ? vr.rowCountUnknown : format(vr.rowsLabel, { count: rc });
                      return (
                        <div key={t.name}>
                          <button
                            type="button"
                            onClick={() => insertSelectForTable(t.name)}
                            className="font-semibold text-bright hover:text-link flex items-center gap-2 text-left w-full group transition-colors"
                          >
                            <Table2 className="h-3.5 w-3.5 text-muted-foreground group-hover:text-link shrink-0" />
                            <span className="font-mono truncate">{t.name}</span>
                            <span className="text-xs font-normal text-muted-foreground shrink-0">{countLabel}</span>
                          </button>
                          {t.columns?.length > 0 && (
                            <div className="pl-5 mt-1.5 space-y-0.5 border-l border-default ml-1.5">
                              <p className="text-[10px] text-muted-foreground mb-1">{vr.schemaColHint}</p>
                              {t.columns.map((c) => (
                                <button
                                  key={c.name}
                                  type="button"
                                  onClick={() => insertColumnIdent(c.name)}
                                  className="block w-full text-left text-xs text-muted-foreground hover:text-link hover:bg-brand-900/60 rounded px-1.5 py-0.5 -ml-1 transition-colors font-mono"
                                >
                                  <span className="inline-block w-1 h-1 bg-muted-foreground/40 rounded-full mr-2 align-middle" />
                                  {c.name}
                                  {c.pk ? (
                                    <span className="ml-1 text-[10px] text-link font-sans font-bold">{vr.pkBadge}</span>
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {sidebarTab === 'examples' && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-3 border-b border-default space-y-2 shrink-0 bg-brand-800/30">
                <input
                  type="search"
                  value={exampleSearch}
                  onChange={(e) => setExampleSearch(e.target.value)}
                  placeholder={vr.examplesSearchPlaceholder}
                  className="w-full px-3 py-2 text-sm bg-brand-900 border border-default rounded-lg outline-none focus:border-blue-500 text-foreground placeholder:text-muted-foreground"
                />
                <select
                  value={exampleDiff}
                  onChange={(e) => setExampleDiff(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-brand-900 border border-default rounded-lg outline-none focus:border-blue-500 text-foreground cursor-pointer"
                >
                  <option value="All">{vr.diffAll}</option>
                  <option value="Easy">{vr.diffEasy}</option>
                  <option value="Medium">{vr.diffMedium}</option>
                  <option value="Hard">{vr.diffHard}</option>
                </select>
              </div>
              <div className="p-2 overflow-y-auto flex-1 space-y-2 min-h-0 bg-brand-900/20">
                {filteredExamples.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-4">{vr.examplesEmpty}</p>
                ) : (
                  filteredExamples.map((q) => {
                    const badge = DIFF_BADGE[q.diff] || DIFF_BADGE.Medium;
                    return (
                      <button
                        key={`${q.title}-${q.diff}`}
                        type="button"
                        onClick={() => loadExample(q)}
                        className="w-full text-left p-3 rounded-xl border border-default bg-brand-800/80 hover:border-blue-500/40 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${badge}`}>
                            {q.diff}
                          </span>
                          <span className="font-semibold text-sm text-bright group-hover:text-link transition-colors truncate">
                            {q.title}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{q.text}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Workspace */}
        <section className="flex-1 flex flex-col min-w-0 min-h-0 gap-3 overflow-hidden">
          {/* Editor */}
          <Card className="flex max-h-[min(42vh,480px)] min-h-[200px] shrink-0 flex-col overflow-hidden border-default p-0" padding="none">
            <div className="px-3 py-2.5 border-b border-default flex justify-between items-center gap-2 shrink-0 bg-brand-800/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-bright min-w-0">
                <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{vr.sqlQueryLabel}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-muted-foreground border border-default rounded px-2 py-0.5 hidden sm:inline">
                  {vr.hintModEnter}
                </span>
                <Button type="button" onClick={run} disabled={!hasDb} className="py-1.5 px-4">
                  <Play className="h-3.5 w-3.5 shrink-0" />
                  {vr.run}
                </Button>
              </div>
            </div>

            {activeExample && (
              <div className="relative shrink-0 border-b border-blue-500/20 bg-blue-500/5 px-4 py-3 pr-10">
                <button
                  type="button"
                  onClick={() => setActiveExample(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-brand-800"
                  aria-label={vr.closeChallenge}
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${
                      DIFF_BADGE[activeExample.diff] || DIFF_BADGE.Medium
                    }`}
                  >
                    {activeExample.diff}
                  </span>
                  <h3 className="font-semibold text-sm text-bright">{activeExample.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{activeExample.text}</p>
                <Button type="button" variant="secondary" className="text-xs py-1.5" onClick={insertSolution}>
                  <Wand2 className="h-3.5 w-3.5 shrink-0" />
                  {vr.insertSolution}
                </Button>
              </div>
            )}

            <div className="flex-1 min-h-[180px] overflow-hidden [&_.cm-editor]:min-h-[180px] [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-sm">
              <CodeMirror
                ref={cmRef}
                value={sqlText}
                height="100%"
                theme={oneDark}
                extensions={cmExtensions}
                onChange={(v) => setSqlText(v)}
                editable={hasDb}
                readOnly={!hasDb}
                basicSetup={{ lineNumbers: true, foldGutter: true }}
                className="h-full border-0 overflow-hidden"
              />
            </div>
          </Card>

          {/* Results — flex-1 min-h-0 keeps grid inside viewport (explorer-style scroll) */}
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-default p-0" padding="none">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-default bg-brand-800/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-bright">
                <Table2 className="h-4 w-4 text-muted-foreground" />
                {vr.resultsLabel}
              </div>
              {firstResultRows != null && (
                <span className="rounded-md border border-default bg-brand-900/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {format(vr.rowsBadge, { count: firstResultRows })}
                  {out?.resultSets?.length > 1
                    ? ` · ${format(vr.resultSetsCount, { count: out.resultSets.length })}`
                    : ''}
                </span>
              )}
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {!out && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-muted-foreground">
                  <GitBranch className="mb-3 h-12 w-12 opacity-20" />
                  <p className="text-sm font-medium text-bright/80">{vr.resultsEmptyTitle}</p>
                  <p className="mt-1 max-w-xs text-center text-xs">{vr.resultsEmptyHint}</p>
                </div>
              )}

              {out && !out.ok && (
                <div className="m-3 shrink-0 rounded-lg border border-red-500/35 bg-red-500/10 p-4 text-sm whitespace-pre-wrap text-red-800 dark:text-red-200">
                  {out.error}
                </div>
              )}

              {out && out.ok && out.kind === 'empty' && (
                <p className="p-4 text-sm text-muted-foreground">{vr.emptySql}</p>
              )}

              {out && out.ok && out.kind === 'ran' && out.resultSets.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  {out.rowsModified > 0 ? `${vr.rowsAffected} ${out.rowsModified}` : vr.executedNoRows}
                </p>
              )}

              {out && out.ok && out.kind === 'ran' && out.resultSets.length > 0 && (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-2 pt-2">
                  <p className="shrink-0 px-1 text-xs text-muted-foreground">{vr.resultsExplorerHint}</p>
                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                    {out.resultSets.map((rs, idx) => (
                      <div
                        key={`rs-${idx}`}
                        className={`flex min-h-0 flex-col overflow-hidden ${
                          out.resultSets.length === 1 ? 'min-h-[140px] flex-1' : 'max-h-[min(48vh,520px)] flex-none'
                        }`}
                      >
                        <p className="mb-2 shrink-0 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {format(vr.resultSetTitle, { n: idx + 1 })}
                        </p>
                        {rs.columns.length === 0 ? (
                          <p className="px-1 text-sm text-muted-foreground">{vr.executedNoRows}</p>
                        ) : (
                          <SqlExplorerTable
                            columns={rs.columns}
                            values={rs.values || []}
                            vr={vr}
                            format={format}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {out.rowsModified > 0 && (
                    <p className="shrink-0 px-1 text-xs text-muted-foreground">{vr.rowsAffected} {out.rowsModified}</p>
                  )}
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>
    </PageLayout>
  );
}
