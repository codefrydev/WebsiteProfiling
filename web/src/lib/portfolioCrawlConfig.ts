import { format, strings } from '@/lib/strings';
import type { PortfolioCrawlConfig } from '@/types/report';

const vh = strings.views.home;

export function formatRenderModeLabel(mode: string | undefined | null): string | null {
  const normalized = String(mode ?? 'static').trim().toLowerCase();
  if (normalized === 'javascript') return vh.renderModeJavascript;
  if (normalized === 'auto') return vh.renderModeAuto;
  if (normalized === 'static') return vh.renderModeStatic;
  return null;
}

export function formatDiscoveryModeLabel(mode: string | undefined | null): string | null {
  const normalized = String(mode ?? 'spider').trim().toLowerCase();
  if (normalized === 'spider') return vh.discoveryModeSpider;
  if (normalized === 'sitemap') return vh.discoveryModeSitemap;
  if (normalized === 'list') return vh.discoveryModeList;
  if (normalized === 'hybrid') return vh.discoveryModeHybrid;
  return null;
}

export function formatPortfolioCrawlSummary(config: PortfolioCrawlConfig | null | undefined): string[] {
  if (!config) return [];

  const segments: string[] = [];
  const render = formatRenderModeLabel(config.render_mode);
  if (render) segments.push(render);

  const discovery = formatDiscoveryModeLabel(config.discovery_mode);
  if (discovery) segments.push(discovery);

  const pages = config.pages_crawled;
  const max = config.max_pages_configured;
  if (pages != null && pages > 0) {
    if (max != null && max > 0) {
      segments.push(
        format(vh.crawlLimitLine, {
          pages: pages.toLocaleString(),
          max: max.toLocaleString(),
          limitedSuffix: config.crawl_limited ? vh.crawlLimitReachedSuffix : '',
        }),
      );
    } else {
      segments.push(format(vh.crawlPagesLine, { pages: pages.toLocaleString() }));
    }
  }

  const renderMode = String(config.render_mode ?? '').trim().toLowerCase();
  if (
    renderMode === 'auto' &&
    config.pages_static != null &&
    config.pages_rendered != null &&
    (config.pages_static > 0 || config.pages_rendered > 0)
  ) {
    segments.push(
      format(strings.views.overview.crawlScope.fetchMethodMixLine, {
        staticCount: config.pages_static.toLocaleString(),
        renderedCount: config.pages_rendered.toLocaleString(),
      }),
    );
  }

  return segments;
}

export function hasPortfolioCrawlConfig(config: PortfolioCrawlConfig | null | undefined): boolean {
  return formatPortfolioCrawlSummary(config).length > 0;
}
