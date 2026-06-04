/** Display names for report category `name` from Python (legacy names mapped for older audits). */
const CATEGORY_DISPLAY: Record<string, string> = {
  'Technical SEO': 'Technical SEO',
  'Core Web Vitals': 'Core Web Vitals',
  Performance: 'Performance',
  'Accessibility & markup': 'Accessibility & markup',
  Links: 'Links',
  'Mobile SEO': 'Mobile SEO',
  Security: 'Security',
  'Content quality': 'Content quality',
  // Legacy payloads
  'HTML/Accessibility': 'Accessibility & markup',
  'HTML & Accessibility': 'Accessibility & markup',
  'Link Health': 'Links',
  'Mobile Optimization': 'Mobile SEO',
  'Content intelligence': 'Content quality',
};

export function categoryDisplayName(backendName: string | null | undefined): string {
  if (!backendName) return '';
  return CATEGORY_DISPLAY[backendName] ?? backendName;
}
