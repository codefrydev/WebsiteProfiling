'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import { Button } from '@/components';
import { apiUrl, apiFetch } from '@/lib/publicBase';

interface SavedCrawlFiltersBarProps {
  propertyId: number;
  /** Opaque view object persisted as the saved filter's JSON payload. */
  view: unknown;
  /** Called with the raw persisted JSON so the caller can normalize/apply it. */
  onLoad: (raw: unknown) => void;
}

export default function SavedCrawlFiltersBar({ propertyId, view, onLoad }: SavedCrawlFiltersBarProps) {
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    if (!propertyId) {
      setNames([]);
      return;
    }
    try {
      const res = await apiFetch(apiUrl(`/filters?propertyId=${propertyId}`));
      const body = await res.json();
      setNames((body.filters || []).map((f: { name: string }) => f.name));
    } catch {
      setNames([]);
    }
  }, [propertyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    const name = window.prompt('Filter name');
    if (!name?.trim() || !propertyId) return;
    setStatus('');
    try {
      const res = await apiFetch(apiUrl('/filters'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, name: name.trim(), filterJson: view }),
      });
      if (!res.ok) throw new Error('Save failed');
      setStatus(`Saved "${name.trim()}"`);
      await refresh();
    } catch {
      setStatus('Could not save filter');
    }
  };

  const load = async () => {
    if (!selected || !propertyId) return;
    try {
      const res = await apiFetch(apiUrl(`/filters?propertyId=${propertyId}`));
      const body = await res.json();
      const row = (body.filters || []).find((f: { name: string }) => f.name === selected);
      if (row?.filterJson) onLoad(row.filterJson);
    } catch {
      setStatus('Could not load filter');
    }
  };

  if (!propertyId) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Button type="button" variant="secondary" className="!py-1 !px-2 !text-xs" onClick={() => void save()}>
        <BookmarkPlus className="h-3.5 w-3.5" />
        Save filter
      </Button>
      {names.length ? (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-default bg-background px-2 py-1 text-xs"
          >
            <option value="">Load saved…</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <Button type="button" variant="secondary" className="!py-1 !px-2 !text-xs" onClick={() => void load()} disabled={!selected}>
            Load
          </Button>
        </>
      ) : null}
      {status ? <span className="text-muted-foreground">{status}</span> : null}
    </div>
  );
}
