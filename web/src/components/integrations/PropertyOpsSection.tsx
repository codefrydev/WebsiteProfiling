'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CalendarClock, Loader2 } from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { strings, format } from '@/lib/strings';
import { Button } from '@/components';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';

export interface PropertyOpsSectionProps {
  propertyId: number | null;
}

export default function PropertyOpsSection({ propertyId }: PropertyOpsSectionProps) {
  const s = strings.pipelineRunner.propertyOps;
  const { readOnly } = useReadOnlySession();
  const [scheduleCron, setScheduleCron] = useState('');
  const [alertWebhookUrl, setAlertWebhookUrl] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [gscLinksStale, setGscLinksStale] = useState<string | null>(null);

  useEffect(() => {
    if (propertyId == null) return undefined;
    let cancelled = false;
    setLoading(true);
    void apiFetch(apiUrl(`/properties/${propertyId}/ops`))
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setMessage(s.loadFailed);
          return;
        }
        const data = await res.json();
        setScheduleCron(String(data.schedule_cron || ''));
        setAlertWebhookUrl(String(data.alert_webhook_url || ''));
        setAlertEmail(String(data.alert_email || ''));
      })
      .catch(() => {
        if (!cancelled) setMessage(s.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  useEffect(() => {
    if (propertyId == null) return undefined;
    let cancelled = false;
    void apiFetch(apiUrl(`/properties/${propertyId}/google/links/status`))
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return;
        const status = await res.json();
        if (!status) return;
        if (!status.hasData) {
          setGscLinksStale(s.gscLinksMissing);
          return;
        }
        const last = status.lastImportedAt ? new Date(String(status.lastImportedAt)) : null;
        if (!last || Number.isNaN(last.getTime())) return;
        const ageDays = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays >= 7) {
          setGscLinksStale(format(s.gscLinksStale, { days: ageDays }));
        } else {
          setGscLinksStale(null);
        }
      })
      .catch(() => {
        if (!cancelled) setGscLinksStale(s.loadFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, s.gscLinksMissing, s.gscLinksStale, s.loadFailed]);

  const handleSave = useCallback(async () => {
    if (propertyId == null || readOnly) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch(apiUrl(`/properties/${propertyId}/ops`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleCron: scheduleCron.trim() || null,
          alertWebhookUrl: alertWebhookUrl.trim() || null,
          alertEmail: alertEmail.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(s.saveFailed);
      setMessage(s.saved);
    } catch {
      setMessage(s.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [propertyId, readOnly, scheduleCron, alertWebhookUrl, alertEmail, s.saved, s.saveFailed]);

  if (propertyId == null) return null;

  return (
    <div className="rounded-xl border border-default bg-brand-800/40 p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent shrink-0" aria-hidden />
          {s.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.hint}</p>
        {gscLinksStale ? (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">{gscLinksStale}</p>
        ) : null}
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {s.loading}
        </p>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">{s.scheduleCronLabel}</span>
            <input
              id="scheduleCron"
              type="text"
              value={scheduleCron}
              onChange={(e) => setScheduleCron(e.target.value)}
              placeholder={s.scheduleCronPlaceholder}
              disabled={saving || readOnly}
              className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
            />
            <span className="text-[10px] text-muted-foreground">{s.scheduleCronHelp}</span>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">{s.alertWebhookLabel}</span>
            <input
              id="alertWebhookUrl"
              type="url"
              value={alertWebhookUrl}
              onChange={(e) => setAlertWebhookUrl(e.target.value)}
              placeholder="https://hooks.example.com/..."
              disabled={saving || readOnly}
              className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
            />
            <span className="text-[10px] text-muted-foreground">{s.alertWebhookHelp}</span>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">{s.alertEmailLabel}</span>
            <input
              id="alertEmail"
              type="email"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
              placeholder="team@example.com"
              disabled={saving || readOnly}
              className="w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground"
            />
            <span className="text-[10px] text-muted-foreground">{s.alertEmailHelp}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void handleSave()} disabled={saving || readOnly}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
              {saving ? s.saving : s.saveLabel}
            </Button>
            {message ? (
              <span className={`text-xs ${message === s.saved ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                {message}
              </span>
            ) : null}
          </div>
          <p className="text-[10px] text-muted-foreground">{s.cronEndpointsHint}</p>
        </>
      )}
    </div>
  );
}
