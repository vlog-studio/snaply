import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The current time, read again every `stepMs` and whenever the app returns to
 * the foreground. For a read-out counted in coarse units (days left) on a screen
 * that stays mounted: a tab is kept alive across days, and a value read once at
 * mount would keep yesterday's count until something else re-rendered it.
 */
export function useNow(stepMs: number): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, stepMs);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [stepMs]);

  return now;
}
