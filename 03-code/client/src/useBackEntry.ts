import { useEffect } from 'react';

/**
 * Makes a sub-screen close with the phone/browser back gesture. While the screen is mounted it owns one history
 * entry. The returned function closes the screen from a button by popping that entry, so the back gesture and the
 * buttons share one path (popstate -> onClose) and the history stays clean. The push is guarded so React
 * StrictMode's double effect in dev can't add two entries.
 */
export function useBackEntry(flag: string, onClose: () => void) {
  useEffect(() => {
    if (!history.state?.[flag]) history.pushState({ [flag]: true }, '');
    window.addEventListener('popstate', onClose);
    return () => window.removeEventListener('popstate', onClose);
  }, []);
  return () => { if (history.state?.[flag]) history.back(); else onClose(); };
}
