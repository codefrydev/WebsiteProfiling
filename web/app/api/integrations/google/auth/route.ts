import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { readSecrets } from '@/server/googleSecrets';
import {
  GOOGLE_OAUTH_RETURN_COOKIE,
  validateOAuthReturnPath,
} from '@/server/oauthReturn';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
].join(' ');

const OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  maxAge: 300,
  path: '/',
  sameSite: 'lax' as const,
};

/**
 * GET /api/integrations/google/auth
 * Generates a CSRF state token, stores return path, redirects to Google OAuth.
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
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
      { status: 400 },
    );
  }

  const state = randomUUID();
  const returnTo = validateOAuthReturnPath(request.nextUrl.searchParams.get('returnTo'));

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
  response.cookies.set('google_oauth_state', state, OAUTH_COOKIE_OPTS);
  response.cookies.set(GOOGLE_OAUTH_RETURN_COOKIE, returnTo, OAUTH_COOKIE_OPTS);
  return response;
};
