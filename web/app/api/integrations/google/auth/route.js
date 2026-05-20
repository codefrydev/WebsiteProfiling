import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { readSecrets } from '@/server/googleSecrets';

export const runtime = 'nodejs';

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
].join(' ');

/**
 * GET /api/integrations/google/auth
 * Generates a CSRF state token, sets an httpOnly cookie, redirects to Google OAuth.
 */
export async function GET(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const secrets = readSecrets();
  const clientId =
    secrets?.clientId ||
    process.env.GOOGLE_CLIENT_ID ||
    '';
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `http://localhost:3000/api/integrations/google/callback`;

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          'No Google Client ID configured. Go to Integrations and complete Step 1 first.',
      },
      { status: 400 }
    );
  }

  const state = randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);
  // CSRF state cookie: httpOnly, 5 minute TTL, SameSite=Lax
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    maxAge: 300,
    path: '/',
    sameSite: 'lax',
  });
  return response;
}
