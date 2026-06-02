/** Structured pipeline errors in the browser console (devTools). */
export function logPipelineFailure(
  context: string,
  details: Record<string, unknown>,
): void {
  console.error(`[WebsiteProfiling Pipeline] ${context}`, details);
}

export function formatPipelineJobLog(log: string | undefined, error: string | null | undefined): string {
  const text = (log ?? '').trim();
  const err = (error ?? '').trim();
  if (text && err && !text.includes(err)) {
    return `${text}\n\n---\n${err}`;
  }
  return text || err;
}
