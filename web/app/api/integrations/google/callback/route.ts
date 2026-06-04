import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import {
  getClientIdForOAuth,
  getClientSecretForOAuth,
  loadGoogleAppSettings,
} from '@/server/googleAppSettings';
import { setPropertyGoogleCredentials } from '@/server/propertiesDb';
import {
  GOOGLE_OAUTH_RETURN_COOKIE,
  oauthRedirectUrl,
  validateOAuthReturnPath,
} from '@/server/oauthReturn';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

interface TokenExchangeResponse {
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

function appBaseFromEnv(): string {
  return process.env.GOOGLE_REDIRECT_URI
    ? process.env.GOOGLE_REDIRECT_URI.replace('/api/integrations/google/callback', '')
    : 'http://localhost:3000';
}

function oauthErrorRedirect(
  appBase: string,
  returnPath: string,
  reason: string,
): NextResponse {
  return NextResponse.redirect(
    oauthRedirectUrl(appBase, returnPath, {
      integrations: 'open',
      auth: 'error',
      reason,
    }),
  );
}

const OAUTH_PROPERTY_COOKIE = 'google_oauth_property_id';

function clearOAuthCookies(response: NextResponse): void {
  response.cookies.set('google_oauth_state', '', { maxAge: 0, path: '/' });
  response.cookies.set(GOOGLE_OAUTH_RETURN_COOKIE, '', { maxAge: 0, path: '/' });
  response.cookies.set(OAUTH_PROPERTY_COOKIE, '', { maxAge: 0, path: '/' });
}

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const appBase = appBaseFromEnv();
  const returnPath = validateOAuthReturnPath(
    request.cookies.get(GOOGLE_OAUTH_RETURN_COOKIE)?.value,
  );

  if (errorParam) {
    const response = oauthErrorRedirect(appBase, returnPath, errorParam);
    clearOAuthCookies(response);
    return response;
  }

  const cookieState = request.cookies.get('google_oauth_state')?.value;
  if (!state || !cookieState || state !== cookieState) {
    const response = oauthErrorRedirect(
      appBase,
      returnPath,
      'Invalid state parameter. Please try connecting again.',
    );
    clearOAuthCookies(response);
    return response;
  }

  if (!code) {
    const response = oauthErrorRedirect(
      appBase,
      returnPath,
      'No authorization code received.',
    );
    clearOAuthCookies(response);
    return response;
  }

  const propertyCookie = request.cookies.get(OAUTH_PROPERTY_COOKIE)?.value;
  const propertyId = propertyCookie ? parseInt(propertyCookie, 10) : NaN;
  if (!Number.isFinite(propertyId) || propertyId <= 0) {
    const response = oauthErrorRedirect(
      appBase,
      returnPath,
      'Missing property context. Set Site URL and connect Google from Integrations again.',
    );
    clearOAuthCookies(response);
    return response;
  }

  const appRow = await loadGoogleAppSettings();
  const clientId = getClientIdForOAuth(appRow);
  const clientSecret = getClientSecretForOAuth(appRow);
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `http://localhost:3000/api/integrations/google/callback`;

  if (!clientId || !clientSecret) {
    const response = oauthErrorRedirect(
      appBase,
      returnPath,
      'Client credentials missing. Complete Step 1 in Integrations.',
    );
    clearOAuthCookies(response);
    return response;
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

    const tokenData = (await tokenRes.json()) as TokenExchangeResponse;
    if (!tokenRes.ok || !tokenData.refresh_token) {
      const reason = tokenData.error_description || tokenData.error || 'Token exchange failed';
      const response = oauthErrorRedirect(appBase, returnPath, reason);
      clearOAuthCookies(response);
      return response;
    }

    await setPropertyGoogleCredentials(propertyId, {
      refreshToken: tokenData.refresh_token,
      authMode: 'oauth',
    });

    const response = NextResponse.redirect(
      oauthRedirectUrl(appBase, returnPath, {
        integrations: 'open',
        auth: 'success',
      }),
    );
    clearOAuthCookies(response);
    return response;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const response = oauthErrorRedirect(appBase, returnPath, msg);
    clearOAuthCookies(response);
    return response;
  }
};
