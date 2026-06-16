/** Shared section title patterns for preprocess and strip pipelines. */

export const CHAT_SECTION_TITLES = [
  'Power Insights',
  'Key takeaways',
  'Executive summary',
  'What the data shows',
  'Overall health',
  'Site health',
  'Critical blockers',
  'Top priorities',
  'Issues to fix',
  'Recommended actions',
  'Next steps',
  'Quick wins',
  'Priority fixes',
  'What looks good',
  "What's working",
  'Strengths',
  'What needs attention',
  'Areas to improve',
  'Recommendations',
  'Issue details',
  'Image audit',
  'Lighthouse',
  'Search Console',
  'GSC summary',
  'Compare',
  'Security findings',
] as const;

/** Sections expanded by default in ChatInsightSections. */
export const CHAT_EXPANDED_SECTIONS = new Set(
  [
    'power insights',
    'key takeaways',
    'executive summary',
    'recommended actions',
    'quick wins',
    'next steps',
    'priority fixes',
    'recommendations',
  ].map((s) => s.toLowerCase()),
);

export function isExpandedSectionTitle(title: string): boolean {
  const normalized = title.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '').trim();
  return CHAT_EXPANDED_SECTIONS.has(normalized.toLowerCase());
}

export function stripEmojiFromTitle(title: string): string {
  return title
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s🔎📸💡⚠️✅]+/u, '')
    .replace(/\s+for\s+[\w.-]+\.[a-z]{2,}\s*$/i, '')
    .trim();
}
