export interface ContentScoreTerm {
  term: string;
  status: 'included' | 'missing' | 'partial';
  importance: 'high' | 'medium';
  source: string;
  /** Times the term currently appears in the draft. */
  count: number;
  /** Recommended number of occurrences. */
  target: number;
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
  /** Recommended word count for competitive depth. */
  word_count_target: number;
  word_count_min: number;
  word_count_max: number;
  reading_level: number;
  /** Flesch–Kincaid grade we treat as broadly readable. */
  reading_level_target: number;
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

export interface WizardOption {
  label: string;
  description: string;
}

export interface WizardOutlineItem {
  level: 'h1' | 'h2' | 'h3';
  text: string;
}

export interface WizardOptionsResult {
  ok: boolean;
  options?: WizardOption[];
  error?: string;
}

export interface WizardTitlesResult {
  ok: boolean;
  titles?: string[];
  error?: string;
}

export interface WizardOutlineResult {
  ok: boolean;
  outline?: WizardOutlineItem[];
  error?: string;
}

export interface WizardResearchResult {
  ok: boolean;
  questions?: string[];
  sources?: WizardOption[];
  error?: string;
}

export interface WizardDraftResult {
  ok: boolean;
  title_tag?: string;
  meta_description?: string;
  body_html?: string;
  outline?: WizardOutlineItem[];
  error?: string;
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
