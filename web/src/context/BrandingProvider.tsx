
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { BrandingContext, DEFAULT_BRANDING, type BrandingState } from './BrandingContext';

async function loadBrandingFromDb(): Promise<Partial<BrandingState>> {
  try {
    const res = await apiFetch(apiUrl('/ui-preferences'));
    if (!res.ok) return {};
    const data = (await res.json()) as {
      brandName?: string;
      brandSubtitle?: string;
      brandLogoUrl?: string;
    };
    const result: Partial<BrandingState> = {};
    if (data.brandName) result.productName = data.brandName;
    if (data.brandSubtitle) result.productSubtitle = data.brandSubtitle;
    if (data.brandLogoUrl) result.logoUrl = data.brandLogoUrl;
    return result;
  } catch {
    return {};
  }
}

async function saveBrandingPatch(patch: {
  brandName?: string;
  brandSubtitle?: string;
  brandLogoUrl?: string;
}): Promise<void> {
  try {
    await apiFetch(apiUrl('/ui-preferences'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch { /* ignore */ }
}

export default function BrandingProvider({ children }: { children: ReactNode }): ReactNode {
  const [branding, setBranding] = useState<BrandingState>({ ...DEFAULT_BRANDING });

  useEffect(() => {
    void loadBrandingFromDb().then((db) => {
      if (!db.productName && !db.productSubtitle && !db.logoUrl) return;
      setBranding((prev) => ({
        productName: db.productName ?? prev.productName,
        productSubtitle: db.productSubtitle ?? prev.productSubtitle,
        logoUrl: db.logoUrl ?? prev.logoUrl,
      }));
    });
  }, []);

  const setBrandName = useCallback((name: string) => {
    setBranding((prev) => ({ ...prev, productName: name || DEFAULT_BRANDING.productName }));
    void saveBrandingPatch({ brandName: name });
  }, []);

  const setBrandSubtitle = useCallback((subtitle: string) => {
    setBranding((prev) => ({ ...prev, productSubtitle: subtitle || DEFAULT_BRANDING.productSubtitle }));
    void saveBrandingPatch({ brandSubtitle: subtitle });
  }, []);

  const setLogoUrl = useCallback((url: string) => {
    setBranding((prev) => ({ ...prev, logoUrl: url }));
    void saveBrandingPatch({ brandLogoUrl: url });
  }, []);

  const value = useMemo(
    () => ({ ...branding, setBrandName, setBrandSubtitle, setLogoUrl }),
    [branding, setBrandName, setBrandSubtitle, setLogoUrl],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
