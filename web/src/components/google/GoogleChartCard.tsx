
import ChartCard from '@/components/ChartCard';
import type { GoogleChartCardProps } from '@/types/components';

/** Google chart wrapper — uses shared ChartCard with ? hint popover. */
export default function GoogleChartCard(props: GoogleChartCardProps) {
  return <ChartCard {...props} />;
}
