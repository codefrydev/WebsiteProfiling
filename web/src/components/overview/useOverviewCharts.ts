import { useMemo } from 'react';
import { strings, format } from '@/lib/strings';
import {
  filterLighthouseByHost,
  lighthouseSummaryMatchesHost,
} from '@/lib/domainSlug';
import { palette, scoreBandColor, sortByValue, PALETTE_CATEGORICAL } from '@/utils/chartPalette';
import type { ReportPayload } from '@/types';
import type { OverviewCharts } from './types';
import { sumObject } from './chartUtils';

const LH_CAT_ORDER = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'];

export function useOverviewCharts(
  data: ReportPayload | null | undefined,
  expectedHost: string,
): OverviewCharts {
  const vo = strings.views.overview;

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
            backgroundColor: PALETTE_CATEGORICAL[0],
            borderRadius: 4,
          },
        ],
      },
      aria,
    };
  }, [data?.content_analytics?.word_count_distribution, vo]);

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
            backgroundColor: PALETTE_CATEGORICAL[5],
            borderRadius: 4,
          },
        ],
      },
      aria,
    };
  }, [data?.response_time_stats?.distribution, vo]);

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
    };
  }, [data?.depth_distribution?.by_depth, vo]);

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
        backgroundColor: PALETTE_CATEGORICAL[0],
        borderRadius: 4,
      });
    }
    if (metaData) {
      datasets.push({
        label: vo.chartMetaDesc,
        data: metaData,
        backgroundColor: PALETTE_CATEGORICAL[1],
        borderRadius: 4,
      });
    }
    const total = [...(titleData || []), ...(metaData || [])].reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    return {
      data: { labels, datasets },
      aria: vo.groupedTitleMetaAria,
    };
  }, [data?.seo_health, vo]);

  const socialChart = useMemo(() => {
    const social = data?.social_coverage || {};
    const og = social.og_coverage_pct;
    const tw = social.twitter_coverage_pct;
    const img = social.og_image_coverage_pct;
    if (og == null && tw == null && img == null) return null;
    const labels: string[] = [];
    const values: number[] = [];
    if (og != null) {
      labels.push(vo.socialLabelsOg);
      values.push(Number(og));
    }
    if (tw != null) {
      labels.push(vo.socialLabelsTwitter);
      values.push(Number(tw));
    }
    if (img != null) {
      labels.push(vo.socialLabelsOgImage);
      values.push(Number(img));
    }
    if (!labels.length) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartCoverage,
            data: values,
            backgroundColor: [PALETTE_CATEGORICAL[0], PALETTE_CATEGORICAL[2], PALETTE_CATEGORICAL[3]],
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaSocialIntro} ${labels.map((l, i) => `${l} ${values[i]}%`).join(', ')}.`,
    };
  }, [data?.social_coverage, vo]);

  const readingLevelChart = useMemo(() => {
    const dist = data?.content_analytics?.reading_level_distribution;
    if (!dist || typeof dist !== 'object') return null;
    const labels = vo.rlBuckets.filter((k) => k in dist);
    const values = labels.map((k) => Number(dist[k] || 0));
    if (!labels.length || sumObject(dist) === 0) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartPages,
            data: values,
            backgroundColor: PALETTE_CATEGORICAL[6],
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaReadingIntro} ${labels.map((l, i) => `${values[i]} ${l}`).join(', ')}.`,
    };
  }, [data?.content_analytics?.reading_level_distribution, vo]);

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
    };
  }, [data?.mime_labels, data?.mime_values, vo]);

  const lighthouseChart = useMemo(() => {
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
    const labels: string[] = [];
    const values: number[] = [];
    const colors: string[] = [];
    LH_CAT_ORDER.forEach((id) => {
      const v = (cs as Record<string, unknown>)[id];
      if (v == null) return;
      labels.push(vo.lighthouseCategoryLabels[id as keyof typeof vo.lighthouseCategoryLabels] || id);
      values.push(Number(v));
      colors.push(scoreBandColor(Number(v)));
    });
    if (!labels.length) return null;
    return {
      data: {
        labels,
        datasets: [
          {
            label: vo.chartLighthouse,
            data: values,
            backgroundColor: colors,
            borderRadius: 4,
          },
        ],
      },
      aria: `${vo.ariaLighthouseIntro} ${labels.map((l, i) => `${l} ${values[i]}`).join(', ')}.`,
    };
  }, [data?.lighthouse_summary, data?.lighthouse_by_url, expectedHost, vo]);

  const chartCount = useMemo(() => {
    let n = 0;
    if (wordCountChart) n++;
    if (responseTimeChart) n++;
    if (depthChart) n++;
    if (titleMetaChart) n++;
    if (socialChart) n++;
    if (readingLevelChart) n++;
    if (mimeChart) n++;
    if (lighthouseChart) n++;
    return n;
  }, [wordCountChart, responseTimeChart, depthChart, titleMetaChart, socialChart, readingLevelChart, mimeChart, lighthouseChart]);

  const hasInsightCharts = Boolean(
    wordCountChart ||
      responseTimeChart ||
      depthChart ||
      titleMetaChart ||
      socialChart ||
      readingLevelChart ||
      mimeChart ||
      lighthouseChart,
  );

  return {
    wordCountChart,
    responseTimeChart,
    depthChart,
    titleMetaChart,
    socialChart,
    readingLevelChart,
    mimeChart,
    lighthouseChart,
    chartCount,
    hasInsightCharts,
  };
}
