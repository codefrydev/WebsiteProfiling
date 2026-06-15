export interface ContentScoreTerm {
  term: string;
  status: 'included' | 'missing' | 'partial';
  importance: 'high' | 'medium';
  source: string;
}

export interface ContentScoreCheck {
  id: string;
  pass: boolean;
  hint: string;
}

export interface ContentScoreResult {
  grade_score: number;
  grade_label: string;
  word_count: number;
  reading_level: number;
  terms: ContentScoreTerm[];
  checks: ContentScoreCheck[];
  provenance: string;
}

export interface ContentDraftListItem {
  id: number;
  property_id: number;
  title: string;
  target_keyword: string;
  landing_url: string | null;
  status: 'draft' | 'ready' | 'archived';
  grade_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface ContentDraftDetail extends ContentDraftListItem {
  body_html: string;
  title_tag: string;
  meta_description: string;
  grade_snapshot: ContentScoreResult | null;
}

export interface ContentSuggestionItem {
  text: string;
  priority: string;
  type: string;
  source?: string;
}

export interface ContentAnalyzeResult {
  ok: boolean;
  score: ContentScoreResult;
  suggestions: ContentSuggestionItem[];
  summary: string;
  outline: string[];
  title_ideas: string[];
  ai_used: boolean;
  provenance: string;
  ai_error?: string;
  tools_used?: string[];
  tool_events?: Array<{ name: string; args?: Record<string, unknown>; result: unknown }>;
}
