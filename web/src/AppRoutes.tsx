import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from '@/views/Landing';
import ChatPage from '@/views/Chat';
import ContentPipeline from '@/views/ContentPipeline';
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
  usePageTitle('AI Chat · Site Audit');
  return (
    <Suspense fallback={null}>
      <ChatPage />
    </Suspense>
  );
}

function WriteRoute() {
  usePageTitle('Write Studio · Site Audit');
  return <WriteStudio />;
}

function PipelineRoute() {
  usePageTitle('Run Audit · Site Audit');
  return <Pipeline />;
}

function SettingsRoute() {
  usePageTitle('Settings · Site Audit');
  return <Settings />;
}

function SecretsRoute() {
  usePageTitle('API Keys & Secrets · Site Audit');
  return <Secrets />;
}

function McpRoute() {
  usePageTitle('MCP Tools · Site Audit');
  return <McpSettings />;
}

function PagesMarkdownRoute() {
  usePageTitle('Pages Markdown · Site Audit');
  return <PagesMarkdown />;
}

function ContentPipelineRoute() {
  usePageTitle('Content Pipeline · Site Audit');
  return <ContentPipeline />;
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
      <Route path="/write" element={<WriteRoute />} />
      <Route path="/pipeline" element={<PipelineRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="/secrets" element={<SecretsRoute />} />
      <Route path="/mcp" element={<McpRoute />} />
      <Route path="/pages-md" element={<PagesMarkdownRoute />} />
      <Route path="/content-pipeline" element={<ContentPipelineRoute />} />
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
