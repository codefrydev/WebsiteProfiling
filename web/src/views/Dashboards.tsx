'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import { LayoutGrid, Plus, Eye, Pencil, Save, Copy, LayoutTemplate, Sparkles } from 'lucide-react';
import { useActivePropertyContext } from '@/hooks/useActivePropertyContext';
import { PageLayout, PageHeader, EmptyState } from '@/components';
import {
  DashboardGrid,
  DashboardSwitcher,
  WidgetPalette,
  WidgetConfigPanel,
  PresetPicker,
  listDashboards,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  getDashboardPreset,
  clearWidgetDataCache,
  DASHBOARD_PRESETS,
  type DashboardRowClient,
  emptyDashboard,
  type Widget,
  type DashboardDoc,
  type DashboardFilter,
  type CrossFilter,
} from '@/lib/dashboard';
import { FilterBar } from '@/lib/dashboard/builder/FilterBar';
import AiAssistModal from '@/lib/dashboard/builder/AiAssistModal';
import type { ViewProps } from '@/types';
import { apiUrl } from '@/lib/publicBase';

const AUTOSAVE_DELAY_MS = 1500;

export default function Dashboards({ searchQuery: _searchQuery = '' }: ViewProps) {
  const { propertyId: configPropertyId, reportId, contextReady } = useActivePropertyContext();
  // When active_property_id is not set in the pipeline config (e.g. user hasn't connected
  // Google integrations), fall back to the first property found in the database.
  const [autoPropertyId, setAutoPropertyId] = useState<number | null>(null);
  const [autoResolveDone, setAutoResolveDone] = useState(false);

  useEffect(() => {
    if (!contextReady || configPropertyId) { setAutoResolveDone(true); return; }
    let cancelled = false;
    fetch(apiUrl('/properties'))
      .then((r) => r.json())
      .then((d: { properties?: { id: number; name: string }[] }) => {
        if (cancelled) return;
        const first = d.properties?.[0] ?? null;
        if (first) setAutoPropertyId(first.id);
      })
      .catch(() => { /* ignore — will show no-property state */ })
      .finally(() => { if (!cancelled) setAutoResolveDone(true); });
    return () => { cancelled = true; };
  }, [contextReady, configPropertyId]);

  const propertyId = configPropertyId ?? autoPropertyId;
  // Gate: not ready until either config property is known OR auto-resolve has finished
  const ready = contextReady && (!!configPropertyId || autoResolveDone);

  // Drop cached widget results when the active report/property changes so widgets
  // refetch fresh data instead of serving a stale cached payload.
  useEffect(() => { clearWidgetDataCache(); }, [propertyId, reportId]);

  const [dashboards, setDashboards] = useState<DashboardRowClient[]>([]);
  const [activeDashboardId, setActiveDashboardId] = useState<number | null>(null);
  const [doc, setDoc] = useState<DashboardDoc>(emptyDashboard());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [aiAssistMode, setAiAssistMode] = useState<'widget' | 'dashboard'>('widget');
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  // Dimension values collected from fetched widget data — used to populate filter option lists.
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  // Always-current snapshot of dashboards for use inside async callbacks without
  // needing to add dashboards to every handler's dep array.
  const dashboardsRef = useRef<DashboardRowClient[]>(dashboards);
  useEffect(() => { dashboardsRef.current = dashboards; }, [dashboards]);
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);

  // Measure container for react-grid-layout
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(w);
    });
    obs.observe(containerRef.current);
    setContainerWidth(containerRef.current.offsetWidth);
    return () => obs.disconnect();
  }, []);

  // Load dashboard list
  const loadDashboards = useCallback(async () => {
    if (!propertyId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listDashboards(propertyId);
      setDashboards(rows);
      const def = rows.find((r) => r.isDefault) ?? rows[0] ?? null;
      if (def) {
        setActiveDashboardId(def.id);
        setDoc(def.layoutJson ?? emptyDashboard());
      } else {
        setActiveDashboardId(null);
        setDoc(emptyDashboard());
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (!ready) return;
    void loadDashboards();
  }, [ready, loadDashboards]);

  // Autosave debounce ref — cleared on unmount to avoid post-unmount state updates
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);

  const scheduleSave = useCallback(
    (newDoc: DashboardDoc) => {
      if (!activeDashboardId || !propertyId) return;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(async () => {
        setSaving(true);
        setSaveError(null);
        try {
          const updated = await updateDashboard(activeDashboardId, propertyId, { layoutJson: newDoc });
          setDashboards((prev) => prev.map((d) => d.id === updated.id ? updated : d));
        } catch (e) {
          setSaveError(e instanceof Error ? e.message : 'Save failed');
        } finally {
          setSaving(false);
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [activeDashboardId, propertyId],
  );

  const updateDoc = useCallback(
    (newDoc: DashboardDoc) => {
      setDoc(newDoc);
      scheduleSave(newDoc);
    },
    [scheduleSave],
  );

  // Persist grid positions only after drag/resize completes — not during drag.
  // Updating controlled layout on every move fights RGL's internal state and causes jumps.
  const handleLayoutChange = useCallback(
    (layouts: import('react-grid-layout').Layout) => {
      const current = docRef.current;
      const newWidgets = current.widgets.map((w) => {
        const l = Array.from(layouts).find((ll) => ll.i === w.id);
        if (!l) return w;
        return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
      });
      updateDoc({ ...current, widgets: newWidgets });
    },
    [updateDoc],
  );

  const handleAddWidget = useCallback(
    (widget: Widget) => {
      // Place the new widget at the bottom of the grid. defaultWidgetLayout() uses
      // y: Infinity (react-grid-layout's "append" sentinel), but Infinity serializes
      // to null in JSON — which would corrupt the saved layout. Resolve it to a real
      // row now so autosave persists a valid position.
      const bottomY = doc.widgets.reduce(
        (max, w) => Math.max(max, Number.isFinite(w.layout.y) ? w.layout.y + w.layout.h : 0),
        0,
      );
      const placed: Widget = Number.isFinite(widget.layout.y)
        ? widget
        : { ...widget, layout: { ...widget.layout, x: 0, y: bottomY } };
      updateDoc({ ...doc, widgets: [...doc.widgets, placed] });
    },
    [doc, updateDoc],
  );

  const handleRemoveWidget = useCallback(
    (id: string) => {
      updateDoc({ ...doc, widgets: doc.widgets.filter((w) => w.id !== id) });
    },
    [doc, updateDoc],
  );

  const handleEditWidget = useCallback((id: string) => setEditingWidgetId(id), []);

  const handleSaveWidget = useCallback(
    (updated: Widget) => {
      updateDoc({ ...doc, widgets: doc.widgets.map((w) => w.id === updated.id ? updated : w) });
      setEditingWidgetId(null);
    },
    [doc, updateDoc],
  );

  const handleSelectDashboard = useCallback(
    (id: number) => {
      const found = dashboardsRef.current.find((d) => d.id === id);
      if (!found) return;
      setActiveDashboardId(id);
      setDoc(found.layoutJson ?? emptyDashboard());
      setIsEditing(false);
    },
    [],
  );

  const handleCreateDashboard = useCallback(
    async (name: string) => {
      if (!propertyId) return;
      const newDoc = emptyDashboard();
      try {
        const created = await createDashboard(propertyId, name, newDoc);
        setDashboards((prev) => [created, ...prev]);
        setActiveDashboardId(created.id);
        setDoc(newDoc);
        setIsEditing(true);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Create failed');
      }
    },
    [propertyId],
  );

  const handleCreateFromPreset = useCallback(
    async (presetId: string) => {
      if (!propertyId) return;
      const preset = getDashboardPreset(presetId);
      if (!preset) return;
      const newDoc = preset.build();
      try {
        const created = await createDashboard(propertyId, preset.name, newDoc);
        const isFirst = dashboardsRef.current.length === 0;
        let row = created;
        if (isFirst) {
          row = await updateDashboard(created.id, propertyId, { isDefault: true });
        }
        setDashboards((prev) => {
          const added = { ...row, isDefault: isFirst ? true : row.isDefault };
          if (!isFirst) return [added, ...prev];
          return [added, ...prev.map((d) => ({ ...d, isDefault: false }))];
        });
        setActiveDashboardId(row.id);
        setDoc(newDoc);
        setIsEditing(false);
        setShowPresets(false);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Create failed');
      }
    },
    [propertyId],
  );

  const handleCreateFromAi = useCallback(
    async (name: string, aiDoc: DashboardDoc) => {
      if (!propertyId) return;
      try {
        const created = await createDashboard(propertyId, name, aiDoc);
        const isFirst = dashboardsRef.current.length === 0;
        let row = created;
        if (isFirst) {
          row = await updateDashboard(created.id, propertyId, { isDefault: true });
        }
        setDashboards((prev) => {
          const added = { ...row, isDefault: isFirst ? true : row.isDefault };
          if (!isFirst) return [added, ...prev];
          return [added, ...prev.map((d) => ({ ...d, isDefault: false }))];
        });
        setActiveDashboardId(row.id);
        setDoc(aiDoc);
        setIsEditing(false);
        setShowAiAssist(false);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Create failed');
      }
    },
    [propertyId],
  );

  const handleDeleteDashboard = useCallback(
    async (id: number) => {
      if (!propertyId) return;
      try {
        await deleteDashboard(id, propertyId);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Delete failed');
        return;
      }
      // Use ref so dashboards is always fresh without putting it in deps
      // (avoiding re-creation on every autosave).
      const next = dashboardsRef.current.filter((d) => d.id !== id);
      setDashboards(next);
      if (activeDashboardId === id) {
        const next0 = next[0] ?? null;
        setActiveDashboardId(next0?.id ?? null);
        setDoc(next0?.layoutJson ?? emptyDashboard());
        setIsEditing(false);
      }
    },
    [propertyId, activeDashboardId],
  );

  const handleSetDefault = useCallback(
    async (id: number) => {
      if (!propertyId) return;
      try {
        const updated = await updateDashboard(id, propertyId, { isDefault: true });
        setDashboards((prev) =>
          prev.map((d) => ({
            ...d,
            isDefault: d.id === updated.id,
            layoutJson: d.id === updated.id ? updated.layoutJson : d.layoutJson,
            name: d.id === updated.id ? updated.name : d.name,
            updatedAt: d.id === updated.id ? updated.updatedAt : d.updatedAt,
          })),
        );
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Set default failed');
      }
    },
    [propertyId],
  );

  const handleDuplicateDashboard = useCallback(async () => {
    if (!propertyId || !activeDashboardId) return;
    const src = dashboardsRef.current.find((d) => d.id === activeDashboardId);
    if (!src) return;
    try {
      const created = await createDashboard(propertyId, `${src.name} (copy)`, src.layoutJson);
      setDashboards((prev) => [created, ...prev]);
      setActiveDashboardId(created.id);
      setDoc(created.layoutJson ?? emptyDashboard());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Duplicate failed');
    }
  }, [propertyId, activeDashboardId]);

  // ── Filter / cross-filter handlers ─────────────────────────────────────────

  const handleFiltersChange = useCallback(
    (filters: DashboardFilter[]) => {
      updateDoc({ ...doc, filters });
    },
    [doc, updateDoc],
  );

  const handleCrossFilter = useCallback(
    (field: string, value: string, sourceWidgetId: string) => {
      const crossFilters = doc.crossFilters ?? [];
      const existing = crossFilters.find((cf) => cf.field === field && cf.value === value);
      if (existing) {
        // Toggle off
        updateDoc({ ...doc, crossFilters: crossFilters.filter((cf) => cf.id !== existing.id) });
      } else {
        const newCf: CrossFilter = {
          id: `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          field,
          value,
          sourceWidgetId,
        };
        updateDoc({ ...doc, crossFilters: [...crossFilters, newCf] });
      }
    },
    [doc, updateDoc],
  );

  const handleCrossFilterRemove = useCallback(
    (id: string) => {
      updateDoc({ ...doc, crossFilters: (doc.crossFilters ?? []).filter((cf) => cf.id !== id) });
    },
    [doc, updateDoc],
  );

  const handleCrossFilterClearAll = useCallback(
    () => { updateDoc({ ...doc, crossFilters: [] }); },
    [doc, updateDoc],
  );

  const handleDataReady = useCallback(
    (widgetId: string, rows: Record<string, unknown>[]) => {
      if (!rows.length) return;
      // Collect distinct string values for every string-valued column
      setDimensionValues((prev) => {
        const next = { ...prev };
        const sample = rows[0];
        for (const key of Object.keys(sample)) {
          const vals = new Set(rows.map((r) => String(r[key] ?? '')).filter(Boolean));
          if (vals.size > 0 && vals.size <= 200) {
            next[key] = [...vals].sort();
          }
        }
        return next;
      });
      void widgetId; // suppress unused warning
    },
    [],
  );

  const activeFilters = useMemo(
    () => [...(doc.filters ?? []), ...(doc.crossFilters ?? [])] as (DashboardFilter | CrossFilter)[],
    [doc.filters, doc.crossFilters],
  );

  const editingWidget = editingWidgetId
    ? doc.widgets.find((w) => w.id === editingWidgetId) ?? null
    : null;

  if (!propertyId && ready) {
    return (
      <PageLayout>
        <EmptyState
          title="No property found"
          description="Run an audit first to create a property, then come back to build dashboards."
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout variant="fullHeight" className="flex flex-col min-h-0 gap-0">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Dashboards
            <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 leading-none">
              alpha
            </span>
          </span>
        }
        icon={<LayoutGrid className="h-7 w-7 text-blue-400" />}
        subtitle="Build custom dashboards from any audit metric"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DashboardSwitcher
              dashboards={dashboards}
              activeDashboardId={activeDashboardId}
              onSelect={handleSelectDashboard}
              onCreate={handleCreateDashboard}
              onCreateFromPreset={handleCreateFromPreset}
              onBrowsePresets={() => setShowPresets(true)}
              onDelete={handleDeleteDashboard}
              onSetDefault={handleSetDefault}
            />

            {activeDashboardId && (
              <>
                <button
                  onClick={handleDuplicateDashboard}
                  title="Duplicate dashboard"
                  className="p-1.5 rounded-lg border border-default hover:bg-white/5 text-muted-foreground hover:text-bright transition-colors"
                >
                  <Copy className="h-4 w-4" />
                </button>

                <button
                  onClick={() => setIsEditing((e) => !e)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    isEditing
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-default hover:bg-white/5 text-muted-foreground hover:text-bright'
                  }`}
                >
                  {isEditing ? (
                    <><Eye className="h-3.5 w-3.5" /> View</>
                  ) : (
                    <><Pencil className="h-3.5 w-3.5" /> Edit</>
                  )}
                </button>

                {isEditing && (
                  <>
                    <button
                      onClick={() => { setAiAssistMode('widget'); setShowAiAssist(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/40 hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> AI widget
                    </button>
                    <button
                      onClick={() => setShowPalette(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add widget
                    </button>
                  </>
                )}
              </>
            )}

            {saving && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Save className="h-3.5 w-3.5 animate-pulse" /> Saving…
              </span>
            )}
            {saveError && (
              <span className="text-xs text-red-400">Save failed</span>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-muted-foreground text-sm">Loading dashboards…</p>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <p className="text-sm text-red-400">{loadError}</p>
          <button
            onClick={() => void loadDashboards()}
            className="px-4 py-2 rounded-lg border border-default hover:bg-white/5 text-sm text-muted-foreground hover:text-bright transition-colors"
          >
            Retry
          </button>
        </div>
      ) : !activeDashboardId ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 px-4 py-8 max-w-3xl mx-auto w-full">
          <EmptyState
            title="No dashboards yet"
            description="Start from a template or create a blank dashboard."
          />
          <div className="w-full grid gap-2 sm:grid-cols-2">
            {DASHBOARD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => void handleCreateFromPreset(preset.id)}
                className="text-left px-4 py-3 rounded-xl border border-default hover:border-blue-500/50 hover:bg-brand-800/40 transition-colors"
              >
                <p className="text-sm font-semibold text-bright">{preset.name}</p>
                <p className="text-xs text-blue-400/80 mt-0.5">{preset.tagline}</p>
                <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              onClick={() => setShowPresets(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-default hover:bg-white/5 text-sm text-muted-foreground hover:text-bright transition-colors"
            >
              <LayoutTemplate className="h-4 w-4" /> All templates
            </button>
            <button
              onClick={() => { setAiAssistMode('dashboard'); setShowAiAssist(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/40 hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
            >
              <Sparkles className="h-4 w-4" /> Generate with AI
            </button>
            <button
              onClick={() => void handleCreateDashboard('My dashboard')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              <Plus className="h-4 w-4" /> Blank dashboard
            </button>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <FilterBar
            filters={doc.filters ?? []}
            crossFilters={doc.crossFilters ?? []}
            widgets={doc.widgets}
            isEditing={isEditing}
            dimensionValues={dimensionValues}
            onFiltersChange={handleFiltersChange}
            onCrossFilterRemove={handleCrossFilterRemove}
            onCrossFilterClearAll={handleCrossFilterClearAll}
          />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <DashboardGrid
              widgets={doc.widgets}
              propertyId={propertyId ?? 0}
              reportId={reportId}
              isEditing={isEditing}
              containerWidth={containerWidth}
              activeFilters={activeFilters}
              onLayoutChange={handleLayoutChange}
              onRemoveWidget={handleRemoveWidget}
              onEditWidget={handleEditWidget}
              onCrossFilter={handleCrossFilter}
              onDataReady={handleDataReady}
            />
          </div>
        </div>
      )}

      {showPalette && (
        <WidgetPalette onAdd={handleAddWidget} onClose={() => setShowPalette(false)} />
      )}

      {showPresets && (
        <PresetPicker
          onSelect={(id) => void handleCreateFromPreset(id)}
          onClose={() => setShowPresets(false)}
        />
      )}

      {editingWidget && (
        <WidgetConfigPanel
          widget={editingWidget}
          onSave={handleSaveWidget}
          onClose={() => setEditingWidgetId(null)}
          propertyId={propertyId ?? undefined}
          reportId={reportId}
        />
      )}

      {showAiAssist && aiAssistMode === 'widget' && (
        <AiAssistModal
          mode="widget"
          propertyId={propertyId ?? undefined}
          reportId={reportId}
          bottomY={doc.widgets.reduce(
            (max, w) => Math.max(max, Number.isFinite(w.layout.y) ? w.layout.y + w.layout.h : 0),
            0,
          )}
          onAddWidget={(w) => { handleAddWidget(w); setShowAiAssist(false); }}
          onClose={() => setShowAiAssist(false)}
        />
      )}

      {showAiAssist && aiAssistMode === 'dashboard' && (
        <AiAssistModal
          mode="dashboard"
          propertyId={propertyId ?? undefined}
          reportId={reportId}
          onCreateDashboard={(name, aiDoc) => void handleCreateFromAi(name, aiDoc)}
          onClose={() => setShowAiAssist(false)}
        />
      )}
    </PageLayout>
  );
}
