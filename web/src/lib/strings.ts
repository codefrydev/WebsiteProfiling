import raw from '../strings.json';

export const strings = raw;

/** Replace `{key}` placeholders in a template string. */
export function format(
  template: unknown,
  vars: Record<string, unknown> = {},
): string {
  if (template == null) return '';
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) && vars[key] != null
      ? String(vars[key])
      : '',
  );
}
