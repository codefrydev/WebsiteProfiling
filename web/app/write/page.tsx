import { Suspense } from 'react';
import WriteStudio from '@/views/WriteStudio';

export const dynamic = 'force-dynamic';

export default function WritePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-brand-900 text-muted-foreground">
          Loading…
        </div>
      }
    >
      <WriteStudio />
    </Suspense>
  );
}
