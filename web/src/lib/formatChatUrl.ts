/** Short display label for URLs in chat tables (decoded path, truncated). */
export function formatChatUrlDisplay(url: string): string {
  if (!url) return '—';
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    if (path && path !== '/') {
      return path.length > 44 ? `…${path.slice(-42)}` : path;
    }
    return u.hostname;
  } catch {
    return url.length > 48 ? `${url.slice(0, 46)}…` : url;
  }
}
