'use client';

import type { LinkDetail } from '@/types/report';

interface SerpPreviewProps {
  link: LinkDetail;
  domain?: string;
}

export default function SerpPreview({ link, domain }: SerpPreviewProps) {
  const title = (link.title || 'Missing title').slice(0, 60);
  const desc = (link.meta_description || 'Missing meta description').slice(0, 160);
  const url = link.canonical_url || link.url;
  let displayUrl = url;
  try {
    const u = new URL(url);
    displayUrl = domain || `${u.hostname}${u.pathname}`.slice(0, 80);
  } catch {
    displayUrl = url.slice(0, 80);
  }

  return (
    <div className="rounded-xl border border-default bg-white dark:bg-brand-950 p-4 max-w-xl">
      <p className="text-[#1a0dab] dark:text-blue-400 text-lg leading-snug hover:underline cursor-default truncate">
        {title}
      </p>
      <p className="text-sm text-[#006621] dark:text-emerald-500 truncate mt-0.5">{displayUrl}</p>
      <p className="text-sm text-[#4d5156] dark:text-muted-foreground mt-1 line-clamp-2">{desc}</p>
    </div>
  );
}
