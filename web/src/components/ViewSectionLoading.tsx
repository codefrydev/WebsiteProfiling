'use client';

import { Loader2 } from 'lucide-react';
import { PageLayout, PageHeader } from '@/components';
import { Skeleton } from '@/components/Skeleton';
import { strings } from '@/lib/strings';

export function ViewSectionLoading({ title }: { title: string }) {
  return (
    <PageLayout className="space-y-6">
      <PageHeader title={title} />
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {strings.app.loading}
      </div>
    </PageLayout>
  );
}

export function OverviewHeaderSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
