import { createSimpleOfflineHook } from './createOfflineHook';
import apiClient from '@/shared/lib/apiClient';

/**
 * Hook to get taxes with offline support
 *
 * Tries to load from local SQLite cache first, falls back to API if cache fails.
 * This enables the taxes list to work offline.
 *
 * @param {object} options - Hook options
 * @param {boolean} options.useCache - Whether to try cache first (default: true)
 * @returns {object} { data: taxes, loading, error, isFromCache, source, refetch }
 */
export const useOfflineTaxes = createSimpleOfflineHook({
  cacheKey: 'taxes',

  cacheFn: async () => {
    if (!window.offlineAPI?.getCachedTaxes) {
      return null;
    }
    return window.offlineAPI.getCachedTaxes();
  },

  fetchFn: async () => {
    const response = await apiClient.get('/products/taxes/');
    // Handle different response formats
    return response.data?.results || response.data || response;
  },

  writeBack: false,
});
