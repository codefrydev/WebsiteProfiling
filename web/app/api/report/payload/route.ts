import { NextResponse, type NextRequest } from 'next/server';
import { withReportDb } from '@/server/reportDb';
import { readReportPayloadFromDatabase, readReportSectionFromDatabase } from '@/lib/loadReportDb';
import { SECTION_KEYS, type SectionKey } from '@/lib/reportSections';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const raw = request.nextUrl.searchParams.get('reportId');
  const reportId = raw != null && raw !== '' ? Number(raw) : null;
  const domain = request.nextUrl.searchParams.get('domain');
  const sectionParam = request.nextUrl.searchParams.get('section');

  if (raw != null && raw !== '' && !Number.isFinite(reportId)) {
    return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 });
  }

  if (sectionParam != null && !(SECTION_KEYS as ReadonlyArray<string>).includes(sectionParam)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  }

  try {
    if (sectionParam != null) {
      const section = sectionParam as SectionKey;
      const payload = await withReportDb((db) =>
        readReportSectionFromDatabase(db, section, reportId, domain),
      );
      return NextResponse.json({ payload, section });
    }

    const payload = await withReportDb((db) =>
      readReportPayloadFromDatabase(db, reportId, domain),
    );
    return NextResponse.json({ payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'Report not found' ? 404 : msg.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
};
