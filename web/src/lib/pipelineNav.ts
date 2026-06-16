import type { PipelineSettingsGroupId } from '@/components/pipeline/pipelineSettingsGroups';

export type PipelineNavId = 'run' | PipelineSettingsGroupId;

export function pipelineNavFromSearchParams(searchParams: URLSearchParams): PipelineNavId {
  const group = searchParams.get('group');
  if (
    group === 'crawl-report' ||
    group === 'lighthouse' ||
    group === 'keywords' ||
    group === 'google' ||
    group === 'content-ai' ||
    group === 'advanced'
  ) {
    return group;
  }
  if (searchParams.get('tab') === 'settings') {
    return 'crawl-report';
  }
  return 'run';
}

export function pipelineHrefForNav(
  nav: PipelineNavId,
  existingParams?: URLSearchParams,
): string {
  const params = new URLSearchParams(existingParams?.toString() ?? '');
  params.delete('tab');
  if (nav === 'run') {
    params.delete('group');
  } else {
    params.set('group', nav);
  }
  const preset = params.get('preset');
  if (preset) params.set('preset', preset);
  const q = params.toString();
  return q ? `/pipeline?${q}` : '/pipeline';
}
