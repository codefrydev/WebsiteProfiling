/** Server-side pipeline DB write failures (visible in Next.js terminal). */
export function logPipelineDbError(action: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[pipeline-db] ${action}: ${msg}`);
}

/** Structured pipeline errors in the browser console (devTools). */
export function logPipelineFailure(
  context: string,
  details: Record<string, unknown>,
): void {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'log' && typeof value === 'string') {
      const tail = value.trim().slice(-500);
      if (tail) parts.push(`logTail=${tail}`);
      continue;
    }
    if (value instanceof Error) {
      parts.push(`${key}=${value.message}`);
      continue;
    }
    if (typeof value === 'string') {
      parts.push(`${key}=${value.slice(0, 500)}`);
      continue;
    }
    try {
      parts.push(`${key}=${JSON.stringify(value)}`);
    } catch {
      parts.push(`${key}=[unserializable]`);
    }
  }
  const suffix = parts.length ? `: ${parts.join(' | ')}` : '';
  console.error(`[Site Audit run] ${context}${suffix}`);
}

export function formatPipelineJobLog(log: string | undefined, error: string | null | undefined): string {
  const text = (log ?? '').trim();
  const err = (error ?? '').trim();
  if (text && err && !text.includes(err)) {
    return `${text}\n\n---\n${err}`;
  }
  return text || err;
}
