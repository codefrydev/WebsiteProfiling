
import { useSearchParams } from 'react-router-dom';
import { useOptionalReport } from '@/context/useReport';

/** Domain slug for keyword API calls (?domain= or report context). */
export function useKeywordBrandQuery(): string | null {
  const [searchParams] = useSearchParams();
  const report = useOptionalReport();
  const fromUrl = searchParams.get('domain') ?? searchParams.get('brand');
  if (fromUrl?.trim()) return fromUrl.trim();
  return report?.domainSlug ?? null;
}
