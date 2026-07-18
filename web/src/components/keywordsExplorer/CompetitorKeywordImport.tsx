
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button, Card } from '@/components';
import { apiUrl, apiFetch, readApiErrorMessage } from '@/lib/publicBase';

interface CompetitorKeywordImportProps {
  propertyId: number;
  onImported?: (count: number) => void;
}

export default function CompetitorKeywordImport({ propertyId, onImported }: CompetitorKeywordImportProps) {
  const [competitor, setCompetitor] = useState('');
  const [csvText, setCsvText] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const handleImport = async () => {
    if (!propertyId || !competitor.trim() || !csvText.trim()) return;
    setBusy(true);
    setStatus('');
    try {
      const res = await apiFetch(apiUrl('/keywords/competitor-import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, competitor: competitor.trim(), csvText }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(body as Record<string, unknown>, res, 'Import failed'));
      setStatus(`Imported ${body.count ?? 0} keywords`);
      onImported?.(body.count ?? 0);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Upload className="h-4 w-4" />
        Competitor keyword CSV (Ahrefs / Semrush export)
      </div>
      <input
        type="text"
        placeholder="Competitor domain"
        value={competitor}
        onChange={(e) => setCompetitor(e.target.value)}
        className="w-full rounded-lg border border-default bg-background px-3 py-2 text-sm"
      />
      <textarea
        placeholder="Paste CSV export…"
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        rows={6}
        className="w-full rounded-lg border border-default bg-background px-3 py-2 text-sm font-mono"
      />
      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void handleImport()} disabled={busy}>
          Import
        </Button>
        {status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
      </div>
    </Card>
  );
}
