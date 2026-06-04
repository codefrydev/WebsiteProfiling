import type { PoolClient } from 'pg';
import { withDb } from '@/server/db';
import {
  getCrawlRunsRows,
  listReportsFromDatabase,
  readReportPayloadFromDatabase,
  readCrawlPreviewPayload,
} from '@/lib/loadReportDb';
import type { ReportMetaResponse, ReportPayload } from '@/types/report';

export async function getReportMeta(): Promise<ReportMetaResponse> {
  return withDb(async (client: PoolClient) => ({
    reports: await listReportsFromDatabase(client),
    crawlRuns: await getCrawlRunsRows(client),
  }));
}

export async function getReportPayload(reportId: number): Promise<ReportPayload> {
  return withDb((client: PoolClient) => readReportPayloadFromDatabase(client, reportId));
}

export async function getCrawlPreviewPayload(crawlRunId: number): Promise<ReportPayload> {
  return withDb((client: PoolClient) => readCrawlPreviewPayload(client, crawlRunId));
}

export async function withReportDb<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withDb(fn);
}
