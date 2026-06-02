import { ReportAppClient } from '@/ReportShell';
import type { ReactNode } from 'react';

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <ReportAppClient>{children}</ReportAppClient>;
}
