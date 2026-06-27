
import { Card } from '@/components';
import DevCopyJsonButton from '@/components/DevCopyJsonButton';

interface ClusterRow {
  topic?: string;
  keywords?: string[];
  size?: number;
}

interface TopicMapPanelProps {
  clusters: ClusterRow[];
  emptyLabel: string;
  devData?: unknown;
}

export default function TopicMapPanel({ clusters, emptyLabel, devData }: TopicMapPanelProps) {
  if (!clusters.length) {
    return <p className="text-sm text-muted-foreground py-6">{emptyLabel}</p>;
  }
  return (
    <div className="relative group/dev-card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {devData != null ? <DevCopyJsonButton data={devData} /> : null}
      {clusters.slice(0, 24).map((c, i) => (
        <Card key={i} className="p-4">
          <h3 className="text-sm font-semibold text-foreground">{c.topic || `Cluster ${i + 1}`}</h3>
          <p className="text-xs text-muted-foreground mt-1">{c.size ?? c.keywords?.length ?? 0} keywords</p>
          <ul className="mt-2 text-xs text-foreground space-y-0.5 max-h-28 overflow-y-auto">
            {(c.keywords || []).slice(0, 8).map((kw) => (
              <li key={kw} className="truncate">{kw}</li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
