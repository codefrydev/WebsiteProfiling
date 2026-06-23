/**
 * Client-side helpers for the Dashboard AI generation API.
 * Calls POST /api/dashboards/ai-generate and validates / sanitizes the response.
 */
import { tokenize } from '@/lib/dashboard/script/lexer';
import { apiFetch } from '@/lib/publicBase';
import { Parser } from '@/lib/dashboard/script/parser';
import { newWidgetId, defaultWidgetLayout } from '@/lib/dashboard/types';
import type {
  Widget,
  WidgetBinding,
  WidgetOptions,
  DashboardDoc,
  VizType,
  CustomChartSpec,
} from '@/lib/dashboard/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AiScriptResult {
  measure?: string;
  transform?: string;
  chartSpec?: CustomChartSpec | null;
  explanation: string;
}

export interface AiWidgetResult {
  widget: Omit<Widget, 'id' | 'layout'> & { layout?: Widget['layout']; title: string; viz: VizType };
  explanation: string;
}

export interface AiDashboardResult {
  name: string;
  widgets: (Omit<Widget, 'id' | 'layout'> & { layout?: Widget['layout'] })[];
  explanation: string;
}

export interface AiGenerateOptions {
  mode: 'script' | 'widget' | 'dashboard';
  prompt: string;
  toolName?: string;
  propertyId?: number;
  reportId?: number | null;
  /** Current widget binding / options to pass as context for script mode. */
  current?: { binding?: WidgetBinding; options?: WidgetOptions };
}

export class AiGenerateError extends Error {
  constructor(
    message: string,
    public readonly missing?: boolean,
  ) {
    super(message);
    this.name = 'AiGenerateError';
  }
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * JSON-round-trip the spec to strip functions / undefined; validate required
 * fields and enforce size caps.
 */
export function sanitizeChartSpec(raw: unknown): CustomChartSpec {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('chartSpec must be an object');
  }
  // Round-trip through JSON to drop functions/undefined
  const spec = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  if (!spec.type || typeof spec.type !== 'string') {
    throw new Error('chartSpec.type must be a non-empty string');
  }

  // Cap explicit dataset point counts
  if (spec.data && typeof spec.data === 'object') {
    const d = spec.data as { datasets?: { data?: unknown[] }[]; labels?: unknown[] };
    if (Array.isArray(d.labels) && d.labels.length > 500) {
      d.labels = d.labels.slice(0, 500);
    }
    if (Array.isArray(d.datasets)) {
      d.datasets = d.datasets.slice(0, 20).map((ds) => ({
        ...ds,
        data: Array.isArray(ds.data) ? ds.data.slice(0, 500) : ds.data,
      }));
    }
  }

  // Cap series
  if (Array.isArray(spec.series)) {
    spec.series = (spec.series as unknown[]).slice(0, 20);
  }

  return spec as unknown as CustomChartSpec;
}

// ---------------------------------------------------------------------------
// DashScript validation
// ---------------------------------------------------------------------------

/** Attempt to parse a measure expression; returns an error message or null on success. */
export function validateMeasure(source: string): string | null {
  if (!source.trim()) return null;
  try {
    const tokens = tokenize(source.trim());
    new Parser(tokens).parseExpr();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Attempt to parse a transform pipeline; returns an error message or null on success. */
export function validateTransform(source: string): string | null {
  if (!source.trim()) return null;
  try {
    const tokens = tokenize(source.trim());
    new Parser(tokens).parsePipeline();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// ---------------------------------------------------------------------------
// Layout assignment
// ---------------------------------------------------------------------------

/** Assign concrete bottom-row y positions to a list of widget layout hints. */
export function assignLayouts(
  widgets: (Omit<Widget, 'id' | 'layout'> & { layout?: Widget['layout'] })[],
  bottomY = 0,
): Widget[] {
  let currentY = bottomY;
  let rowMaxH = 0;
  let rowX = 0;

  return widgets.map((w) => {
    const viz = w.viz as VizType;
    const hint = w.layout ?? defaultWidgetLayout(viz);
    const layout = { ...hint };

    // Replace Infinity y with computed bottom
    if (!Number.isFinite(layout.y)) {
      layout.y = currentY;
    }

    // Ensure the widget fits in the row; wrap if needed
    if (rowX + layout.w > 12) {
      currentY += rowMaxH;
      rowMaxH = 0;
      rowX = 0;
      layout.x = 0;
      layout.y = currentY;
    } else {
      layout.x = rowX;
    }

    rowX += layout.w;
    rowMaxH = Math.max(rowMaxH, layout.h);

    const id = newWidgetId();
    return { ...w, id, layout } as Widget;
  });
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function callAiGenerate(opts: AiGenerateOptions): Promise<Record<string, unknown>> {
  const res = await apiFetch('/api/dashboards/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: opts.mode,
      prompt: opts.prompt,
      toolName: opts.toolName,
      propertyId: opts.propertyId,
      reportId: opts.reportId,
      current: opts.current,
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    const msg = String(data.error || 'AI generation failed');
    const missing = Boolean(data.missing);
    throw new AiGenerateError(msg, missing);
  }
  return data;
}

/**
 * Generate or improve a DashScript formula (+ optional chartSpec) for the widget being configured.
 */
export async function generateWidgetScript(
  prompt: string,
  opts: Pick<AiGenerateOptions, 'toolName' | 'propertyId' | 'reportId' | 'current'> = {},
): Promise<AiScriptResult> {
  const data = await callAiGenerate({ mode: 'script', prompt, ...opts });
  const measure = typeof data.measure === 'string' ? data.measure : '';
  const transform = typeof data.transform === 'string' ? data.transform : '';
  const explanation = typeof data.explanation === 'string' ? data.explanation : '';

  // Validate DashScript
  const measureErr = validateMeasure(measure);
  if (measureErr) throw new AiGenerateError(`Invalid measure: ${measureErr}`);
  const transformErr = validateTransform(transform);
  if (transformErr) throw new AiGenerateError(`Invalid transform: ${transformErr}`);

  let chartSpec: CustomChartSpec | null = null;
  if (data.chartSpec) {
    chartSpec = sanitizeChartSpec(data.chartSpec);
  }

  return { measure, transform, chartSpec, explanation };
}

/**
 * Generate a full single widget definition from a natural-language prompt.
 */
export async function generateWidget(
  prompt: string,
  opts: Pick<AiGenerateOptions, 'toolName' | 'propertyId' | 'reportId' | 'current'> = {},
  bottomY = 0,
): Promise<{ widget: Widget; explanation: string }> {
  const data = await callAiGenerate({ mode: 'widget', prompt, ...opts });

  const raw = data.widget as Omit<Widget, 'id' | 'layout'> & { layout?: Widget['layout']; title: string; viz: VizType };
  if (!raw || typeof raw !== 'object') {
    throw new AiGenerateError('AI returned no widget definition');
  }

  // Sanitize chartSpec if present in options
  if (raw.options?.chartSpec) {
    raw.options = {
      ...raw.options,
      chartSpec: sanitizeChartSpec(raw.options.chartSpec),
    };
  }

  const [widget] = assignLayouts([raw], bottomY);
  widget.options = { ...(widget.options ?? {}), aiPrompt: prompt };

  return { widget, explanation: String(data.explanation ?? '') };
}

/**
 * Generate a full dashboard (name + widgets) from a natural-language prompt.
 */
export async function generateDashboard(
  prompt: string,
  opts: Pick<AiGenerateOptions, 'propertyId' | 'reportId'> = {},
): Promise<{ name: string; doc: DashboardDoc; explanation: string }> {
  const data = await callAiGenerate({ mode: 'dashboard', prompt, ...opts });

  const name = String(data.name || 'AI Dashboard');
  const rawWidgets = (
    Array.isArray(data.widgets) ? data.widgets : []
  ) as (Omit<Widget, 'id' | 'layout'> & { layout?: Widget['layout'] })[];

  // Sanitize any chartSpecs
  const sanitized = rawWidgets.map((w) => {
    if (w.options?.chartSpec) {
      return {
        ...w,
        options: { ...w.options, chartSpec: sanitizeChartSpec(w.options.chartSpec) },
      };
    }
    return w;
  });

  const widgets = assignLayouts(sanitized, 0);
  const doc: DashboardDoc = { version: 1, widgets };

  return { name, doc, explanation: String(data.explanation ?? '') };
}
