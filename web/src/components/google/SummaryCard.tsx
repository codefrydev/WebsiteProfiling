import type { ReactNode } from 'react';
import StatCard from '../StatCard';

/** @deprecated Use StatCard from @/components */
export default function SummaryCard({
  label,
  value,
  sub,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return <StatCard label={label} value={value} sub={sub} size="md" />;
}
