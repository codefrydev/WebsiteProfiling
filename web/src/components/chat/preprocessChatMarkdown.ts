/** Normalize assistant markdown so section titles and lists render with structure. */
export function preprocessChatMarkdown(content: string): string {
  let out = content.trim();
  if (!out) return out;

  const sectionHeadings = [
    'What looks good',
    "What's working",
    'Strengths',
    'What needs attention',
    'Areas to improve',
    'Top priorities',
    'Issues to fix',
    'Recommendations',
    'Next steps',
    'Power Insights',
    'Recommended actions',
    'Quick wins',
    'Priority fixes',
  ];

  for (const title of sectionHeadings) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`([.!?])\\s+(${escaped})\\s+`, 'gi');
    out = out.replace(re, `$1\n\n### $2\n\n`);
    const lineStart = new RegExp(`^(?!#{1,6}\\s)(${escaped})\\s+`, 'im');
    out = out.replace(lineStart, `### $1\n\n`);
  }

  // Em-dash or hyphen bullets run together in one paragraph → list items
  out = out.replace(/([.!?])\s+([—–-]\s+)/g, '$1\n$2');

  const lines = out.split('\n');
  const normalized: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[—–-]\s+/.test(trimmed) && !trimmed.startsWith('---')) {
      normalized.push(trimmed.replace(/^[—–-]\s+/, '- '));
    } else {
      normalized.push(line);
    }
  }
  out = normalized.join('\n');

  return out.replace(/\n{3,}/g, '\n\n').trim();
}
