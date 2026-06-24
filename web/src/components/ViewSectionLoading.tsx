
import { PageLayout, PageHeader } from '@/components';
import { Skeleton } from '@/components/Skeleton';
import { ViewPageSkeleton } from '@/components/SectionWidgetSkeleton';
import { strings } from '@/lib/strings';

export function ViewSectionLoading({ title }: { title: string }) {
  return (
    <PageLayout className="space-y-6">
      <PageHeader title={title} className="mb-0" />
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">{strings.app.loading}</span>
        <ViewPageSkeleton />
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
