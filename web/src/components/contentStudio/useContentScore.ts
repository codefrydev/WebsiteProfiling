'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/publicBase';
import type { ContentScoreResult } from '@/types/contentStudio';

export interface UseContentScoreInput {
  propertyId: number;
  keyword: string;
  bodyHtml: string;
  titleTag: string;
  metaDescription: string;
  landingUrl?: string | null;
  debounceMs?: number;
  enabled?: boolean;
}

export function useContentScore({
  propertyId,
  keyword,
  bodyHtml,
  titleTag,
  metaDescription,
  landingUrl,
  debounceMs = 500,
  enabled = true,
}: UseContentScoreInput) {
  const [score, setScore] = useState<ContentScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const genRef = useRef(0);

  const scoreNow = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) {
      setScore(null);
      setError(null);
      return null;
    }
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/content/score'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: propertyId > 0 ? propertyId : null,
          keyword: kw,
          bodyHtml,
          titleTag,
          metaDescription,
          landingUrl: landingUrl || null,
        }),
      });
      const payload = await res.json();
      if (gen !== genRef.current) return null;
      if (!res.ok) throw new Error(payload.error || 'Score failed');
      const result = (payload.score || null) as ContentScoreResult | null;
      setScore(result);
      return result;
    } catch (e) {
      if (gen !== genRef.current) return null;
      setError(e instanceof Error ? e.message : 'Score failed');
      return null;
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [propertyId, keyword, bodyHtml, titleTag, metaDescription, landingUrl]);

  useEffect(() => {
    if (!enabled || !keyword.trim()) {
      setScore(null);
      setError(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void scoreNow();
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [enabled, keyword, bodyHtml, titleTag, metaDescription, landingUrl, debounceMs, scoreNow]);

  return { score, loading, error, scoreNow };
}
