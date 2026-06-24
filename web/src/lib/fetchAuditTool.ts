import { apiUrl, apiFetch } from '@/lib/publicBase';

export interface FetchAuditToolParams {
  toolName: string;
  propertyId: number;
  reportId?: number | null;
  args?: Record<string, unknown>;
}

export async function fetchAuditTool(params: FetchAuditToolParams): Promise<Record<string, unknown>> {
  const res = await apiFetch(apiUrl('/report/audit-tool'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.error || 'Audit tool request failed'));
  }
  return data;
}
