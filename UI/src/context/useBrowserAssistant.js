import { useContext } from 'react';
import { BrowserAssistantContext } from './browserAssistantContext.js';

export function useBrowserAssistant() {
  const ctx = useContext(BrowserAssistantContext);
  if (!ctx) {
    throw new Error('useBrowserAssistant must be used within BrowserAssistantProvider');
  }
  return ctx;
}
