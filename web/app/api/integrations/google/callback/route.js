import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { readSecrets, writeSecrets } from '@/server/googleSecrets';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/callback
 * Validates CSRF state, exchanges code for tokens, stores refresh token.
 * Redirects to /?integrations=open&auth=success|error
 */
export async function GET(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const appBase = process.env.GOOGLE_REDIRECT_URI
    ? process.env.GOOGLE_REDIRECT_URI.replace('/api/integrations/google/callback', '')
    : 'http://localhost:3000';

  if (errorParam) {
    return NextResponse.redirect(
      `${appBase}/?integrations=open&auth=error&reason=${encodeURIComponent(errorParam)}`
    );
  }

  // CSRF validation
  const cookieState = request.cookies.get('google_oauth_state')?.value;
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(
      `${appBase}/?integrations=open&auth=error&reason=${encodeURIComponent('Invalid state parameter. Please try connecting again.')}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appBase}/?integrations=open&auth=error&reason=${encodeURIComponent('No authorization code received.')}`
    );
  }

  const secrets = readSecrets() || {};
  const clientId = secrets.clientId || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = secrets.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `http://localhost:3000/api/integrations/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${appBase}/?integrations=open&auth=error&reason=${encodeURIComponent('Client credentials missing. Complete Step 1 in Integrations.')}`
    );
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.refresh_token) {
      const reason = tokenData.error_description || tokenData.error || 'Token exchange failed';
      return NextResponse.redirect(
        `${appBase}/?integrations=open&auth=error&reason=${encodeURIComponent(reason)}`
      );
    }

    writeSecrets({ authMode: 'oauth', refreshToken: tokenData.refresh_token });

    const response = NextResponse.redirect(
      `${appBase}/?integrations=open&auth=success`
    );
    // Clear CSRF cookie
    response.cookies.set('google_oauth_state', '', { maxAge: 0, path: '/' });
    return response;
  } catch (e) {
    return NextResponse.redirect(
      `${appBase}/?integrations=open&auth=error&reason=${encodeURIComponent(e.message)}`
    );
  }
}
