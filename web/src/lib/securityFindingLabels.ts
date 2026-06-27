/** User-facing labels for security scanner finding_type codes. */
const FINDING_TYPE_LABELS: Record<string, string> = {
  missing_hsts: 'Missing HSTS header',
  missing_x_content_type_options: 'Missing X-Content-Type-Options',
  missing_x_frame_options: 'Missing X-Frame-Options',
  missing_csp: 'Missing Content-Security-Policy',
  http_final_url: 'HTTP final URL (insecure)',
  open_redirect_risk: 'Open redirect risk',
  mixed_content: 'Mixed content',
  sql_injection: 'SQL injection risk',
  xss_reflected: 'Reflected XSS risk',
};

export function securityFindingLabel(findingType: string | null | undefined): string {
  if (!findingType) return '';
  const key = findingType.trim().toLowerCase();
  if (FINDING_TYPE_LABELS[key]) return FINDING_TYPE_LABELS[key];
  return findingType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
