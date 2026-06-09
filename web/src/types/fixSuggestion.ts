export type FixSuggestionSource =
  | 'issue'
  | 'lighthouse'
  | 'security'
  | 'browser'
  | 'seo_content'
  | 'technical';

export interface FixSuggestionRequest {
  source: FixSuggestionSource;
  message: string;
  url?: string;
  refresh?: boolean;
  context?: Record<string, unknown>;
}

export interface FixSuggestionFix {
  fix: string;
  effort?: 'low' | 'medium' | 'high';
}

export interface FixSuggestionResponse {
  ok: boolean;
  fix?: FixSuggestionFix | string;
  cached?: boolean;
  provenance?: string;
  error?: string;
}

export function extractFixText(payload: FixSuggestionResponse): string {
  const raw = payload.fix;
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && typeof raw.fix === 'string') return raw.fix.trim();
  return '';
}
