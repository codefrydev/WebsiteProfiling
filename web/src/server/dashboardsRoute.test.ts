import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const dbMock = {
  listDashboards: vi.fn(),
  createDashboard: vi.fn(),
  getDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  deleteDashboard: vi.fn(),
};

vi.mock('@/server/dashboardsDb', () => dbMock);

describe('GET /api/dashboards', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMock).forEach((fn) => fn.mockReset());
  });

  it('returns 403 for non-local host', async () => {
    const { GET } = await import('../../app/api/dashboards/route');
    const res = await GET(remoteRequest('/api/dashboards?propertyId=1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 without propertyId', async () => {
    const { GET } = await import('../../app/api/dashboards/route');
    const res = await GET(localRequest('/api/dashboards'));
    expect(res.status).toBe(400);
  });

  it('returns dashboards list', async () => {
    dbMock.listDashboards.mockResolvedValue([
      { id: 1, propertyId: 5, name: 'My dash', layoutJson: { version: 1, widgets: [] }, isDefault: false, createdAt: '', updatedAt: '' },
    ]);
    const { GET } = await import('../../app/api/dashboards/route');
    const res = await GET(localRequest('/api/dashboards?propertyId=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dashboards).toHaveLength(1);
    expect(body.dashboards[0].name).toBe('My dash');
  });
});

describe('POST /api/dashboards', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMock).forEach((fn) => fn.mockReset());
  });

  it('returns 403 for non-local host', async () => {
    const { POST } = await import('../../app/api/dashboards/route');
    const res = await POST(remoteRequest('/api/dashboards', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 without propertyId', async () => {
    const { POST } = await import('../../app/api/dashboards/route');
    const res = await POST(localRequest('/api/dashboards', { method: 'POST', body: JSON.stringify({ name: 'x' }) }));
    expect(res.status).toBe(400);
  });

  it('creates and returns a dashboard', async () => {
    const created = { id: 2, propertyId: 5, name: 'New', layoutJson: { version: 1, widgets: [] }, isDefault: false, createdAt: '', updatedAt: '' };
    dbMock.createDashboard.mockResolvedValue(created);
    const { POST } = await import('../../app/api/dashboards/route');
    const res = await POST(
      localRequest('/api/dashboards', {
        method: 'POST',
        body: JSON.stringify({ propertyId: 5, name: 'New' }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.dashboard.id).toBe(2);
  });
});

describe('GET /api/dashboards/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMock).forEach((fn) => fn.mockReset());
  });

  it('returns 403 for non-local host', async () => {
    const { GET } = await import('../../app/api/dashboards/[id]/route');
    const res = await GET(remoteRequest('/api/dashboards/1?propertyId=5'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });

  it('returns 404 when not found', async () => {
    dbMock.getDashboard.mockResolvedValue(null);
    const { GET } = await import('../../app/api/dashboards/[id]/route');
    const res = await GET(
      localRequest('/api/dashboards/99?propertyId=5'),
      { params: Promise.resolve({ id: '99' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns the dashboard', async () => {
    const row = { id: 3, propertyId: 5, name: 'Dash', layoutJson: { version: 1, widgets: [] }, isDefault: false, createdAt: '', updatedAt: '' };
    dbMock.getDashboard.mockResolvedValue(row);
    const { GET } = await import('../../app/api/dashboards/[id]/route');
    const res = await GET(
      localRequest('/api/dashboards/3?propertyId=5'),
      { params: Promise.resolve({ id: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dashboard.id).toBe(3);
  });
});

describe('PUT /api/dashboards/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMock).forEach((fn) => fn.mockReset());
  });

  it('returns 404 when not found', async () => {
    dbMock.updateDashboard.mockResolvedValue(null);
    const { PUT } = await import('../../app/api/dashboards/[id]/route');
    const res = await PUT(
      localRequest('/api/dashboards/99', { method: 'PUT', body: JSON.stringify({ propertyId: 5, name: 'x' }) }),
      { params: Promise.resolve({ id: '99' }) },
    );
    expect(res.status).toBe(404);
  });

  it('updates and returns dashboard', async () => {
    const row = { id: 3, propertyId: 5, name: 'Updated', layoutJson: { version: 1, widgets: [] }, isDefault: false, createdAt: '', updatedAt: '' };
    dbMock.updateDashboard.mockResolvedValue(row);
    const { PUT } = await import('../../app/api/dashboards/[id]/route');
    const res = await PUT(
      localRequest('/api/dashboards/3', { method: 'PUT', body: JSON.stringify({ propertyId: 5, name: 'Updated' }) }),
      { params: Promise.resolve({ id: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dashboard.name).toBe('Updated');
  });
});

describe('DELETE /api/dashboards/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMock).forEach((fn) => fn.mockReset());
  });

  it('returns 404 when not found', async () => {
    dbMock.deleteDashboard.mockResolvedValue(false);
    const { DELETE } = await import('../../app/api/dashboards/[id]/route');
    const res = await DELETE(
      localRequest('/api/dashboards/99?propertyId=5'),
      { params: Promise.resolve({ id: '99' }) },
    );
    expect(res.status).toBe(404);
  });

  it('deletes successfully', async () => {
    dbMock.deleteDashboard.mockResolvedValue(true);
    const { DELETE } = await import('../../app/api/dashboards/[id]/route');
    const res = await DELETE(
      localRequest('/api/dashboards/3?propertyId=5'),
      { params: Promise.resolve({ id: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
