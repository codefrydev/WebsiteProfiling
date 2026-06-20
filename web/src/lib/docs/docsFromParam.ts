import { strings } from '@/lib/strings';

export type DocsFromParam = 'integrations' | 'secrets' | 'landing';

const VALID_FROM = new Set<string>(['integrations', 'secrets', 'landing']);

export function parseDocsFromParam(value: string | null | undefined): DocsFromParam | null {
  if (!value || !VALID_FROM.has(value)) return null;
  return value as DocsFromParam;
}

export function docsBackLink(from: DocsFromParam | null): { label: string; href: string } {
  const d = strings.docs;
  switch (from) {
    case 'integrations':
      return { label: d.backToIntegrations, href: '/pipeline?integrations=open' };
    case 'secrets':
      return { label: d.backToSecrets, href: '/secrets' };
    case 'landing':
      return { label: d.backToLanding, href: '/' };
    default:
      return { label: d.backToHome, href: '/home' };
  }
}
