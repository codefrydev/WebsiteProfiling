import { strings } from '@/lib/strings';
import type { OllamaBillingTier } from '@/hooks/useOllamaModels';

const s = strings.pipelineRunner.ollama;

export function ollamaBillingLabel(tier: OllamaBillingTier): string {
  if (tier === 'free_local') return s.billingFreeLocal;
  if (tier === 'cloud_pro') return s.billingCloudPro;
  return s.billingCloudFree;
}

export function ollamaModelOptionLabel(
  name: string,
  billing: OllamaBillingTier,
  capabilities?: string[],
): string {
  const parts = [name];
  if (capabilities?.includes('tools')) parts.push('tools');
  parts.push(ollamaBillingLabel(billing));
  return parts.join(' · ');
}

/** Short label for compact UI (composer model chip). */
export function ollamaModelShortLabel(name: string, maxLen = 18): string {
  let short = name.replace(/:cloud$/i, '').replace(/:latest$/i, '');
  const colon = short.indexOf(':');
  if (colon > 0 && colon < short.length - 1) {
    short = short.slice(0, colon);
  }
  if (short.length > maxLen) {
    return `${short.slice(0, maxLen - 1)}…`;
  }
  return short;
}
