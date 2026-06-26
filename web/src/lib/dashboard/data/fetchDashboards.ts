import { apiUrl, apiFetch } from '@/lib/publicBase';
import type { DashboardDoc } from '@/lib/dashboard/engine/doc';

export interface DashboardRowClient {
  id: number;
  propertyId: number;
  name: string;
  layoutJson: DashboardDoc;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(String(body.error || 'Request failed'));
  return body;
}

export async function listDashboards(propertyId: number): Promise<DashboardRowClient[]> {
  const data = await request<{ dashboards?: DashboardRowClient[] }>(
    `/dashboards?propertyId=${propertyId}`,
  );
  return Array.isArray(data.dashboards) ? data.dashboards : [];
}

export async function createDashboard(
  propertyId: number,
  name: string,
  layoutJson?: DashboardDoc,
): Promise<DashboardRowClient> {
  const data = await request<{ dashboard: DashboardRowClient }>('/dashboards', {
    method: 'POST',
    body: JSON.stringify({ propertyId, name, layoutJson }),
  });
  return data.dashboard;
}

export async function updateDashboard(
  id: number,
  propertyId: number,
  patch: { name?: string; layoutJson?: DashboardDoc; isDefault?: boolean },
): Promise<DashboardRowClient> {
  const data = await request<{ dashboard: DashboardRowClient }>(`/dashboards/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ propertyId, ...patch }),
  });
  return data.dashboard;
}

export async function deleteDashboard(id: number, propertyId: number): Promise<void> {
  await request(`/dashboards/${id}?propertyId=${propertyId}`, { method: 'DELETE' });
}
