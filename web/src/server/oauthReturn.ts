const DEFAULT_RETURN_PATH = '/home';

export const GOOGLE_OAUTH_RETURN_COOKIE = 'google_oauth_return';

export interface OAuthResultParams {
  integrations: string;
  auth: 'success' | 'error';
  reason?: string;
}

/**
 * Accept only same-origin relative paths for post-OAuth redirects.
 */
export function validateOAuthReturnPath(path: string | null | undefined): string {
  if (path == null || path === '') return DEFAULT_RETURN_PATH;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/')) return DEFAULT_RETURN_PATH;
  if (trimmed.startsWith('//')) return DEFAULT_RETURN_PATH;
  if (trimmed.includes('://')) return DEFAULT_RETURN_PATH;
  const pathname = trimmed.split('?')[0]?.split('#')[0] ?? '';
  if (pathname.startsWith('/api/')) return DEFAULT_RETURN_PATH;
  return trimmed;
}

/** Merge OAuth result query params without dropping existing ones. */
export function appendOAuthResultParams(basePath: string, params: OAuthResultParams): string {
  const hashIdx = basePath.indexOf('#');
  const withoutHash = hashIdx >= 0 ? basePath.slice(0, hashIdx) : basePath;
  const hash = hashIdx >= 0 ? basePath.slice(hashIdx) : '';

  const qIdx = withoutHash.indexOf('?');
  const pathname = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
  const existingQs = qIdx >= 0 ? withoutHash.slice(qIdx + 1) : '';

  const sp = new URLSearchParams(existingQs);
  sp.set('integrations', params.integrations);
  sp.set('auth', params.auth);
  if (params.reason != null && params.reason !== '') {
    sp.set('reason', params.reason);
  } else {
    sp.delete('reason');
  }

  const q = sp.toString();
  return `${pathname}${q ? `?${q}` : ''}${hash}`;
}

/** Build absolute redirect URL for OAuth callback responses. */
export function oauthRedirectUrl(
  appBase: string,
  returnPath: string,
  params: OAuthResultParams,
): string {
  const relative = appendOAuthResultParams(returnPath, params);
  return `${appBase.replace(/\/$/, '')}${relative}`;
}
