import { createSimpleOfflineHook } from './createOfflineHook';
import { getGlobalSettings } from '@/domains/settings/services/settingsService';
import apiClient from '@/shared/lib/apiClient';
import terminalRegistrationService from '@/services/TerminalRegistrationService';

/**
 * Hook to get settings with offline support
 *
 * Tries to load from local SQLite cache first, falls back to API if cache fails.
 * This enables settings to load instantly without blocking app initialization.
 *
 * Cache and API return the same shape:
 * {
 *   global_settings: Tenant-wide settings (brand, currency, surcharge, etc.)
 *   store_location: Location-specific settings (address, tax rate, receipts, etc.)
 *   printers: Network printers configured for this location
 *   kitchen_zones: Kitchen zones with category routing for this location
 *   terminal: This terminal's registration settings (offline limits, reader, etc.)
 * }
 *
 * @param {object} options - Hook options
 * @param {boolean} options.useCache - Whether to try cache first (default: true)
 * @returns {object} { data: settings, loading, error, isFromCache, source, refetch }
 */
export const useOfflineSettings = createSimpleOfflineHook({
  cacheKey: 'settings',

  cacheFn: async () => {
    if (!window.offlineAPI?.getCachedSettings) {
      return null;
    }
    // Returns { global_settings, store_location, printers, kitchen_zones, terminal }
    return window.offlineAPI.getCachedSettings();
  },

  fetchFn: async () => {
    // Fetch all settings data to match cache shape
    // The backend sync provides a unified settings endpoint, but for API fallback
    // we need to aggregate from multiple endpoints
    const locationId = terminalRegistrationService.getLocationId();

    const [globalSettings, storeLocation, printers, kitchenZones, terminalReg] = await Promise.all([
      getGlobalSettings(),
      locationId
        ? apiClient.get(`settings/store-locations/${locationId}/`).then(res => res.data)
        : null,
      locationId
        ? apiClient.get(`settings/printers/?location=${locationId}`).then(res => res.data?.results || res.data || [])
        : [],
      locationId
        ? apiClient.get(`settings/kitchen-zones/?location=${locationId}`).then(res => res.data?.results || res.data || [])
        : [],
      terminalRegistrationService.getDeviceId()
        ? apiClient.get(`terminals/registrations/?device_id=${terminalRegistrationService.getDeviceId()}`).then(res => {
            const results = res.data?.results || res.data || [];
            return results[0] || null;
          })
        : null,
    ]);

    // Return in the same shape as cache
    return {
      global_settings: globalSettings,
      store_location: storeLocation,
      printers: printers,
      kitchen_zones: kitchenZones,
      terminal: terminalReg,
    };
  },

  writeBack: false,
});
