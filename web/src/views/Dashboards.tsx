import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Eye, Pencil, Save, Trash2, Printer } from 'lucide-react';
import { useContainerWidth, type Layout } from 'react-grid-layout';
import { PageLayout, EmptyState } from '@/components';
import type { ViewProps } from '@/types';
import { usePropertyForDomain } from '@/lib/dashboard/hooks/usePropertyForDomain';
import { DashboardCanvas } from '@/lib/dashboard/canvas/DashboardCanvas';
import { getDataset, datasetsByGroup } from '@/lib/dashboard/engine/datasets';
import {
  emptyDashboard,
  migrateDocToV2,
  newWidgetId,
  defaultWidgetLayout,
  type DashboardDoc,
  type Widget,
} from '@/lib/dashboard/engine/doc';
import type { QuerySpec, FilterValue } from '@/lib/dashboard/engine/types';
import { SlicerBar } from '@/lib/dashboard/interaction/SlicerBar';
import {
  applyInteractions,
  advanceDrill,
  type CrossFilter,
  type DrillState,
  type InteractionState,
} from '@/lib/dashboard/interaction/applyInteractions';
import {
  listDashboards,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  type DashboardRowClient,
} from '@/lib/dashboard/data/fetchDashboards';
import { ConfigPanel } from '@/lib/dashboard/builder/ConfigPanel';
import { DASHBOARD_PRESETS, getPreset } from '@/lib/dashboard/presets/presets';

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #dash-print-root, #dash-print-root * { visibility: visible !important; }
  #dash-print-root { position: absolute !important; left: 0; top: 0; width: 100% !important; height: auto !important; overflow: visible !important; }
  #dash-print-root .react-grid-item { break-inside: avoid; page-break-inside: avoid; }
}`;

const AUTOSAVE_MS = 1500;

/** Build a widget seeded from a dataset's default query + first compatible viz. */
function widgetForDataset(datasetId: string, y: number): Widget | null {
  const def = getDataset(datasetId);
  if (!def) return null;
  const viz = def.viz[0] ?? 'bar';
  return {
    id: newWidgetId(),
    title: '',
    datasetId,
    viz,
    query: { ...(def.defaultSpec ?? {}) } as QuerySpec,
    vizOptions: {},
    layout: { ...defaultWidgetLayout(viz), x: 0, y },
  };
}

/** A starter board so a freshly-created dashboard shows real charts immediately. */
function starterDoc(): DashboardDoc {
  const mk = (datasetId: string, viz: Widget['viz'], layout: Widget['layout']): Widget | null => {
    const def = getDataset(datasetId);
    if (!def) return null;
    return {
      id: newWidgetId(),
      title: '',
      datasetId,
      viz,
      query: { ...(def.defaultSpec ?? {}) } as QuerySpec,
      vizOptions: {},
      layout,
    };
  };
  const widgets = [
    mk('summary', 'kpi', { x: 0, y: 0, w: 3, h: 2 }),
    mk('status_counts', 'doughnut', { x: 3, y: 0, w: 4, h: 5 }),
    mk('categories', 'horizontal-bar', { x: 7, y: 0, w: 5, h: 5 }),
  ].filter((w): w is Widget => w !== null);
  return { version: 2, widgets, slicers: [] };
}

export default function Dashboards(_props: ViewProps) {
  const { propertyId, ready } = usePropertyForDomain();

  const [dashboards, setDashboards] = useState<DashboardRowClient[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [doc, setDoc] = useState<DashboardDoc>(emptyDashboard());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const { width: containerWidth, containerRef, mounted } = useContainerWidth();

  // Ephemeral board interactions (not persisted — reset on dashboard switch/reload).
  const [slicerValues, setSlicerValues] = useState<Record<string, FilterValue>>({});
  const [crossFilter, setCrossFilter] = useState<CrossFilter | null>(null);
  const [drill, setDrill] = useState<Record<string, DrillState>>({});

  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);
  const drillRef = useRef(drill);
  useEffect(() => { drillRef.current = drill; }, [drill]);

  const resetInteractions = useCallback(() => {
    setSlicerValues({});
    setCrossFilter(null);
    setDrill({});
  }, []);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);

  const loadDashboards = useCallback(async () => {
    if (!propertyId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listDashboards(propertyId);
      setDashboards(rows);
      const def = rows.find((r) => r.isDefault) ?? rows[0] ?? null;
      if (def) {
        setActiveId(def.id);
        setDoc(migrateDocToV2(def.layoutJson));
      } else {
        setActiveId(null);
        setDoc(emptyDashboard());
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { if (ready) void loadDashboards(); }, [ready, loadDashboards]);

  const scheduleSave = useCallback((next: DashboardDoc) => {
    if (!activeId || !propertyId) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      try {
        await updateDashboard(activeId, propertyId, { layoutJson: next });
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    }, AUTOSAVE_MS);
  }, [activeId, propertyId]);

  const updateDoc = useCallback((next: DashboardDoc) => {
    setDoc(next);
    scheduleSave(next);
  }, [scheduleSave]);

  const handleLayoutChange = useCallback((layout: Layout) => {
    if (!isEditing) return;
    const cur = docRef.current;
    const arr = Array.from(layout);
    const widgets = cur.widgets.map((w) => {
      const l = arr.find((ll) => ll.i === w.id);
      return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w;
    });
    updateDoc({ ...cur, widgets });
  }, [updateDoc, isEditing]);

  const addWidget = useCallback((datasetId: string) => {
    const cur = docRef.current;
    const bottomY = cur.widgets.reduce((m, w) => Math.max(m, w.layout.y + w.layout.h), 0);
    const widget = widgetForDataset(datasetId, bottomY);
    if (!widget) return;
    updateDoc({ ...cur, widgets: [...cur.widgets, widget] });
  }, [updateDoc]);

  const removeWidget = useCallback((id: string) => {
    const cur = docRef.current;
    updateDoc({ ...cur, widgets: cur.widgets.filter((w) => w.id !== id) });
  }, [updateDoc]);

  const duplicateWidget = useCallback((id: string) => {
    const cur = docRef.current;
    const src = cur.widgets.find((w) => w.id === id);
    if (!src) return;
    const bottomY = cur.widgets.reduce((m, w) => Math.max(m, w.layout.y + w.layout.h), 0);
    const copy: Widget = { ...src, id: newWidgetId(), layout: { ...src.layout, x: 0, y: bottomY } };
    updateDoc({ ...cur, widgets: [...cur.widgets, copy] });
  }, [updateDoc]);

  const updateWidget = useCallback((updated: Widget) => {
    const cur = docRef.current;
    updateDoc({ ...cur, widgets: cur.widgets.map((w) => (w.id === updated.id ? updated : w)) });
  }, [updateDoc]);

  // ── Interactions: slicers, cross-filter, drill ─────────────────────────────
  const setSlicerValue = useCallback((id: string, value: string[]) => {
    setSlicerValues((p) => ({ ...p, [id]: value }));
  }, []);

  const addSlicer = useCallback((field: string, datasetId: string, label: string) => {
    const cur = docRef.current;
    if (cur.slicers.some((s) => s.field === field)) return;
    updateDoc({
      ...cur,
      slicers: [...cur.slicers, { id: newWidgetId(), field, datasetId, label, control: 'multiselect', op: 'in' }],
    });
  }, [updateDoc]);

  const removeSlicer = useCallback((id: string) => {
    const cur = docRef.current;
    updateDoc({ ...cur, slicers: cur.slicers.filter((s) => s.id !== id) });
    setSlicerValues((p) => { const n = { ...p }; delete n[id]; return n; });
  }, [updateDoc]);

  const handleChartSelect = useCallback((widgetId: string, category: string) => {
    const w = docRef.current.widgets.find((x) => x.id === widgetId);
    if (!w) return;
    const ds = drillRef.current[widgetId];
    if (w.drillDimensions && w.drillDimensions.length >= 2) {
      const next = advanceDrill(w, ds, category);
      if (next) { setDrill((d) => ({ ...d, [widgetId]: next })); return; }
    }
    const field = (w.drillDimensions && ds ? w.drillDimensions[ds.level] : undefined) ?? w.query.groupBy;
    if (!field) return;
    setCrossFilter((prev) =>
      prev && prev.field === field && prev.value === category && prev.sourceWidgetId === widgetId
        ? null
        : { field, value: category, sourceWidgetId: widgetId },
    );
  }, []);

  const drillUp = useCallback((id: string) => {
    setDrill((d) => {
      const cur = d[id];
      if (!cur || cur.level <= 0) { const n = { ...d }; delete n[id]; return n; }
      return { ...d, [id]: { level: cur.level - 1, path: cur.path.slice(0, -1) } };
    });
  }, []);

  const specForWidget = useCallback(
    (w: Widget): QuerySpec => {
      const state: InteractionState = { slicerValues, crossFilter, drill };
      return applyInteractions(w, docRef.current.slicers, state);
    },
    [slicerValues, crossFilter, drill],
  );
  const drillForWidget = useCallback((w: Widget) => drill[w.id], [drill]);

  const handleCreate = useCallback(async () => {
    if (!propertyId) return;
    const seed = starterDoc();
    try {
      const created = await createDashboard(propertyId, 'New dashboard', seed);
      const isFirst = (dashboards ?? []).length === 0;
      let row = created;
      if (isFirst) row = await updateDashboard(created.id, propertyId, { isDefault: true });
      setDashboards((prev) => [row, ...prev.map((d) => ({ ...d, isDefault: isFirst ? false : d.isDefault }))]);
      setActiveId(row.id);
      setDoc(seed);
      resetInteractions();
      setIsEditing(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Create failed');
    }
  }, [propertyId, dashboards?.length ?? 0, resetInteractions]);

  const handleCreateFromPreset = useCallback(async (presetId: string) => {
    if (!propertyId) return;
    const preset = getPreset(presetId);
    if (!preset) return;
    const seed = preset.build();
    try {
      const created = await createDashboard(propertyId, preset.name, seed);
      const isFirst = (dashboards ?? []).length === 0;
      let row = created;
      if (isFirst) row = await updateDashboard(created.id, propertyId, { isDefault: true });
      setDashboards((prev) => [row, ...prev.map((d) => ({ ...d, isDefault: isFirst ? false : d.isDefault }))]);
      setActiveId(row.id);
      setDoc(seed);
      resetInteractions();
      setIsEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Create failed');
    }
  }, [propertyId, dashboards?.length ?? 0, resetInteractions]);

  const selectDashboard = useCallback((id: number) => {
    const found = (dashboards ?? []).find((d) => d.id === id);
    if (!found) return;
    setActiveId(id);
    setDoc(migrateDocToV2(found.layoutJson));
    setSelectedWidgetId(null);
    setIsEditing(false);
    resetInteractions();
  }, [dashboards, resetInteractions]);

  const handleDelete = useCallback(async () => {
    if (!propertyId || !activeId) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this dashboard?')) return;
    try {
      await deleteDashboard(activeId, propertyId);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Delete failed');
      return;
    }
    const next = (dashboards ?? []).filter((d) => d.id !== activeId);
    setDashboards(next);
    const n0 = next[0] ?? null;
    setActiveId(n0?.id ?? null);
    setDoc(n0 ? migrateDocToV2(n0.layoutJson) : emptyDashboard());
    setIsEditing(false);
    resetInteractions();
  }, [propertyId, activeId, dashboards, resetInteractions]);

  const groups = useMemo(() => datasetsByGroup(), []);
  const widgets = doc.widgets ?? [];
  const slicers = doc.slicers ?? [];
  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedWidgetId) ?? null,
    [widgets, selectedWidgetId],
  );

  if (ready && !propertyId) {
    return (
      <PageLayout>
        <EmptyState
          title="No property found"
          description="Run an audit for a domain first, then come back to build dashboards."
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout variant="fullHeight" className="flex flex-col min-h-0 gap-0">
      <style>{PRINT_CSS}</style>
      <div className="mb-3 flex flex-wrap items-center gap-2 shrink-0">
            {(dashboards ?? []).length > 0 && (
              <select
                value={activeId ?? ''}
                onChange={(e) => selectDashboard(Number(e.target.value))}
                className="px-2 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {(dashboards ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.isDefault ? ' ★' : ''}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => void handleCreate()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-default hover:bg-brand-700/80 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>

            {activeId && (
              <button
                onClick={() => {
                  setIsEditing((e) => {
                    const next = !e;
                    if (!next) setSelectedWidgetId(null);
                    return next;
                  });
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  isEditing ? 'border-blue-500/40 bg-blue-500/10 text-link font-semibold shadow-xs' : 'border-default hover:bg-brand-700/80 text-muted-foreground hover:text-foreground'
                }`}
              >
                {isEditing ? <><Eye className="h-3.5 w-3.5" /> View</> : <><Pencil className="h-3.5 w-3.5" /> Edit</>}
              </button>
            )}

            {activeId && (
              <button
                onClick={() => window.print()}
                title="Export to PDF (print)"
                className="p-1.5 rounded-lg border border-default hover:bg-brand-700/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Printer className="h-4 w-4" />
              </button>
            )}

            {activeId && isEditing && (
              <>
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) addWidget(e.target.value); e.currentTarget.value = ''; }}
                  className="px-2.5 py-1.5 text-sm bg-link hover:bg-link-hover text-white rounded-lg font-medium shadow-xs focus:outline-none cursor-pointer transition-colors"
                >
                  <option value="">+ Add widget…</option>
                  {groups.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.datasets.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  onClick={() => void handleDelete()}
                  title="Delete dashboard"
                  className="p-1.5 rounded-lg border border-default hover:border-red-500/30 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}

            {saving && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Save className="h-3.5 w-3.5 animate-pulse" /> Saving…
              </span>
            )}
            {saveError && <span className="text-xs text-red-600 dark:text-red-400 font-medium">{saveError}</span>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-muted-foreground text-sm">Loading dashboards…</p>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <p className="text-sm text-red-400">{loadError}</p>
          <button onClick={() => void loadDashboards()} className="px-4 py-2 rounded-lg border border-default hover:bg-brand-700/80 text-sm text-muted-foreground hover:text-foreground transition-colors">Retry</button>
        </div>
      ) : !activeId ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 px-4 py-8 max-w-3xl mx-auto w-full">
          <EmptyState title="No dashboards yet" description="Start from a template or a blank board." />
          <div className="w-full grid gap-2 sm:grid-cols-2">
            {DASHBOARD_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => void handleCreateFromPreset(p.id)}
                className="text-left px-4 py-3 rounded-xl border border-default hover:border-blue-500/50 hover:bg-brand-800/40 transition-colors"
              >
                <p className="text-sm font-semibold text-bright">{p.name}</p>
                <p className="text-xs text-blue-400/80 mt-0.5">{p.tagline}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
              </button>
            ))}
          </div>
          <button onClick={() => void handleCreate()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" /> Blank dashboard
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <SlicerBar
            slicers={slicers}
            slicerValues={slicerValues}
            crossFilter={crossFilter}
            editing={isEditing}
            onSetValue={setSlicerValue}
            onAddSlicer={addSlicer}
            onRemoveSlicer={removeSlicer}
            onClearCrossFilter={() => setCrossFilter(null)}
          />
          <div className="flex-1 min-h-0 flex">
            <div ref={containerRef} id="dash-print-root" className="flex-1 min-h-0 overflow-y-auto py-3 px-1">
              {widgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-default rounded-xl text-muted-foreground text-sm gap-2 mx-1">
                  <p className="font-medium">This dashboard is empty.</p>
                  <p className="text-xs">{isEditing ? 'Use “+ Add widget…” to add a chart.' : 'Switch to Edit to add widgets.'}</p>
                </div>
              ) : mounted && containerWidth > 0 ? (
                <DashboardCanvas
                  widgets={widgets}
                  isEditing={isEditing}
                  containerWidth={containerWidth}
                  selectedWidgetId={selectedWidgetId}
                  specForWidget={specForWidget}
                  drillForWidget={drillForWidget}
                  onLayoutChange={handleLayoutChange}
                  onEditWidget={setSelectedWidgetId}
                  onRemoveWidget={removeWidget}
                  onDuplicateWidget={duplicateWidget}
                  onCrossFilter={handleChartSelect}
                  onDrillUp={drillUp}
                />
              ) : null}
            </div>
            {isEditing && selectedWidget && (
              <ConfigPanel
                widget={selectedWidget}
                onChange={updateWidget}
                onClose={() => setSelectedWidgetId(null)}
                onDelete={() => { removeWidget(selectedWidget.id); setSelectedWidgetId(null); }}
              />
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
}
