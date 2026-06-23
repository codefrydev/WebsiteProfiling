import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ReportAppClient } from '@/ReportShell';
import ReportShellSkeleton from '@/components/ReportShellSkeleton';

export default function ReportLayout() {
  return (
    <ReportAppClient>
      <Suspense fallback={<ReportShellSkeleton variant="dashboard" />}>
        <Outlet />
      </Suspense>
    </ReportAppClient>
  );
}
