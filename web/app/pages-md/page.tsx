import { Suspense } from 'react';
import AppLoadingScreen from '@/components/AppLoadingScreen';
import PagesMarkdown from '@/views/PagesMarkdown';

export const dynamic = 'force-dynamic';

export default function PagesMarkdownPage() {
  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <PagesMarkdown />
    </Suspense>
  );
}
