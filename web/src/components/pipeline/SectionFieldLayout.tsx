
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { strings, format } from '@/lib/strings';
import {
  groupFieldsBySubgroup,
  type PipelineConfigField,
  type PipelineConfigSection,
} from '@/lib/pipelineConfigSchema';
import ConfigField from './ConfigField';

const s = strings.pipelineRunner;

type FieldValues = Record<string, string | boolean | undefined>;
type OnFieldChange = (key: string, value: string | boolean) => void;

function FieldGrid({
  fields,
  values,
  disabled,
  onChange,
}: {
  fields: PipelineConfigField[];
  values: FieldValues;
  disabled: boolean;
  onChange: OnFieldChange;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <ConfigField
          key={f.key}
          field={f}
          value={values[f.key]}
          disabled={disabled}
          onChange={(v) => onChange(f.key, v)}
        />
      ))}
    </div>
  );
}

/** Render fields grouped into the section's labeled subgroups (or one flat grid). */
function SubgroupedFields({
  section,
  fields,
  values,
  disabled,
  onChange,
}: {
  section: PipelineConfigSection;
  fields: PipelineConfigField[];
  values: FieldValues;
  disabled: boolean;
  onChange: OnFieldChange;
}) {
  const groups = groupFieldsBySubgroup(section, fields);
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.id} className="space-y-2">
          {group.label ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
          ) : null}
          <FieldGrid fields={group.fields} values={values} disabled={disabled} onChange={onChange} />
        </div>
      ))}
    </div>
  );
}

export interface SectionFieldLayoutProps {
  section: PipelineConfigSection;
  basicFields: PipelineConfigField[];
  advancedFields: PipelineConfigField[];
  values: FieldValues;
  disabled: boolean;
  onChange: OnFieldChange;
  /** Rendered after the basic fields (e.g. the Ollama model picker). */
  extra?: ReactNode;
}

/**
 * Lays out one settings section: essential fields up-front (grouped into labeled
 * subgroups when the section defines them), with power-user fields tucked behind
 * a collapsed "Advanced options" disclosure.
 */
export default function SectionFieldLayout({
  section,
  basicFields,
  advancedFields,
  values,
  disabled,
  onChange,
  extra,
}: SectionFieldLayoutProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const hasAdvanced = advancedFields.length > 0;
  const Chevron = advancedOpen ? ChevronDown : ChevronRight;

  return (
    <div className="space-y-5">
      {basicFields.length ? (
        <SubgroupedFields
          section={section}
          fields={basicFields}
          values={values}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}

      {extra}

      {hasAdvanced ? (
        <div className="overflow-hidden rounded-lg border border-default bg-brand-900/30">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-brand-900/50"
          >
            <span className="flex items-center gap-2">
              <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              {s.advancedOptionsLabel}
            </span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              {format(s.advancedOptionsHint, { count: advancedFields.length })}
            </span>
          </button>
          {advancedOpen ? (
            <div className="border-t border-default px-4 py-4">
              <SubgroupedFields
                section={section}
                fields={advancedFields}
                values={values}
                disabled={disabled}
                onChange={onChange}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
