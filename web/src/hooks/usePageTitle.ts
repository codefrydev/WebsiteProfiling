import { useEffect } from 'react';

/** Set document.title (replaces Next.js generateMetadata for SPA routes). */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
