'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/publicBase';
import { BrandingContext, DEFAULT_BRANDING, type BrandingState } from './BrandingContext';

const BRAND_NAME_KEY = 'brand_name';
const BRAND_SUBTITLE_KEY = 'brand_subtitle';
const BRAND_LOGO_KEY = 'brand_logo_url';

async function loadBrandingFromDb(): Promise<Partial<BrandingState>> {
  try {
    const [nameRes, subtitleRes, logoRes] = await Promise.all([
      apiFetch(apiUrl(`/app-settings?key=${BRAND_NAME_KEY}`)),
      apiFetch(apiUrl(`/app-settings?key=${BRAND_SUBTITLE_KEY}`)),
      apiFetch(apiUrl(`/app-settings?key=${BRAND_LOGO_KEY}`)),
    ]);
    const [nameData, subtitleData, logoData] = await Promise.all([
      nameRes.ok ? (nameRes.json() as Promise<{ value: string | null }>) : Promise.resolve({ value: null }),
      subtitleRes.ok ? (subtitleRes.json() as Promise<{ value: string | null }>) : Promise.resolve({ value: null }),
      logoRes.ok ? (logoRes.json() as Promise<{ value: string | null }>) : Promise.resolve({ value: null }),
    ]);
    const result: Partial<BrandingState> = {};
    if (nameData.value) result.productName = nameData.value;
    if (subtitleData.value) result.productSubtitle = subtitleData.value;
    if (logoData.value) result.logoUrl = logoData.value;
    return result;
  } catch {
    return {};
  }
}

async function saveBrandKey(key: string, value: string): Promise<void> {
  try {
    await apiFetch(apiUrl('/app-settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
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
    void saveBrandKey(BRAND_NAME_KEY, name);
  }, []);

  const setBrandSubtitle = useCallback((subtitle: string) => {
    setBranding((prev) => ({ ...prev, productSubtitle: subtitle || DEFAULT_BRANDING.productSubtitle }));
    void saveBrandKey(BRAND_SUBTITLE_KEY, subtitle);
  }, []);

  const setLogoUrl = useCallback((url: string) => {
    setBranding((prev) => ({ ...prev, logoUrl: url }));
    void saveBrandKey(BRAND_LOGO_KEY, url);
  }, []);

  const value = useMemo(
    () => ({ ...branding, setBrandName, setBrandSubtitle, setLogoUrl }),
    [branding, setBrandName, setBrandSubtitle, setLogoUrl],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
