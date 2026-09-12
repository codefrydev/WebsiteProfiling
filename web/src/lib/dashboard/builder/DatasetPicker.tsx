
import { datasetsByGroup } from '@/lib/dashboard/engine/datasets';

interface DatasetPickerProps {
  value: string;
  onChange: (datasetId: string) => void;
}

export function DatasetPicker({ value, onChange }: DatasetPickerProps) {
  const groups = datasetsByGroup();
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-md-sys-on-surface-variant mb-1">Data source</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm bg-md-sys-surface-container border border-md-sys-outline-variant/40 rounded-lg text-md-sys-on-surface focus:outline-none focus:ring-1 focus:ring-md-sys-primary"
      >
        {groups.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.datasets.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
