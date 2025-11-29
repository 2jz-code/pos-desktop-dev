import { useState, useEffect } from 'react';

/**
 * Hook to detect online/offline network status
 *
 * Uses multiple sources for reliability:
 * 1. Browser's navigator.onLine API and online/offline events
 * 2. Electron IPC network-status-changed events (when running in Electron)
 *
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

    // Listen for browser online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for Electron IPC network status changes (if available)
    let electronCleanup = null;
    if (window.electronAPI?.onNetworkStatusChanged) {
      electronCleanup = window.electronAPI.onNetworkStatusChanged((status) => {
        console.log('🌐 [Network] Electron status changed:', status);
        setIsOnline(status.isOnline);
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      electronCleanup?.();
    };
  }, []);

  return isOnline;
}
