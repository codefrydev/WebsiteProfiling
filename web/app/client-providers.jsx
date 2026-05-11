'use client';

import { Suspense } from 'react';
import '@/patchConsole';
import { ThemeProvider } from '@/context/ThemeProvider';
import { ReportAppClient } from '@/ReportShell';

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-900 text-foreground">
      <p>Loading…</p>
    </div>
  );
}

export default function ClientProviders({ children }) {
  return (
    <ThemeProvider>
      <Suspense fallback={<LoadingFallback />}>
        <ReportAppClient>{children}</ReportAppClient>
      </Suspense>
    </ThemeProvider>
  );
}
