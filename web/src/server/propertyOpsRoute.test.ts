import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const getPropertyByIdMock = vi.fn();
const setPropertyOpsSettingsMock = vi.fn();

vi.mock('@/server/propertiesDb', () => ({
  getPropertyById: (...args: unknown[]) => getPropertyByIdMock(...args),
  setPropertyOpsSettings: (...args: unknown[]) => setPropertyOpsSettingsMock(...args),
}));

describe('properties/[id]/ops route', () => {
  beforeEach(() => {
    getPropertyByIdMock.mockReset();
    setPropertyOpsSettingsMock.mockReset();
    vi.resetModules();
    getPropertyByIdMock.mockResolvedValue({
      id: 1,
      schedule_cron: '0 9 * * 1',
      alert_webhook_url: 'https://hooks.example/alerts',
      alert_email: 'ops@example.com',
    });
    setPropertyOpsSettingsMock.mockResolvedValue(undefined);
  });

  it('GET returns ops settings', async () => {
    const { GET } = await import('../../app/api/properties/[id]/ops/route');
    const res = await GET(localRequest('/api/properties/1/ops'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedule_cron).toBe('0 9 * * 1');
  });

  it('GET returns 404 when property missing', async () => {
    getPropertyByIdMock.mockResolvedValue(null);
    const { GET } = await import('../../app/api/properties/[id]/ops/route');
    const res = await GET(localRequest('/api/properties/99/ops'), { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
  });

  it('PUT returns 403 for non-local host', async () => {
    const { PUT } = await import('../../app/api/properties/[id]/ops/route');
    const res = await PUT(
      remoteRequest('/api/properties/1/ops', {
        method: 'PUT',
        body: JSON.stringify({ scheduleCron: '0 10 * * *' }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('PUT updates ops settings', async () => {
    const { PUT } = await import('../../app/api/properties/[id]/ops/route');
    const res = await PUT(
      localRequest('/api/properties/1/ops', {
        method: 'PUT',
        body: JSON.stringify({ scheduleCron: '30 14 * * *', alertEmail: 'new@example.com' }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(setPropertyOpsSettingsMock).toHaveBeenCalledWith(1, expect.objectContaining({ scheduleCron: '30 14 * * *' }));
  });
});
