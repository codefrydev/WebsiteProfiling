import { apiUrl } from '@/lib/publicBase';
import type { PipelineConfigState } from '@/types/api';

export interface BrowserCrawlStatus {
  ok: boolean;
  message?: string;
}

export function crawlRenderModeUsesBrowser(state: PipelineConfigState): boolean {
  const mode = String(state.crawl_render_mode ?? 'static').trim().toLowerCase();
  return mode === 'javascript' || mode === 'auto';
}

export async function fetchBrowserCrawlStatus(): Promise<BrowserCrawlStatus> {
  try {
    const res = await fetch(apiUrl('/crawl/browser-status'));
    const data = (await res.json().catch(() => ({}))) as BrowserCrawlStatus & { error?: string };
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message ||
          data.error ||
          'JavaScript crawl requires Playwright and Chromium on this machine.',
      };
    }
    return { ok: Boolean(data.ok), message: data.message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Could not check browser availability: ${message}`,
    };
  }
}
