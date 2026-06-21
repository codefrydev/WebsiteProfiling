import { createContext } from 'react';
import { strings } from '@/lib/strings';

export interface BrandingState {
  productName: string;
  productSubtitle: string;
  logoUrl: string;
}

export interface BrandingContextValue extends BrandingState {
  setBrandName: (name: string) => void;
  setBrandSubtitle: (subtitle: string) => void;
  setLogoUrl: (url: string) => void;
}

export const DEFAULT_BRANDING: BrandingState = {
  productName: strings.app.productName,
  productSubtitle: strings.app.productSubtitle,
  logoUrl: '',
};

export const BrandingContext = createContext<BrandingContextValue>({
  ...DEFAULT_BRANDING,
  setBrandName: () => undefined,
  setBrandSubtitle: () => undefined,
  setLogoUrl: () => undefined,
});
