import { useContext } from 'react';
import { BrandingContext } from './BrandingContext';

export function useBranding() {
  return useContext(BrandingContext);
}
