import { useEffect, useState } from 'react';

export type Appearance = 'light' | 'night';

export function useAppearancePreference(storageKey: string) {
  const [appearance, setAppearance] = useState<Appearance>('light');

  useEffect(() => {
    try {
      setAppearance(localStorage.getItem(storageKey) === 'night' ? 'night' : 'light');
    } catch {
    }
  }, [storageKey]);

  function changeAppearance(next: Appearance) {
    setAppearance(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
    }
  }

  return [appearance, changeAppearance] as const;
}
