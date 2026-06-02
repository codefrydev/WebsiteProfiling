import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      sp.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        sp.append(key, v);
      }
    }
  }
  const q = sp.toString();
  redirect(q ? `/home?${q}` : '/home');
}
