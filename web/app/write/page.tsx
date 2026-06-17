import { Suspense } from 'react';
import AppLoadingScreen from '@/components/AppLoadingScreen';
import WriteStudio from '@/views/WriteStudio';

export const dynamic = 'force-dynamic';

export default function WritePage() {
  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <WriteStudio />
    </Suspense>
  );
}
