export type ConfigFieldDef = {
  key: string;
  label: string;
  type: string;
  defaultValue?: string | boolean | number;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Grid columns in the settings panel (1 = half width, 2 = full width). */
  span?: 1 | 2;
  /** Optional suffix beside numeric card inputs (e.g. pages, rows). */
  unit?: string;
  /** When true, value must be non-empty before save/run. */
  required?: boolean;
};

export interface ConfigFieldProps {
  field: ConfigFieldDef;
  value: string | boolean | undefined;
  disabled?: boolean;
  onChange: (v: string | boolean) => void;
}

function fieldSpan(f: ConfigFieldDef): 1 | 2 {
  if (f.span != null) return f.span;
  if (f.type === 'url' || f.type === 'textarea' || f.type === 'bool' || f.type === 'tristate' || f.type === 'secret') {
    return 2;
  }
  if (f.type === 'singleselect' || f.type === 'multiselect' || f.type === 'select') return 2;
  if ((f.type === 'text' || f.type === 'number' || f.type === 'float') && f.help) return 2;
  return 1;
}

function wrapClass(span: 1 | 2) {
  return span === 2 ? 'min-w-0 sm:col-span-2' : 'min-w-0';
}

const inputClass =
  'w-full rounded-lg border border-default bg-brand-900 px-3 py-2 text-sm text-foreground focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/** Single config row for any field type. */
export default function ConfigField({ field: f, value, disabled, onChange }: ConfigFieldProps) {
  const id = `pipe-cfg-${f.key}`;
  const span = fieldSpan(f);
  const outerClass = wrapClass(span);

  const labelBlock = (
    <div className="mb-2">
      <label htmlFor={id} className="block text-xs font-medium text-foreground">
        {f.label}
        {f.required ? <span className="ml-0.5 text-red-600 dark:text-red-400" aria-hidden>*</span> : null}
      </label>
      {f.help ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{f.help}</p> : null}
    </div>
  );

  const helpBelow = f.help ? (
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.help}</p>
  ) : null;

  if (f.type === 'url') {
    const strVal = value == null ? '' : String(value);
    return (
      <div className={outerClass}>
        {labelBlock}
        <input
          id={id}
          type="url"
          placeholder={f.placeholder || undefined}
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      </div>
    );
  }

  if (f.type === 'select') {
    const strVal = value == null ? String(f.defaultValue ?? '') : String(value);
    return (
      <div className={outerClass}>
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground">
          {f.label}
        </label>
        <select
          id={id}
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          {(f.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {helpBelow}
      </div>
    );
  }

  if (f.type === 'singleselect') {
    const strVal = value == null ? String(f.defaultValue ?? '') : String(value);
    const options = f.options || [];
    const optionGridClass = span === 1 ? 'grid gap-2 grid-cols-1' : 'grid gap-2 sm:grid-cols-2';

    return (
      <div className={outerClass}>
        <p className="mb-2 text-xs font-medium text-foreground">{f.label}</p>
        <div className={optionGridClass} role="radiogroup" aria-label={f.label}>
          {options.map((opt) => {
            const optId = `${id}-${opt.value}`;
            return (
              <label
                key={opt.value}
                htmlFor={optId}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-default bg-brand-900/50 px-3 py-2"
              >
                <input
                  id={optId}
                  type="radio"
                  name={id}
                  checked={strVal === opt.value}
                  disabled={disabled}
                  onChange={() => onChange(opt.value)}
                  className="h-4 w-4 border-default text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-foreground">{opt.label}</span>
              </label>
            );
          })}
        </div>
        {helpBelow}
      </div>
    );
  }

  if (f.type === 'multiselect') {
    const raw = value == null ? String(f.defaultValue ?? '') : String(value);
    const selected = new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const options = f.options || [];

    const toggle = (optValue: string, checked: boolean) => {
      const next = new Set(selected);
      if (checked) next.add(optValue);
      else next.delete(optValue);
      const ordered = options.filter((opt) => next.has(opt.value)).map((opt) => opt.value);
      onChange(ordered.join(','));
    };

    return (
      <div className={outerClass}>
        <p className="mb-2 text-xs font-medium text-foreground">{f.label}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((opt) => {
            const optId = `${id}-${opt.value}`;
            return (
              <label
                key={opt.value}
                htmlFor={optId}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-default bg-brand-900/50 px-3 py-2"
              >
                <input
                  id={optId}
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  disabled={disabled}
                  onChange={(e) => toggle(opt.value, e.target.checked)}
                  className="h-4 w-4 rounded border-default text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-foreground">{opt.label}</span>
              </label>
            );
          })}
        </div>
        {helpBelow}
      </div>
    );
  }

  if (f.type === 'secret') {
    const strVal = value == null ? '' : String(value);
    const isMasked = strVal.startsWith('••••');
    const displayValue = isMasked ? '' : strVal;
    const placeholder = isMasked
      ? 'Paste a new key to replace the saved one'
      : 'Paste API key (or use env vars — see below)';

    return (
      <div className={outerClass}>
        <div className="rounded-lg border border-default bg-brand-900/50 px-4 py-3">
          {labelBlock}
          <input
            id={id}
            type="password"
            autoComplete="off"
            placeholder={placeholder}
            value={displayValue}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} font-mono`}
          />
          {isMasked ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              Key saved ({strVal}). Leave blank to keep it.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (f.type === 'bool') {
    const checked = value === true;
    if (f.help) {
      return (
        <div className={outerClass}>
          <label
            htmlFor={id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-default bg-brand-900/50 px-3 py-2.5"
          >
            <input
              id={id}
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(e) => onChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-default text-blue-600 focus:ring-blue-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{f.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{f.help}</span>
            </span>
          </label>
        </div>
      );
    }
    return (
      <div className={outerClass}>
        <label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-default bg-brand-900/50 px-3 py-2"
        >
          <input
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-default text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-foreground">{f.label}</span>
        </label>
      </div>
    );
  }

  if (f.type === 'tristate') {
    const strVal = value == null ? 'auto' : String(value);
    const options = f.options ?? [
      { value: 'auto', label: 'Auto' },
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ];
    const optionGridClass = span === 1 ? 'grid gap-2 grid-cols-1' : 'grid gap-2 sm:grid-cols-3';

    return (
      <div className={outerClass}>
        {f.help ? (
          labelBlock
        ) : (
          <p className="mb-2 text-xs font-medium text-foreground">{f.label}</p>
        )}
        <div className={optionGridClass} role="radiogroup" aria-label={f.label}>
          {options.map((opt) => {
            const optId = `${id}-${opt.value}`;
            return (
              <label
                key={opt.value}
                htmlFor={optId}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-default bg-brand-900/50 px-3 py-2"
              >
                <input
                  id={optId}
                  type="radio"
                  name={id}
                  checked={strVal === opt.value}
                  disabled={disabled}
                  onChange={() => onChange(opt.value)}
                  className="h-4 w-4 border-default text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-foreground">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (f.type === 'textarea') {
    const strVal = value == null ? '' : String(value);
    return (
      <div className={outerClass}>
        {labelBlock}
        <textarea
          id={id}
          rows={4}
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} font-mono resize-y`}
        />
      </div>
    );
  }

  const strVal = value == null ? '' : String(value);
  const isNumeric = f.type === 'number' || f.type === 'float';

  if (isNumeric && f.help) {
    return (
      <div className={outerClass}>
        <div className="rounded-lg border border-default bg-brand-900/50 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <label htmlFor={id} className="block text-sm font-medium text-foreground">
                {f.label}
              </label>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{f.help}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:pl-4">
              <input
                id={id}
                type="text"
                inputMode="decimal"
                placeholder={f.placeholder || undefined}
                value={strVal}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                aria-label={f.label}
                className={`${inputClass} w-full min-w-[5.5rem] max-w-[7rem] font-mono tabular-nums sm:text-right`}
              />
              {f.unit ? (
                <span className="text-xs text-muted-foreground">{f.unit}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={outerClass}>
      {f.help ? (
        labelBlock
      ) : (
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground">
          {f.label}
          {f.required ? <span className="ml-0.5 text-red-600 dark:text-red-400" aria-hidden>*</span> : null}
        </label>
      )}
      <input
        id={id}
        type="text"
        inputMode={isNumeric ? 'decimal' : undefined}
        placeholder={f.placeholder || undefined}
        value={strVal}
        disabled={disabled}
        required={f.required}
        aria-required={f.required || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass}${isNumeric ? ' font-mono' : ''}`}
      />
    </div>
  );
}
