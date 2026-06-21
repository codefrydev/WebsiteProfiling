'use client';

import { Suspense, type ReactNode } from 'react';
import '@/patchConsole';
import { ThemeProvider } from '@/context/ThemeProvider';
import { PipelineProvider } from '@/context/PipelineContext';
import { SessionProvider } from '@/context/SessionContext';
import BrandingProvider from '@/context/BrandingProvider';
import { RiskFeaturesProvider } from '@/context/RiskFeaturesContext';
import ChatFab from '@/components/chat/ChatFab';
import PipelineRunnerFab from '@/components/pipeline/PipelineRunnerFab';
import AppLoadingScreen from '@/components/AppLoadingScreen';

function LoadingFallback() {
  return <AppLoadingScreen />;
}

export default function ClientProviders({ children }: { children: ReactNode }): ReactNode {
  return (
    <ThemeProvider>
      <BrandingProvider>
      <SessionProvider>
        <RiskFeaturesProvider>
          <Suspense fallback={<LoadingFallback />}>
            <PipelineProvider>
              {children}
              <ChatFab />
              <PipelineRunnerFab />
            </PipelineProvider>
          </Suspense>
        </RiskFeaturesProvider>
      </SessionProvider>
      </BrandingProvider>
    </ThemeProvider>
  );
}
