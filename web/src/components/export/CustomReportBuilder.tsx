'use client';

import { useCallback, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/Button';
import { apiUrl } from '@/lib/publicBase';
import {
  CUSTOM_REPORT_TOOLS,
  CUSTOM_SECTION_TYPES,
  sectionsToPayload,
  type CustomReportSection,
} from '@/lib/customReportTools';
import { strings } from '@/lib/strings';

function newSection(): CustomReportSection {
  return {
    id: crypto.randomUUID(),
    type: 'executive_summary',
  };
}

export interface CustomReportBuilderProps {
  propertyId: number | null;
  reportId: number | null;
}

export default function CustomReportBuilder({ propertyId, reportId }: CustomReportBuilderProps) {
  const ve = strings.views.exportReport;
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<CustomReportSection[]>([newSection()]);
  const [specId, setSpecId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compose = useCallback(async () => {
    if (!propertyId || !title.trim()) return null;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/report/custom/compose'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          sections: sectionsToPayload(sections),
          propertyId,
          reportId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error || ve.customSaveFailed));
      const id = String(data.report_spec_id || '');
      setSpecId(id || null);
      return id;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, [propertyId, reportId, sections, title, ve.customSaveFailed]);

  const exportUrl = (format: 'html' | 'pdf', inline = false) => {
    if (!specId || !propertyId) return '#';
    const p = new URLSearchParams({
      specId,
      format,
      propertyId: String(propertyId),
    });
    if (reportId != null) p.set('reportId', String(reportId));
    if (inline) p.set('disposition', 'inline');
    return apiUrl(`/report/custom/export?${p.toString()}`);
  };

  const handlePreview = async () => {
    const id = specId || (await compose());
    if (!id) return;
    window.open(exportUrl('html', true), '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async (format: 'html' | 'pdf') => {
    const id = specId || (await compose());
    if (!id) return;
    window.location.href = exportUrl(format, false);
  };

  const updateSection = (id: string, patch: Partial<CustomReportSection>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSpecId(null);
  };

  const addSection = () => {
    if (sections.length >= 12) return;
    setSections((prev) => [...prev, newSection()]);
    setSpecId(null);
  };

  const removeSection = (id: string) => {
    setSections((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
    setSpecId(null);
  };

  if (!propertyId) {
    return (
      <p className="text-sm text-muted-foreground py-6">{strings.views.issues.taskBoardNoProperty}</p>
    );
  }

  return (
    <div className="space-y-4 border-t border-default pt-6 mt-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">{ve.customTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{ve.customHint}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">{ve.customReportTitleLabel}</span>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSpecId(null);
          }}
          placeholder={ve.customReportTitlePlaceholder}
          className="w-full max-w-xl rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
        />
      </label>

      <div className="space-y-3">
        {sections.map((section, index) => (
          <div key={section.id} className="rounded-xl border border-default bg-brand-800/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {ve.customSectionType} {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeSection(section.id)}
                disabled={sections.length <= 1}
                className="p-1 text-muted-foreground hover:text-red-400 disabled:opacity-40"
                aria-label="Remove section"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <select
              value={section.type}
              onChange={(e) =>
                updateSection(section.id, {
                  type: e.target.value as CustomReportSection['type'],
                })
              }
              className="w-full max-w-md rounded-lg border border-default bg-brand-900 px-2 py-1.5 text-sm"
            >
              {CUSTOM_SECTION_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {section.type === 'tool' ? (
              <select
                value={section.tool_name || CUSTOM_REPORT_TOOLS[0].value}
                onChange={(e) => updateSection(section.id, { tool_name: e.target.value })}
                className="w-full max-w-md rounded-lg border border-default bg-brand-900 px-2 py-1.5 text-sm"
              >
                {CUSTOM_REPORT_TOOLS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            ) : null}
            {section.type === 'notes' ? (
              <textarea
                value={section.markdown || ''}
                onChange={(e) => updateSection(section.id, { markdown: e.target.value })}
                rows={4}
                placeholder={ve.customNotesPlaceholder}
                className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={addSection} disabled={sections.length >= 12}>
          <Plus className="h-4 w-4" />
          {ve.customAddSection}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void handlePreview()} disabled={busy || !title.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {ve.customPreview}
        </Button>
        <Button type="button" onClick={() => void handleDownload('html')} disabled={busy || !title.trim()}>
          {ve.customDownloadHtml}
        </Button>
        <Button type="button" onClick={() => void handleDownload('pdf')} disabled={busy || !title.trim()}>
          {ve.customDownloadPdf}
        </Button>
      </div>
      {sections.length >= 12 ? (
        <p className="text-xs text-muted-foreground">{ve.customMaxSections}</p>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
