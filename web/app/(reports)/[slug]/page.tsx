import ReportShell from '@/ReportShell';
import { pathSlugToViewId } from '@/routes';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

export const dynamic = 'force-dynamic';

export default async function SlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactElement> {
  const { slug } = await params;
  if (!pathSlugToViewId(slug)) {
    notFound();
  }
  return <ReportShell slug={slug} />;
}
