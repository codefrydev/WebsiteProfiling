'use client';

import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { buildChatFabHref, isChatFabVisiblePath } from '@/lib/chatUrlState';
import { strings } from '@/lib/strings';

const s = strings.components.chat;

/**
 * Floating entry to AI chat from domain-scoped report views (e.g. /dashboard?domain=…).
 */
export default function ChatFab() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const domain = searchParams.get('domain') ?? searchParams.get('brand');

  if (!isChatFabVisiblePath(pathname)) {
    return null;
  }

  const href = buildChatFabHref(domain);

  return (
    <Link
      href={href}
      className="print:hidden fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
      aria-label={s.fabAria}
      title={s.fabTitle}
    >
      <MessageSquare className="h-7 w-7" aria-hidden />
    </Link>
  );
}
