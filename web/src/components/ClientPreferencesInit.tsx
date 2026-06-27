import { useEffect, type ReactNode } from 'react';
import { initClientPreferences } from '@/lib/clientPreferences';

/** Loads client_preferences from DB once at app startup (localStorage uplift included). */
export default function ClientPreferencesInit(): ReactNode {
  useEffect(() => {
    void initClientPreferences();
  }, []);
  return null;
}
