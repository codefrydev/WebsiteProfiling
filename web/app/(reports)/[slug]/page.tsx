import ReportShell from '@/ReportShell';
import { pathSlugToViewId } from '@/routes';
import { strings } from '@/lib/strings';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const viewId = pathSlugToViewId(slug);
  if (!viewId) {
    return { title: 'Not found' };
  }
  const navEntry = strings.nav[viewId as keyof typeof strings.nav];
  const label =
    navEntry && typeof navEntry === 'object' && 'label' in navEntry
      ? String(navEntry.label)
      : 'Report';
  return { title: `${label} · Site Audit` };
}

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
