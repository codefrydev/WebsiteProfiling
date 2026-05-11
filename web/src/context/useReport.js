import { useContext } from 'react';
import { ReportContext } from './reportContext';

export function useReport() {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReport must be used within ReportProvider');
  return ctx;
}
