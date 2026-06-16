import type { Dispatch, SetStateAction } from 'react';
import type {
  CrawlRunRow,
  ReportFingerprintDiff,
  ReportListRow,
  ReportPayload,
} from '@/types/report';
import type { ReportCompareSummary } from '@/lib/reportCompare';
import type { SectionKey } from '@/lib/reportSections';

export interface ReportContextValue {
  data: ReportPayload | null;
  loading: boolean;
  /** True after the first `/meta` fetch completes (success or failure). */
  metaLoaded: boolean;
  error: string | null;
  reportList: ReportListRow[];
  selectedReportId: number | null;
  setSelectedReportId: (id: number | null) => void;
  compareReportId: number | null;
  setCompareReportId: Dispatch<SetStateAction<number | null>>;
  /** Full baseline payload; loaded only on views that need row-level compare data. */
  compareData: ReportPayload | null;
  compareDataLoading: boolean;
  reportDiff: ReportFingerprintDiff | null;
  reportCompare: ReportCompareSummary | null;
  compareSummaryLoading: boolean;
  loadReport: () => Promise<void>;
  refreshReports: () => Promise<void>;
  loadCrawlPreview: (crawlRunId: number | null) => Promise<boolean>;
  crawlRuns: CrawlRunRow[];
  startUrlByRunId: Map<number, string>;
  /** From ?domain= query when viewing a single-brand portfolio. */
  domainSlug: string | null;
  /** Per-section loading status. Undefined means the section hasn't been requested yet. */
  sectionStatus: Partial<Record<SectionKey, 'loading' | 'loaded' | 'error'>>;
  /** Trigger loading of a specific section. Idempotent — skips if already loading or loaded. */
  loadSection: (section: SectionKey, reportId: number | null) => Promise<void>;
}
