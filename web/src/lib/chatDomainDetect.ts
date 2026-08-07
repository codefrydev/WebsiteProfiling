/** Best-effort domain-like token inside free text, e.g. a typed chat message. */
const DOMAIN_TOKEN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/i;

/** Extracts and validates the first domain-like token in text; null if none found. */
export function extractDomainFromText(text: string): string | null {
  const match = DOMAIN_TOKEN_RE.exec(text);
  if (!match) return null;
  const token = match[0].toLowerCase().replace(/\.+$/, '');
  try {
    return new URL(`https://${token}`).hostname || null;
  } catch {
    return null;
  }
}
