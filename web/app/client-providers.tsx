'use client';

import { Suspense, type ReactNode } from 'react';
import '@/patchConsole';
import { ThemeProvider } from '@/context/ThemeProvider';
import { PipelineProvider } from '@/context/PipelineContext';
import PipelineRunnerFab from '@/components/pipeline/PipelineRunnerFab';

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-900 text-foreground">
      <p>Loading…</p>
    </div>
  );
}

export default function ClientProviders({ children }: { children: ReactNode }): ReactNode {
  return (
    <ThemeProvider>
      <Suspense fallback={<LoadingFallback />}>
        <PipelineProvider>
          {children}
          <PipelineRunnerFab />
        </PipelineProvider>
      </Suspense>
    </ThemeProvider>
  );
}
