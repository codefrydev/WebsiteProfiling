import { useContext } from 'react';
import { ReportContext } from './ReportContext';
import type { ReportContextValue } from './reportContextTypes';

export function useOptionalReport(): ReportContextValue | null {
  return useContext(ReportContext);
}

export function useReport(): ReportContextValue {
  const ctx = useOptionalReport();
  if (!ctx) throw new Error('useReport must be used within ReportProvider');
  return ctx;
}
