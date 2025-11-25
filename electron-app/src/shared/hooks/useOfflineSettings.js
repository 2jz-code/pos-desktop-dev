import { createSimpleOfflineHook } from './createOfflineHook';
import { getGlobalSettings } from '@/domains/settings/services/settingsService';
import apiClient from '@/shared/lib/apiClient';

/**
 * Hook to get settings with offline support
 *
 * Tries to load from local SQLite cache first, falls back to API if cache fails.
 * This enables settings to load instantly without blocking app initialization.
 *
 * IMPORTANT: Cache returns { global_settings, store_location } shape.
 * API fallback must return the same shape to avoid breaking consumers.
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
    // Returns { global_settings, store_location }
    return window.offlineAPI.getCachedSettings();
  },

  fetchFn: async () => {
    // Fetch both global settings and store location to match cache shape
    // This prevents shape mismatch when cache is empty
    const [globalSettings, storeLocations] = await Promise.all([
      getGlobalSettings(),
      apiClient.get('settings/store-locations/').then(res => res.data)
    ]);

    // Return in the same shape as cache
    return {
      global_settings: globalSettings,
      // Use the first location or null (terminal should have a location)
      store_location: storeLocations?.results?.[0] || storeLocations?.[0] || null
    };
  },

  writeBack: false,
});
