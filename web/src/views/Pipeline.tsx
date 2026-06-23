
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { IntegrationToast } from '@/types/api';
import ChatShell from '@/components/chat/ChatShell';
import PageLayout from '@/components/PageLayout';
import PipelineContextBar from '@/components/pipeline/PipelineContextBar';
import PipelineRunPanel from '@/components/pipeline/PipelineRunPanel';
import PipelineSettingsPanel, { PipelineSettingsSaveBar } from '@/components/pipeline/PipelineSettingsPanel';
import PipelineSidebar from '@/components/pipeline/PipelineSidebar';
import { PipelineStatusBadge, PipelineStopButton } from '@/components/pipeline/pipelineUi';
import { isPipelinePresetId } from '@/components/pipeline/pipelinePresets';
import { usePipeline } from '@/context/PipelineContext';
import { useReadOnlySession } from '@/hooks/useReadOnlySession';
import { OPEN_INTEGRATIONS } from '@/lib/pipelineJobEvents';
import {
  pipelineHrefForNav,
  pipelineNavFromSearchParams,
  type PipelineNavId,
} from '@/lib/pipelineNav';

export default function PipelinePage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const activeNav = pipelineNavFromSearchParams(searchParams);
  const { busy, status, stopping, handlePresetChange, cancelJob } = usePipeline();
  const { readOnly } = useReadOnlySession();
  const [googleIntegrationsToast, setGoogleIntegrationsToast] = useState<IntegrationToast | null>(
    null,
  );

  const presetParam = searchParams.get('preset');
  useEffect(() => {
    if (presetParam && isPipelinePresetId(presetParam)) {
      handlePresetChange(presetParam);
    }
  }, [presetParam, handlePresetChange]);

  useEffect(() => {
    const onOpenIntegrations = () => {
      navigate(pipelineHrefForNav('google', searchParams), { replace: true });
    };
    window.addEventListener(OPEN_INTEGRATIONS, onOpenIntegrations);
    return () => window.removeEventListener(OPEN_INTEGRATIONS, onOpenIntegrations);
  }, [navigate, searchParams]);

  useEffect(() => {
    const intParam = searchParams.get('integrations');
    const authParam = searchParams.get('auth');
    const reasonParam = searchParams.get('reason');
    if (intParam !== 'open') return;

    if (activeNav !== 'google') {
      navigate(pipelineHrefForNav('google', searchParams), { replace: true });
    }

    if (authParam === 'success') {
      setGoogleIntegrationsToast({
        type: 'success',
        message: 'Google account connected successfully.',
      });
    } else if (authParam === 'error') {
      setGoogleIntegrationsToast({
        type: 'error',
        message: reasonParam ? decodeURIComponent(reasonParam) : 'Google connection failed.',
      });
    }

    const next = new URLSearchParams(searchParams.toString());
    next.delete('integrations');
    next.delete('auth');
    next.delete('reason');
    if (!next.get('group')) {
      next.set('group', 'google');
    }
    const q = next.toString();
    navigate(q ? `${pathname}?${q}` : pathname, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setNav = (nav: PipelineNavId) => {
    navigate(pipelineHrefForNav(nav, searchParams), { replace: true });
  };

  const headerExtra =
    busy || status ? (
      <div className="flex items-center gap-2">
        <PipelineStatusBadge status={status} busy={busy} />
        {busy ? (
          <PipelineStopButton
            onClick={cancelJob}
            stopping={stopping}
            disabled={readOnly}
            className="py-1.5"
          />
        ) : null}
      </div>
    ) : null;

  return (
    <ChatShell
      sidebar={(layout) => (
        <PipelineSidebar {...layout} activeNav={activeNav} onNavChange={setNav} />
      )}
    >
      <div className="chat-main-panel">
        <PipelineContextBar activeNav={activeNav} headerExtra={headerExtra} />

        <div className="chat-messages-scroll min-h-0 flex-1">
          <PageLayout maxWidth className={activeNav === 'run' ? 'pb-8' : 'pb-6'}>
            {activeNav === 'run' ? (
              <PipelineRunPanel />
            ) : (
              <PipelineSettingsPanel
                activeGroup={activeNav}
                googleIntegrationsToast={googleIntegrationsToast}
              />
            )}
          </PageLayout>
        </div>

        {activeNav !== 'run' ? (
          <footer className="chat-composer-dock shrink-0">
            <PipelineSettingsSaveBar />
          </footer>
        ) : null}
      </div>
    </ChatShell>
  );
}
