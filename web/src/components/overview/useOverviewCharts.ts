import { useMemo } from 'react';
import { strings, format } from '@/lib/strings';
import {
  filterLighthouseByHost,
  lighthouseSummaryMatchesHost,
} from '@/lib/domainSlug';
import { crawledUrlCount } from '@/lib/crawlCounts';
import { palette, sortByValue, PALETTE_CATEGORICAL } from '@/utils/chartPalette';
import type { ReportPayload } from '@/types';
import type { OverviewCharts } from './types';
import { statusDistributionFromCounts } from '@/lib/statusDistribution';
import {
  buildChartViewHrefs,
  depthTakeaway,
  dominantBucketLabel,
  lighthouseTakeaway,
  responseTimeBucketColors,
  responseTimeTakeaway,
  selectChartConcerns,
  socialTakeaway,
  statusDistributionTakeaway,
  titleMetaBucketColors,
  titleMetaTakeaway,
  wordCountBucketColors,
  wordCountTakeaway,
} from './overviewChartInsights';
import { sumObject } from './chartUtils';

const LH_CAT_ORDER = ['performance', 'accessibility', 'best-practices', 'seo'] as const;

export function useOverviewCharts(
  data: ReportPayload | null | undefined,
  expectedHost: string,
  querySuffix = '',
): OverviewCharts {
  const vo = strings.views.overview;
  const hrefs = buildChartViewHrefs(querySuffix);
  const crawledCount = crawledUrlCount(data);

  const concernCount = useMemo(() => {
    if (!data) return 0;
    return selectChartConcerns({ data, querySuffix }).length;
  }, [data, querySuffix]);

  const statusDistribution = useMemo(() => {
    const distribution = statusDistributionFromCounts(data?.status_counts);
    if (!distribution) return null;
    return {
      distribution,
      takeaway: statusDistributionTakeaway(data?.status_counts, crawledCount),
      viewHref: hrefs.links,
      viewLabel: vo.chartsViewLinks,
    };
  }, [data?.status_counts, crawledCount, hrefs.links, vo.chartsViewLinks]);

  const wordCountChart = useMemo(() => {
    const dist = data?.content_analytics?.word_count_distribution;
    if (!dist || typeof dist !== 'object') return null;
    const labels = vo.wcBuckets.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    const aria = `${vo.ariaWordCountIntro} ${labels.map((l, i) => `${values[i]} in ${l} words`).join(', ')}.`;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartPages,
            data: values,
            backgroundColor: wordCountBucketColors(labels),
            borderRadius: 4,
          },
        ],
      },
      aria,
      takeaway: wordCountTakeaway(dist, crawledCount),
      viewHref: hrefs.contentAnalytics,
      viewLabel: vo.chartsViewContentAnalytics,
    };
  }, [data?.content_analytics?.word_count_distribution, crawledCount, hrefs.contentAnalytics, vo]);

  const responseTimeChart = useMemo(() => {
    const dist = data?.response_time_stats?.distribution;
    if (!dist || typeof dist !== 'object') return null;
    const labels = vo.rtBuckets.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    const aria = `${vo.ariaResponseTimeIntro} ${labels.map((l, i) => `${values[i]} URLs ${l}`).join(', ')}.`;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartUrls,
            data: values,
            backgroundColor: responseTimeBucketColors(labels),
            borderRadius: 4,
          },
        ],
      },
      aria,
      takeaway: responseTimeTakeaway(dist),
      viewHref: hrefs.network,
      viewLabel: vo.chartsViewNetwork,
    };
  }, [data?.response_time_stats?.distribution, hrefs.network, vo]);

  const depthChart = useMemo(() => {
    const by = data?.depth_distribution?.by_depth;
    if (!by || typeof by !== 'object') return null;
    const entries = Object.entries(by)
      .map(([k, v]) => [Number(k), Number(v)] as const)
      .filter(([k]) => !Number.isNaN(k))
      .sort((a, b) => a[0] - b[0]);
    if (!entries.length) return null;
    const labels = entries.map(([k]) => format(vo.depthLabel, { n: k }));
    const values = entries.map(([, v]) => v);
    const aria = `${vo.ariaDepthIntro} ${entries.map(([d, n]) => `${n} at depth ${d}`).join(', ')}.`;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartUrls,
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[4],
            borderRadius: 4,
          },
        ],
      },
      aria,
      takeaway: depthTakeaway(by, data?.depth_distribution?.max_depth, data?.depth_distribution?.avg_depth),
      viewHref: hrefs.links,
      viewLabel: vo.chartsViewLinks,
    };
  }, [data?.depth_distribution, hrefs.links, vo]);

  const titleMetaChart = useMemo(() => {
    const seo = data?.seo_health || {};
    const hasTitle =
      seo.missing_title != null ||
      seo.title_short != null ||
      seo.title_long != null ||
      seo.title_ok != null;
    const hasMeta =
      seo.missing_meta_desc != null ||
      seo.meta_desc_short != null ||
      seo.meta_desc_long != null ||
      seo.meta_desc_ok != null;
    if (!hasTitle && !hasMeta) return null;
    const labels = [...vo.titleMetaLabels];
    const metaColors = titleMetaBucketColors();
    const titleData = hasTitle
      ? [
          Number(seo.missing_title || 0),
          Number(seo.title_short || 0),
          Number(seo.title_long || 0),
          Number(seo.title_ok || 0),
        ]
      : null;
    const metaData = hasMeta
      ? [
          Number(seo.missing_meta_desc || 0),
          Number(seo.meta_desc_short || 0),
          Number(seo.meta_desc_long || 0),
          Number(seo.meta_desc_ok || 0),
        ]
      : null;
    const datasets = [];
    if (titleData) {
      datasets.push({
        label: vo.chartTitleTags,
        data: titleData,
        backgroundColor: metaColors,
        borderRadius: 4,
      });
    }
    if (metaData) {
      datasets.push({
        label: vo.chartMetaDesc,
        data: metaData,
        backgroundColor: metaColors,
        borderRadius: 4,
      });
    }
    const total = [...(titleData || []), ...(metaData || [])].reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    return {
      data: { labels, datasets },
      aria: vo.groupedTitleMetaAria,
      takeaway: titleMetaTakeaway(seo, crawledCount),
      viewHref: hrefs.content,
      viewLabel: vo.chartsViewContent,
    };
  }, [data?.seo_health, crawledCount, hrefs.content, vo]);

  const socialStats = useMemo(() => {
    const social = data?.social_coverage || {};
    const og = social.og_coverage_pct;
    const tw = social.twitter_coverage_pct;
    const img = social.og_image_coverage_pct;
    if (og == null && tw == null && img == null) return null;
    const parts: string[] = [];
    if (og != null) parts.push(`${vo.socialLabelsOg} ${Number(og)}%`);
    if (tw != null) parts.push(`${vo.socialLabelsTwitter} ${Number(tw)}%`);
    if (img != null) parts.push(`${vo.socialLabelsOgImage} ${Number(img)}%`);
    if (!parts.length) return null;
    return {
      og: og != null ? Number(og) : null,
      twitter: tw != null ? Number(tw) : null,
      ogImage: img != null ? Number(img) : null,
      aria: `${vo.ariaSocialIntro} ${parts.join(', ')}.`,
      takeaway: socialTakeaway(social),
      viewHref: hrefs.content,
      viewLabel: vo.chartsViewContent,
    };
  }, [data?.social_coverage, hrefs.content, vo]);

  const readingLevelChart = useMemo(() => {
    const dist = data?.content_analytics?.reading_level_distribution;
    if (!dist || typeof dist !== 'object') return null;
    const labels = vo.rlBuckets.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    const dominant = dominantBucketLabel(labels, values);
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartPages,
            data: values,
            backgroundColor: palette(labels.length),
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaReadingIntro} ${labels.map((l, i) => `${values[i]} ${l}`).join(', ')}.`,
      takeaway: dominant
        ? format(vo.chartsTakeawayReadingDominant, {
            bucket: dominant.label,
            count: dominant.count.toLocaleString(),
            pct: dominant.pct,
          })
        : undefined,
      viewHref: hrefs.contentAnalytics,
      viewLabel: vo.chartsViewContentAnalytics,
    };
  }, [data?.content_analytics?.reading_level_distribution, hrefs.contentAnalytics, vo]);

  const mimeChart = useMemo(() => {
    let labels = data?.mime_labels || [];
    let values = (data?.mime_values || []).map(Number);
    if (!labels.length) return null;
    const sorted = sortByValue(labels, values, 'desc');
    labels = sorted.labels.slice(0, 8);
    values = sorted.values.slice(0, 8);
    if (!values.some((v: number) => v > 0)) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartUrls,
            data: values,
            backgroundColor: palette(labels.length),
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaMimeIntro} ${labels.map((l, i) => `${values[i]} ${l}`).join(', ')}.`,
      takeaway: format(vo.chartsTakeawayMimeTop, {
        mime: labels[0],
        count: values[0].toLocaleString(),
      }),
      viewHref: hrefs.links,
      viewLabel: vo.chartsViewLinks,
    };
  }, [data?.mime_labels, data?.mime_values, hrefs.links, vo]);

  const outlinksChart = useMemo(() => {
    const labels = data?.outlink_labels || [];
    const values = (data?.outlink_counts || []).map(Number);
    if (!labels.length || !values.some((v) => v > 0)) return null;
    const dominant = dominantBucketLabel(labels, values);
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartUrls,
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[1],
            borderRadius: 4,
          },
        ],
      },
      aria: vo.ariaOutlinks,
      takeaway: dominant
        ? format(vo.chartsTakeawayOutlinksDominant, {
            bucket: dominant.label,
            count: dominant.count.toLocaleString(),
            pct: dominant.pct,
          })
        : undefined,
      viewHref: hrefs.links,
      viewLabel: vo.chartsViewLinks,
    };
  }, [data?.outlink_labels, data?.outlink_counts, hrefs.links, vo]);

  const domainsChart = useMemo(() => {
    let labels = data?.domain_labels || [];
    let values = (data?.domain_values || []).map(Number);
    if (!labels.length) return null;
    const sorted = sortByValue(labels, values, 'desc');
    labels = sorted.labels.slice(0, 10);
    values = sorted.values.slice(0, 10);
    if (!values.some((v) => v > 0)) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartUrls,
            data: values,
            backgroundColor: palette(labels.length),
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaDomainsPrefix} ${labels[0]}: ${values[0]}.`,
      horizontal: true,
      takeaway: format(vo.chartsTakeawayDomainsTop, {
        domain: labels[0],
        count: values[0].toLocaleString(),
      }),
      viewHref: hrefs.links,
      viewLabel: vo.chartsViewLinks,
    };
  }, [data?.domain_labels, data?.domain_values, hrefs.links, vo]);

  const lighthouseScores = useMemo(() => {
    let cs = null;
    const summary = data?.lighthouse_summary;
    if (lighthouseSummaryMatchesHost(summary, expectedHost)) {
      cs = summary?.category_scores;
    }
    if (!cs || typeof cs !== 'object') {
      const byUrl = filterLighthouseByHost(data?.lighthouse_by_url || {}, expectedHost);
      const first = Object.values(byUrl)[0];
      cs = (first as { category_scores?: Record<string, unknown> } | undefined)?.category_scores;
    }
    if (!cs || typeof cs !== 'object') return null;

    const scores: Record<string, number | null> = {};
    const ariaParts: string[] = [];
    LH_CAT_ORDER.forEach((id) => {
      const v = (cs as Record<string, unknown>)[id];
      const num = v != null ? Number(v) : null;
      scores[id] = num;
      if (num != null) {
        const label = vo.lighthouseCategoryLabels[id as keyof typeof vo.lighthouseCategoryLabels] || id;
        ariaParts.push(`${label} ${num}`);
      }
    });
    if (ariaParts.length === 0) return null;
    return {
      scores,
      aria: `${vo.ariaLighthouseIntro} ${ariaParts.join(', ')}.`,
      takeaway: lighthouseTakeaway(scores),
      viewHref: hrefs.lighthouse,
      viewLabel: vo.chartsViewLighthouse,
    };
  }, [data?.lighthouse_summary, data?.lighthouse_by_url, expectedHost, hrefs.lighthouse, vo]);

  const chartCount = useMemo(() => {
    let n = 0;
    if (statusDistribution) n++;
    if (wordCountChart) n++;
    if (responseTimeChart) n++;
    if (depthChart) n++;
    if (titleMetaChart) n++;
    if (socialStats) n++;
    if (readingLevelChart) n++;
    if (mimeChart) n++;
    if (outlinksChart) n++;
    if (domainsChart) n++;
    if (lighthouseScores) n++;
    return n;
  }, [
    statusDistribution,
    wordCountChart,
    responseTimeChart,
    depthChart,
    titleMetaChart,
    socialStats,
    readingLevelChart,
    mimeChart,
    outlinksChart,
    domainsChart,
    lighthouseScores,
  ]);

  const hasInsightCharts = Boolean(
    statusDistribution ||
      wordCountChart ||
      responseTimeChart ||
      depthChart ||
      titleMetaChart ||
      socialStats ||
      readingLevelChart ||
      mimeChart ||
      outlinksChart ||
      domainsChart ||
      lighthouseScores,
  );

  return {
    statusDistribution,
    wordCountChart,
    responseTimeChart,
    depthChart,
    titleMetaChart,
    socialStats,
    readingLevelChart,
    mimeChart,
    outlinksChart,
    domainsChart,
    lighthouseScores,
    chartCount,
    concernCount,
    hasInsightCharts,
  };
}
