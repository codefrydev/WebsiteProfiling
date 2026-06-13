import type { ReactNode } from 'react';
import StatCard from '../StatCard';
import type { HelpHintContent } from '../HelpHint';

/** @deprecated Use StatCard from @/components */
export default function SummaryCard({
  label,
  value,
  sub,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  hint?: HelpHintContent;
}) {
  return <StatCard label={label} value={value} sub={sub} hint={hint} size="md" />;
}
