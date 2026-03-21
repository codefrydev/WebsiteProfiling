import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8'));

const lh = readJson('../src/_lighthouse_extract.json');
const lu = readJson('../src/_linkutils_extract.json');

const strings = {
  app: {
    loading: 'Loading report data...',
    failedTitle: 'Failed to load report',
    failedHint:
      'Run the report from the project root so report.db is copied to UI/public, then refresh. Or copy report.db to UI/public/report.db manually.',
    defaultSiteName: 'Site',
    crawlCompleted: 'Crawl completed',
    crawlCompletedSeconds: 'Crawl completed in {seconds}s',
    productSubtitle: 'Site Audit Pro',
    ariaCloseMenu: 'Close menu',
    ariaOpenMenu: 'Open menu',
    githubLinkLabel: 'codefrydev/WebsiteProfiling',
    searchPlaceholder: 'Search URLs, issues...',
  },
  nav: {
    overview: { label: 'Dashboard', section: 'Audit Overview' },
    issues: { label: 'Site Audit', section: 'Audit Overview' },
    links: { label: 'Link Explorer', section: 'Crawl Analysis' },
    redirects: { label: 'Redirects', section: 'Crawl Analysis' },
    content: { label: 'On-Page SEO', section: 'Crawl Analysis' },
    lighthouse: { label: 'Page Speed', section: 'Crawl Analysis' },
    security: { label: 'Security & Headers', section: 'Crawl Analysis' },
    'content-analytics': { label: 'Content Insights', section: 'Content & SEO' },
    'tech-stack': { label: 'Tech Detection', section: 'Content & SEO' },
    charts: { label: 'Crawl Analytics', section: 'Visualizations' },
    network: { label: 'Internal Linking', section: 'Visualizations' },
    gallery: { label: 'Gallery', section: 'Visualizations' },
  },
  reportSelector: {
    reportLabel: 'Report:',
    compareLabel: 'Compare:',
    latestOption: 'Latest',
    noneOption: 'None',
    titleReportHistory: 'Run more reports with preserve_crawl_history to see history here',
    titleLoadReport: 'Load a previous report',
    titleCompareBaseline: 'Baseline report for URL fingerprint diff (new / removed / changed pages)',
  },
  common: {
    emDash: '—',
    all: 'All',
    yes: 'Yes',
    no: 'No',
    noData: 'No data',
    notEnoughData: 'Not enough data',
    pages: 'Pages',
    urls: 'URLs',
    count: 'Count',
    frequency: 'Frequency',
    wordCount: 'Word Count',
    score: 'Score',
    percentOfPages: '% of pages',
    wcThin: 'Thin',
    wcMedium: 'Medium',
    wcLong: 'Long',
    rlElementary: 'Elementary',
    rlMiddle: 'Middle',
    rlHighSchool: 'High School',
    rlCollege: 'College+',
    other: 'Other',
    uncategorized: 'Uncategorized',
    unknown: 'Unknown',
    na: 'N/A',
    tableSwipeHint: 'Swipe sideways to see all columns.',
  },
  charts: {
    axisPages: 'Pages',
    axisUrls: 'URLs',
    axisCount: 'Count',
    axisFrequency: 'Frequency',
    axisWordCount: 'Word Count',
    axisCharacterCount: 'Character count',
    axisResponseTimeMs: 'Response Time (ms)',
    axisInlinks: 'Inlinks',
    axisScore0100: 'Score (0–100)',
    percentOfPages: '% of pages',
    coveragePercent: 'Coverage %',
    statistic: 'Statistic',
    words: 'Words',
    ratio: 'Ratio',
    timeBucket: 'Time bucket',
    depth: 'Depth',
  },
  lighthouse: {
    metricThresholds: lh.metricThresholds,
    categories: lh.categories,
    categoryLabels: lh.categoryLabels,
    impactGroups: lh.impactGroups,
    quickWins: lh.quickWins,
  },
  linkExplorer: {
    contentUrlKeys: lu.contentUrlKeys,
    contentLabels: lu.contentLabels,
    contentRecommendations: lu.contentRecommendations,
    seoIssueRecommendations: lu.seoIssueRecommendations,
  },
  views: {},
  components: {},
};

fs.writeFileSync(path.join(__dirname, '../src/strings.json'), JSON.stringify(strings, null, 2));
console.log('Wrote src/strings.json');
