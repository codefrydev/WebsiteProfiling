import type { Metadata } from 'next';
import LandingPage from '@/views/Landing';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

export const metadata: Metadata = {
  title: vl.metaTitle,
  description: vl.metaDescription,
};

export const dynamic = 'force-dynamic';

export default function RootPage() {
  return <LandingPage />;
}
