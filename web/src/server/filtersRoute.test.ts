import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest } from '@/server/testHelpers/routeTestUtils';

const listMock = vi.fn();
const upsertMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/server/savedFiltersDb', () => ({
  listSavedFilters: (...args: unknown[]) => listMock(...args),
  upsertSavedFilter: (...args: unknown[]) => upsertMock(...args),
  deleteSavedFilter: (...args: unknown[]) => deleteMock(...args),
}));

describe('filters route', () => {
  beforeEach(() => {
    listMock.mockReset();
    upsertMock.mockReset();
    deleteMock.mockReset();
    vi.resetModules();
  });

  it('GET returns 400 without propertyId', async () => {
    const { GET } = await import('../../app/api/filters/route');
    const res = await GET(localRequest('/api/filters'));
    expect(res.status).toBe(400);
  });

  it('GET lists saved filters', async () => {
    listMock.mockResolvedValue([{ name: 'Broken', filterJson: { status: '404' } }]);
    const { GET } = await import('../../app/api/filters/route');
    const res = await GET(localRequest('/api/filters?propertyId=7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filters).toHaveLength(1);
    expect(listMock).toHaveBeenCalledWith(7);
  });

  it('POST upserts a filter', async () => {
    upsertMock.mockResolvedValue(undefined);
    const { POST } = await import('../../app/api/filters/route');
    const res = await POST(
      localRequest('/api/filters', {
        method: 'POST',
        body: JSON.stringify({ propertyId: 3, name: 'Deep pages', filterJson: { minDepth: '3' } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(3, 'Deep pages', { minDepth: '3' });
  });
});
