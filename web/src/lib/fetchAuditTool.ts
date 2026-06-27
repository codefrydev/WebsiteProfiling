import { apiUrl, apiFetch, readApiErrorMessage } from '@/lib/publicBase';

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
    throw new Error(readApiErrorMessage(data, res, 'Audit tool request failed'));
  }
  const result = data.result;
  if (result != null && typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return data;
}
