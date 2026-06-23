import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from '@/views/Landing';
import ChatPage from '@/views/Chat';
import DocsHome from '@/views/DocsHome';
import McpSettings from '@/views/McpSettings';
import PagesMarkdown from '@/views/PagesMarkdown';
import Pipeline from '@/views/Pipeline';
import RiskSettings from '@/views/RiskSettings';
import Secrets from '@/views/Secrets';
import Settings from '@/views/Settings';
import WriteStudio from '@/views/WriteStudio';
import ReportLayout from '@/layouts/ReportLayout';
import ReportSlugPage from '@/pages/ReportSlugPage';
import ReportsNotFoundPage from '@/pages/ReportsNotFoundPage';
import NotFoundPage from '@/pages/NotFoundPage';
import DocsIntegrationRoutePage from '@/pages/DocsIntegrationRoutePage';
import { strings } from '@/lib/strings';
import { usePageTitle } from '@/hooks/usePageTitle';

function LandingRoute() {
  usePageTitle(strings.views.landing.metaTitle);
  return <LandingPage />;
}

function ChatRoute() {
  return (
    <Suspense fallback={null}>
      <ChatPage />
    </Suspense>
  );
}

function RiskSettingsRoute() {
  usePageTitle('Risk Settings · Site Audit');
  return <RiskSettings />;
}

function DocsRoute() {
  usePageTitle('Docs · Site Audit');
  return <DocsHome />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/chat" element={<ChatRoute />} />
      <Route path="/write" element={<WriteStudio />} />
      <Route path="/pipeline" element={<Pipeline />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/secrets" element={<Secrets />} />
      <Route path="/mcp" element={<McpSettings />} />
      <Route path="/pages-md" element={<PagesMarkdown />} />
      <Route path="/risk-settings" element={<RiskSettingsRoute />} />
      <Route path="/docs" element={<DocsRoute />} />
      <Route path="/docs/integrations/:slug" element={<DocsIntegrationRoutePage />} />

      <Route path="/keywords-explorer" element={<Navigate to="/keywords" replace />} />
      <Route path="/overview" element={<Navigate to="/dashboard" replace />} />
      <Route path="/charts" element={<Navigate to="/dashboard?tab=charts" replace />} />
      <Route path="/content-studio" element={<Navigate to="/write" replace />} />

      <Route path="/404" element={<ReportsNotFoundPage />} />

      <Route element={<ReportLayout />}>
        <Route path="/:slug" element={<ReportSlugPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
