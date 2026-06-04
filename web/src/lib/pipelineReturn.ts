const RETURN_KEY = 'pipeline-return';

export function storePipelineReturnPath(path: string): void {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* private browsing */
  }
}

export function readPipelineReturnPath(): string {
  try {
    return sessionStorage.getItem(RETURN_KEY) || '/home';
  } catch {
    return '/home';
  }
}

export function currentPathForReturn(): string {
  if (typeof window === 'undefined') return '/home';
  return window.location.pathname + window.location.search;
}

/** Build `/pipeline` href with optional settings group and preset query params. */
export function buildPipelineHref(opts?: {
  tab?: 'run' | 'settings';
  group?: string;
  preset?: string;
}): string {
  const params = new URLSearchParams();
  if (opts?.group) {
    params.set('group', opts.group);
  } else if (opts?.tab === 'settings') {
    params.set('group', 'crawl-report');
  }
  if (opts?.preset) params.set('preset', opts.preset);
  const q = params.toString();
  return q ? `/pipeline?${q}` : '/pipeline';
}

export function goToPipeline(
  navigate: (href: string) => void,
  opts?: { tab?: 'run' | 'settings'; preset?: string },
): void {
  storePipelineReturnPath(currentPathForReturn());
  navigate(buildPipelineHref(opts));
}
