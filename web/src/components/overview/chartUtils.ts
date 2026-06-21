export function sumObject(obj: Record<string, unknown> | null | undefined): number {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).reduce<number>((a, v) => a + Number(v ?? 0), 0);
}
