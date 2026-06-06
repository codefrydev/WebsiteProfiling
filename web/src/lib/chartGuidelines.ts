/**
 * Chart selection guidelines (task → visualization).
 * Grounded in NN/G, USWDS, and perception research — see chart UX plan.
 */
export const CHART_GUIDELINES = {
  /** Part-of-whole with at most this many non-zero slices → doughnut. */
  DOUGHNUT_MAX_SLICES: 6,
  /** Ranked lists and long category labels → horizontal bar. */
  RANKED_LIST: 'horizontal-bar',
  /** Ordered histogram buckets (word count bands, depth) → vertical bar. */
  ORDERED_HISTOGRAM: 'vertical-bar',
  /** Time series → line. */
  TIME_SERIES: 'line',
  /** Two continuous variables / outliers → scatter. */
  CORRELATION: 'scatter',
  /** Scores 0–100 (Lighthouse categories) → ring/gauge, not count bar. */
  SCORE_0_100: 'score-ring',
  /** Two-part ratio (text/HTML, present/missing) → progress bar. */
  TWO_PART_RATIO: 'ratio-bar',
  /** Single metric → StatCard / badge (no chart). */
  SINGLE_VALUE: 'stat',
} as const;

export type ChartGuidelineKind = (typeof CHART_GUIDELINES)[keyof typeof CHART_GUIDELINES];

/** Redirects view: many distinct status codes — keep raw horizontal bar (exception). */
export const STATUS_RAW_BAR_EXCEPTION = 'redirects';
