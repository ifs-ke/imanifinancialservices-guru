// src/hooks/useOffline.ts
import { useState, useEffect } from 'react';

/**
 * useOffline hook provides real-time detection of browser network connectivity.
 * Conforms to Next.js useOffline specifications and browser navigator.onLine standards.
 *
 * @returns {boolean} true when the user is offline, false when online.
 */
export function useOffline(): boolean {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !window.navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOffline(!window.navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOffline;
}

/**
 * Convenience hook returning true when the browser is online.
 *
 * @returns {boolean} true when the user is online.
 */
export function useOnlineStatus(): boolean {
  return !useOffline();
}

export default useOffline;
