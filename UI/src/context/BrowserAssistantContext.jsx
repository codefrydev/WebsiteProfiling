import { useCallback, useMemo, useState } from 'react';
import { BrowserAssistantContext } from './browserAssistantContext.js';

export function BrowserAssistantProvider({ children }) {
  const [focusLink, setFocusLink] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const openAssistant = useCallback((link = null) => {
    if (link != null) setFocusLink(link);
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const value = useMemo(
    () => ({
      focusLink,
      setFocusLink,
      panelOpen,
      setPanelOpen,
      openAssistant,
      closePanel,
    }),
    [focusLink, panelOpen, openAssistant, closePanel]
  );

  return <BrowserAssistantContext.Provider value={value}>{children}</BrowserAssistantContext.Provider>;
}
