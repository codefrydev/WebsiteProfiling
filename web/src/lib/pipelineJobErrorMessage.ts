/** Build a user-visible error when a Python pipeline subprocess exits non-zero. */
export function buildPipelineJobErrorMessage(log: string, exitCode: number | null): string {
  const code = exitCode ?? 'unknown';
  const tail = log.trim().slice(-3000);
  const lines = tail
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const hint = [...lines].reverse().find((line) =>
    /Pipeline finished with failures|Pipeline completed with warnings|\] failed:|Error:|Traceback \(most recent/i.test(
      line,
    ),
  );
  if (hint) return `Process exited with code ${code}: ${hint.slice(0, 400)}`;
  if (tail) return `Process exited with code ${code}\n\n${tail.slice(-600)}`;
  return `Process exited with code ${code} (no output captured)`;
}
