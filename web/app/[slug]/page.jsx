import ReportShell from '@/ReportShell';

export const dynamic = 'force-dynamic';

export default async function SlugPage({ params }) {
  const { slug } = await params;
  return <ReportShell slug={slug} />;
}
