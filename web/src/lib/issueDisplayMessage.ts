/** Human-readable issue message; repairs legacy bare Lighthouse audit ids. */
export function issueDisplayMessage(message?: string | null): string {
  const raw = (message ?? '').trim();
  if (!raw) return '';
  // Legacy reports stored only the audit id, e.g. "image-alt:"
  if (/^[a-z0-9-]+:$/i.test(raw)) {
    const id = raw.slice(0, -1);
    return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return raw;
}

export function lighthouseFailureLabel(f: {
  title?: string;
  helpText?: string;
  description?: string;
  id?: string;
}): string {
  const title = (f.title ?? '').trim();
  const help = (f.helpText ?? f.description ?? '').trim();
  if (title && help && title.toLowerCase() !== help.toLowerCase()) {
    return `${title}: ${help}`;
  }
  if (title) return title;
  if (help) return help;
  const id = (f.id ?? '').trim();
  if (!id) return '';
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
