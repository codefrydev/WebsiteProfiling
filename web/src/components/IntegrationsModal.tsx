'use client';

import { Settings2, X } from 'lucide-react';
import type { IntegrationToast } from '@/types/api';
import GoogleIntegrationsPanel from './GoogleIntegrationsPanel';
import { useOptionalReport } from '@/context/useReport';

export interface IntegrationsModalProps {
  open: boolean;
  onClose: () => void;
  initialToast?: IntegrationToast | null;
}

/** Modal wrapper around {@link GoogleIntegrationsPanel} for report views. */
export default function IntegrationsModal({ open, onClose, initialToast }: IntegrationsModalProps) {
  const report = useOptionalReport();
  const startUrl = String(
    report?.data?.start_url || report?.data?.google?.gsc?.site_url || '',
  ).trim();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="presentation"
    >
      <div className="flex w-full max-w-lg max-h-[90vh] flex-col rounded-2xl border border-default bg-brand-800 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-muted px-6 py-4">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-link" />
            <h2 className="font-semibold text-foreground">Google Integrations</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-brand-700 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <GoogleIntegrationsPanel
            initialToast={initialToast}
            showTitle={false}
            startUrl={startUrl}
          />
        </div>
      </div>
    </div>
  );
}
