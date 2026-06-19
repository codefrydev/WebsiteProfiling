'use client';

import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import type { Widget, VizType, AggregateOp, ChartSortOrder, CustomChartSpec } from '@/lib/dashboard/types';
import { catalogEntry, dimensions, measures } from '@/lib/dashboard/catalog/catalog';
import { VIZ_LABELS } from '@/lib/dashboard/viz/labels';
import { DASHSCRIPT_HELP } from '@/lib/dashboard/script/eval';
import AiAssistModal from '@/lib/dashboard/builder/AiAssistModal';
import type { AiScriptResult } from '@/lib/dashboard/ai/generate';
import { sanitizeChartSpec } from '@/lib/dashboard/ai/generate';

const AGG_LABELS: Record<AggregateOp, string> = {
  none: 'None',
  sum: 'Sum',
  avg: 'Average',
  count: 'Count',
  max: 'Max',
  min: 'Min',
};

const CHART_VIZ: VizType[] = [
  'bar', 'horizontal-bar', 'ranked-bar', 'line', 'area', 'pie', 'doughnut', 'stacked-bar', 'sparkline',
];
const METRIC_VIZ: VizType[] = ['kpi', 'stat-card', 'gauge', 'sparkline'];

interface WidgetConfigPanelProps {
  widget: Widget;
  onSave: (updated: Widget) => void;
  onClose: () => void;
  propertyId?: number;
  reportId?: number | null;
}

export default function WidgetConfigPanel({ widget, onSave, onClose, propertyId, reportId }: WidgetConfigPanelProps) {
  const catalog = catalogEntry(widget.binding.toolName);
  const [title, setTitle] = useState(widget.title);
  const [viz, setViz] = useState<VizType>(widget.viz);
  const [xField, setXField] = useState(widget.binding.xField ?? '');
  const [yField, setYField] = useState(widget.binding.yField ?? '');
  const [seriesField, setSeriesField] = useState(widget.binding.seriesField ?? '');
  const [valueField, setValueField] = useState(widget.binding.valueField ?? '');
  const [aggregate, setAggregate] = useState<AggregateOp>(widget.binding.aggregate ?? 'none');
  const [format, setFormat] = useState(widget.options?.format ?? '');
  const [tableLimit, setTableLimit] = useState(widget.options?.tableLimit ?? 50);
  const [chartMaxItems, setChartMaxItems] = useState(widget.options?.chartMaxItems ?? 20);
  const [chartSort, setChartSort] = useState<ChartSortOrder>(widget.options?.chartSort ?? 'none');
  const [showLegend, setShowLegend] = useState(widget.options?.showLegend ?? false);
  const [subtitle, setSubtitle] = useState(widget.options?.subtitle ?? '');
  const [markdownContent, setMarkdownContent] = useState(widget.options?.markdownContent ?? '');
  const [useScript, setUseScript] = useState(widget.binding.useScript ?? false);
  const [measure, setMeasure] = useState(widget.binding.measure ?? '');
  const [transform, setTransform] = useState(widget.binding.transform ?? '');
  const [configMode, setConfigMode] = useState<'simple' | 'script'>(useScript ? 'script' : 'simple');
  const [chartSpecJson, setChartSpecJson] = useState(
    widget.options?.chartSpec ? JSON.stringify(widget.options.chartSpec, null, 2) : '',
  );
  const [chartSpecError, setChartSpecError] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);

  const baseCompatibleViz = catalog?.compatibleViz ?? Object.keys(VIZ_LABELS) as VizType[];
  // Always include the current viz in the options so an AI-set 'custom-chart'
  // (or any future viz not in the catalog) is visible in the dropdown.
  const compatibleViz: VizType[] = baseCompatibleViz.includes(viz)
    ? baseCompatibleViz
    : [...baseCompatibleViz, viz];
  const availableDimensions = catalog ? dimensions(catalog) : [];
  const availableMeasures = catalog ? measures(catalog) : [];
  const allFields = catalog?.fields ?? [];
  const isChart = CHART_VIZ.includes(viz);
  const isMetric = METRIC_VIZ.includes(viz);

  const handleSave = () => {
    // Validate chartSpec JSON if present
    let parsedChartSpec: CustomChartSpec | undefined;
    if (viz === 'custom-chart' && chartSpecJson.trim()) {
      try {
        parsedChartSpec = sanitizeChartSpec(JSON.parse(chartSpecJson));
        setChartSpecError(null);
      } catch (e) {
        setChartSpecError(e instanceof Error ? e.message : 'Invalid JSON');
        return;
      }
    }

    onSave({
      ...widget,
      title,
      viz,
      binding: {
        ...widget.binding,
        xField: xField || undefined,
        yField: yField || undefined,
        seriesField: seriesField || undefined,
        valueField: valueField || undefined,
        aggregate: aggregate !== 'none' ? aggregate : undefined,
        useScript: configMode === 'script' || undefined,
        measure: configMode === 'script' && measure.trim() ? measure.trim() : undefined,
        transform: configMode === 'script' && transform.trim() ? transform.trim() : undefined,
      },
      options: {
        ...widget.options,
        format: format || undefined,
        tableLimit: tableLimit !== 50 ? tableLimit : undefined,
        chartMaxItems: chartMaxItems !== 20 ? chartMaxItems : undefined,
        chartSort: chartSort !== 'none' ? chartSort : undefined,
        showLegend: showLegend || undefined,
        subtitle: subtitle || undefined,
        markdownContent: viz === 'markdown' ? markdownContent : undefined,
        chartSpec: parsedChartSpec,
        aiPrompt: widget.options?.aiPrompt,
      },
    });
    onClose();
  };

  const handleApplyScript = (result: AiScriptResult) => {
    if (result.measure) setMeasure(result.measure);
    if (result.transform) setTransform(result.transform);
    if (result.measure || result.transform) setConfigMode('script');
    if (result.chartSpec) {
      setChartSpecJson(JSON.stringify(result.chartSpec, null, 2));
      setViz('custom-chart');
    }
  };

  const makeSelect = (
    value: string,
    onChange: (v: string) => void,
    fields: { key: string; label: string }[],
    placeholder: string,
    autoLabel = '— auto —',
  ) =>
    fields.length > 0 ? (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">{autoLabel}</option>
        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );

  const dimensionSelect = (value: string, onChange: (v: string) => void, placeholder: string, autoLabel?: string) =>
    makeSelect(value, onChange, availableDimensions, placeholder, autoLabel);
  const measureSelect = (value: string, onChange: (v: string) => void, placeholder: string, autoLabel?: string) =>
    makeSelect(value, onChange, availableMeasures, placeholder, autoLabel);
  const anyFieldSelect = (value: string, onChange: (v: string) => void, placeholder: string, autoLabel?: string) =>
    makeSelect(value, onChange, allFields, placeholder, autoLabel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-4 bg-black/40">
      <div className="bg-brand-900 border border-default rounded-xl shadow-2xl w-[28rem] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
          <h2 className="font-bold text-bright text-sm">Configure widget</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-bright transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Visualization</label>
            <select
              value={viz}
              onChange={(e) => setViz(e.target.value as VizType)}
              className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {compatibleViz.map((v) => (
                <option key={v} value={v}>{VIZ_LABELS[v]}</option>
              ))}
            </select>
          </div>

          {viz !== 'markdown' && viz !== 'custom-chart' && (
            <div className="flex rounded-lg border border-default p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setConfigMode('simple')}
                className={`flex-1 py-1.5 rounded-md transition-colors ${configMode === 'simple' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-bright'}`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => setConfigMode('script')}
                className={`flex-1 py-1.5 rounded-md transition-colors ${configMode === 'script' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-bright'}`}
              >
                DashScript
              </button>
            </div>
          )}

          {viz === 'markdown' ? (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Markdown content</label>
              <textarea
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                rows={8}
                className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-y"
              />
            </div>
          ) : viz === 'custom-chart' ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-muted-foreground">Chart.js spec (JSON)</label>
                  <button
                    type="button"
                    onClick={() => setShowAiModal(true)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 border border-blue-500/30 transition-colors"
                  >
                    <Sparkles className="h-2.5 w-2.5" /> Ask AI
                  </button>
                </div>
                <textarea
                  value={chartSpecJson}
                  onChange={(e) => { setChartSpecJson(e.target.value); setChartSpecError(null); }}
                  rows={12}
                  placeholder={'{\n  "type": "radar",\n  "labelField": "category",\n  "series": [{ "label": "Score", "field": "score" }]\n}'}
                  className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-y"
                />
                {chartSpecError && (
                  <p className="text-xs text-red-400 mt-1">{chartSpecError}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  Supported types: bar, line, pie, doughnut, radar, polarArea, bubble, scatter.
                  Use <code className="font-mono">labelField</code> + <code className="font-mono">series[]</code> to bind data from rows,
                  or provide a full Chart.js <code className="font-mono">data</code> object.
                </p>
              </div>
            </>
          ) : configMode === 'script' ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Measure <span className="font-normal">(KPI / gauge / stat-card)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAiModal(true)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 border border-blue-500/30 transition-colors"
                  >
                    <Sparkles className="h-2.5 w-2.5" /> Ask AI
                  </button>
                </div>
                <textarea
                  value={measure}
                  onChange={(e) => setMeasure(e.target.value)}
                  rows={3}
                  placeholder={'sum("count")\nfield("health_score")\nif(score >= 80, "Good", "Poor")'}
                  className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-y"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Transform <span className="font-normal">(charts / tables)</span>
                </label>
                <textarea
                  value={transform}
                  onChange={(e) => setTransform(e.target.value)}
                  rows={4}
                  placeholder={'filter(count > 0) | sort(score, desc) | take(10)'}
                  className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-y"
                />
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer text-blue-400 hover:text-blue-300">DashScript reference</summary>
                <pre className="mt-2 p-2 rounded bg-brand-950/80 overflow-x-auto whitespace-pre-wrap text-[10px] leading-relaxed">{DASHSCRIPT_HELP}</pre>
              </details>
              {isChart && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Label field (X / dimension)</label>
                    {dimensionSelect(xField, setXField, 'e.g. category')}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Value field (Y / measure)</label>
                    {measureSelect(yField, setYField, 'e.g. score')}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Series field (group by)</label>
                    {dimensionSelect(seriesField, setSeriesField, 'e.g. category', '— none (single series) —')}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {isMetric && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Value field</label>
                  {anyFieldSelect(valueField, setValueField, 'e.g. score')}
                </div>
              )}

              {viz === 'stat-card' && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Subtitle</label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              {isChart && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Label field (X / dimension)</label>
                    {dimensionSelect(xField, setXField, 'e.g. category')}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Value field (Y / measure)</label>
                    {measureSelect(yField, setYField, 'e.g. score')}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Series field (group by)</label>
                    {dimensionSelect(seriesField, setSeriesField, 'e.g. category', '— none (single series) —')}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Max items</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={chartMaxItems}
                      onChange={(e) => setChartMaxItems(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Sort by value</label>
                    <select
                      value={chartSort}
                      onChange={(e) => setChartSort(e.target.value as ChartSortOrder)}
                      className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="none">Original order</option>
                      <option value="desc">Highest first</option>
                      <option value="asc">Lowest first</option>
                    </select>
                  </div>
                  {(viz === 'line' || viz === 'area') && (
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} />
                      Show legend
                    </label>
                  )}
                </>
              )}

              {viz === 'kpi' && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Aggregation (from rows)</label>
                  <select
                    value={aggregate}
                    onChange={(e) => setAggregate(e.target.value as AggregateOp)}
                    className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {(Object.keys(AGG_LABELS) as AggregateOp[]).map((op) => (
                      <option key={op} value={op}>{AGG_LABELS[op]}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Number format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Default</option>
                  <option value="0">Integer</option>
                  <option value="0.0">1 decimal</option>
                  <option value="0.00">2 decimals</option>
                  <option value="score">Score (/100)</option>
                  <option value="0.0%">Percent (from fraction)</option>
                  <option value="pct">Percent (already 0–100)</option>
                </select>
              </div>

              {viz === 'table' && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Max rows</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={tableLimit}
                    onChange={(e) => setTableLimit(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-default shrink-0 flex gap-2">
          <button onClick={handleSave} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
            Apply
          </button>
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-default hover:bg-white/5 text-sm text-foreground transition-colors">
            Cancel
          </button>
        </div>
      </div>

      {showAiModal && (
        <AiAssistModal
          mode="script"
          toolName={widget.binding.toolName}
          propertyId={propertyId}
          reportId={reportId}
          currentBinding={widget.binding}
          currentOptions={widget.options ?? {}}
          onApplyScript={handleApplyScript}
          onClose={() => setShowAiModal(false)}
        />
      )}
    </div>
  );
}
