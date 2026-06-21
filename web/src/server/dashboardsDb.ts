import { withDb } from '@/server/db';
import type { DashboardDoc } from '@/types/dashboard';

export interface DashboardRow {
  id: number;
  propertyId: number;
  name: string;
  layoutJson: DashboardDoc;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  id: number;
  property_id: number;
  name: string;
  layout_json: DashboardDoc;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

function toRow(r: DbRow): DashboardRow {
  return {
    id: r.id,
    propertyId: r.property_id,
    name: r.name,
    layoutJson: r.layout_json ?? { version: 2, widgets: [], slicers: [] },
    isDefault: r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listDashboards(propertyId: number): Promise<DashboardRow[]> {
  return withDb(async (client) => {
    const res = await client.query<DbRow>(
      `SELECT id, property_id, name, layout_json, is_default, created_at, updated_at
       FROM dashboards WHERE property_id = $1 ORDER BY updated_at DESC`,
      [propertyId],
    );
    return res.rows.map(toRow);
  });
}

export async function getDashboard(id: number, propertyId: number): Promise<DashboardRow | null> {
  return withDb(async (client) => {
    const res = await client.query<DbRow>(
      `SELECT id, property_id, name, layout_json, is_default, created_at, updated_at
       FROM dashboards WHERE id = $1 AND property_id = $2`,
      [id, propertyId],
    );
    const row = res.rows[0];
    return row ? toRow(row) : null;
  });
}

export async function createDashboard(
  propertyId: number,
  name: string,
  layoutJson: DashboardDoc,
): Promise<DashboardRow> {
  return withDb(async (client) => {
    const res = await client.query<DbRow>(
      `INSERT INTO dashboards (property_id, name, layout_json)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, property_id, name, layout_json, is_default, created_at, updated_at`,
      [propertyId, name, JSON.stringify(layoutJson)],
    );
    return toRow(res.rows[0]);
  });
}

export async function updateDashboard(
  id: number,
  propertyId: number,
  patch: { name?: string; layoutJson?: DashboardDoc; isDefault?: boolean },
): Promise<DashboardRow | null> {
  return withDb(async (client) => {
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [];
    let idx = 1;

    if (patch.name !== undefined) {
      sets.push(`name = $${idx++}`);
      vals.push(patch.name);
    }
    if (patch.layoutJson !== undefined) {
      sets.push(`layout_json = $${idx++}::jsonb`);
      vals.push(JSON.stringify(patch.layoutJson));
    }
    if (patch.isDefault !== undefined) {
      if (patch.isDefault) {
        await client.query(
          `UPDATE dashboards SET is_default = false WHERE property_id = $1`,
          [propertyId],
        );
      }
      sets.push(`is_default = $${idx++}`);
      vals.push(patch.isDefault);
    }

    vals.push(id, propertyId);
    const res = await client.query<DbRow>(
      `UPDATE dashboards SET ${sets.join(', ')}
       WHERE id = $${idx++} AND property_id = $${idx++}
       RETURNING id, property_id, name, layout_json, is_default, created_at, updated_at`,
      vals,
    );
    const row = res.rows[0];
    return row ? toRow(row) : null;
  });
}

export async function deleteDashboard(id: number, propertyId: number): Promise<boolean> {
  return withDb(async (client) => {
    const res = await client.query(
      `DELETE FROM dashboards WHERE id = $1 AND property_id = $2`,
      [id, propertyId],
    );
    return (res.rowCount ?? 0) > 0;
  });
}
