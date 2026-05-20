import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { writeSecrets, getPublicStatus } from '@/server/googleSecrets';

export const runtime = 'nodejs';

/**
 * POST /api/integrations/google/credentials/upload
 * Accepts a JSON body with { fileContent: "<stringified service account JSON>" }
 * Validates the service account key structure and saves it.
 */
export async function POST(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const raw = body.fileContent;
    if (!raw || typeof raw !== 'string') {
      return NextResponse.json({ error: 'fileContent is required' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "This doesn't look like a valid JSON file." },
        { status: 400 }
      );
    }

    if (parsed.type !== 'service_account' || !parsed.client_email || !parsed.private_key) {
      return NextResponse.json(
        {
          error:
            "This doesn't look like a Google service account key file. Make sure you downloaded the JSON key from Google Cloud Console > IAM & Admin > Service Accounts.",
        },
        { status: 400 }
      );
    }

    writeSecrets({ authMode: 'service_account', serviceAccount: parsed });
    return NextResponse.json({ ok: true, status: getPublicStatus() });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
