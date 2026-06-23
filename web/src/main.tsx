import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/dm-sans/index.css';
import './globals.css';
import ChunkLoadRecovery from './ChunkLoadRecovery';
import ClientProviders from './ClientProviders';
import AppRoutes from './AppRoutes';
import { getPublicBasePath } from './lib/publicBase';

const basename = getPublicBasePath() || undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <ChunkLoadRecovery />
      <ClientProviders>
        <AppRoutes />
      </ClientProviders>
    </BrowserRouter>
  </StrictMode>,
);
