import { NextResponse, type NextRequest } from 'next/server';
import {
  authEnabled,
  canMutateRole,
  sessionRoleFromRequest,
} from '@/server/auth';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/auth/session — current role and mutation permissions for UI guards. */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const enabled = authEnabled();
  const role = sessionRoleFromRequest(request);
  return NextResponse.json({
    authEnabled: enabled,
    authenticated: !enabled || Boolean(role),
    role: role ?? (enabled ? null : 'analyst'),
    canMutate: canMutateRole(role ?? (enabled ? null : 'analyst')),
    readonly: enabled && Boolean(role) && !canMutateRole(role),
  });
};
