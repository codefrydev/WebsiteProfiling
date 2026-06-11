import { Suspense, type ReactNode } from 'react';
import { ReportAppClient } from '@/ReportShell';
import ReportShellSkeleton from '@/components/ReportShellSkeleton';

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ReportShellSkeleton variant="dashboard" />}>
      <ReportAppClient>{children}</ReportAppClient>
    </Suspense>
  );
}
