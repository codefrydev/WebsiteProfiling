import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import {
  getGoogleAppPublicStatus,
  saveGoogleAppSettings,
} from '@/server/googleAppSettings';
import type { ApiRouteHandler, GoogleCredentialsUploadBody, GoogleServiceAccount } from '@/types/api';

export const runtime = 'nodejs';

function isServiceAccount(value: unknown): value is GoogleServiceAccount {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as GoogleServiceAccount).type === 'service_account' &&
    typeof (value as GoogleServiceAccount).client_email === 'string' &&
    typeof (value as GoogleServiceAccount).private_key === 'string'
  );
}

export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => ({}))) as GoogleCredentialsUploadBody;
    const raw = body.fileContent;
    if (!raw || typeof raw !== 'string') {
      return NextResponse.json({ error: 'fileContent is required' }, { status: 400 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "This doesn't look like a valid JSON file." },
        { status: 400 },
      );
    }

    if (!isServiceAccount(parsed)) {
      return NextResponse.json(
        {
          error:
            "This doesn't look like a Google service account key file. Make sure you downloaded the JSON key from Google Cloud Console > IAM & Admin > Service Accounts.",
        },
        { status: 400 },
      );
    }

    await saveGoogleAppSettings({ serviceAccount: parsed });
    const status = await getGoogleAppPublicStatus();
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
