
import { datasetsByGroup } from '@/lib/dashboard/engine/datasets';

interface DatasetPickerProps {
  value: string;
  onChange: (datasetId: string) => void;
}

export function DatasetPicker({ value, onChange }: DatasetPickerProps) {
  const groups = datasetsByGroup();
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Data source</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm bg-brand-800 border border-default rounded-lg text-bright focus:outline-none focus:ring-1 focus:ring-blue-500"
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
