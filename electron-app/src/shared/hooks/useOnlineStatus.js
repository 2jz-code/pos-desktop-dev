import { useState, useEffect } from 'react';

/**
 * Hook to detect online/offline network status
 *
 * Uses the browser's navigator.onLine API and listens for online/offline events.
 * This helps skip unnecessary API calls when the device is offline.
 *
 * @returns {boolean} isOnline - True if device has network connectivity
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    // Initialize with current status
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    // Update online status when it changes
    const handleOnline = () => {
      console.log('🌐 [Network] Device is online');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('📡 [Network] Device is offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
