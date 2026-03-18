export function getBadgeVariant(value) {
  if (!value) return 'info';
  const v = String(value).toLowerCase();
  if (v === 'critical') return 'critical';
  if (v === 'high') return 'high';
  if (v === 'medium') return 'medium';
  if (v === 'low') return 'low';
  if (v === 'info') return 'info';
  if (v === 'success' || v === 'ok' || v === '2xx' || v === '200') return 'success';
  if (v === 'warning' || v === 'redirect' || v === '3xx' || v === '301' || v === '302') return 'medium';
  if (v === 'error' || v === '4xx' || v === '5xx') return 'high';
  return 'info';
}
