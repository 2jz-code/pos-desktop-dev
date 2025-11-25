import { createSimpleOfflineHook } from './createOfflineHook';
import apiClient from '@/shared/lib/apiClient';

/**
 * Hook to get product types with offline support
 *
 * Tries to load from local SQLite cache first, falls back to API if cache fails.
 * This enables the product types list to work offline.
 *
 * @param {object} options - Hook options
 * @param {boolean} options.useCache - Whether to try cache first (default: true)
 * @returns {object} { data: productTypes, loading, error, isFromCache, source, refetch }
 */
export const useOfflineProductTypes = createSimpleOfflineHook({
  cacheKey: 'product-types',

  cacheFn: async () => {
    if (!window.offlineAPI?.getCachedProductTypes) {
      return null;
    }
    return window.offlineAPI.getCachedProductTypes();
  },

  fetchFn: async () => {
    const response = await apiClient.get('/products/product-types/');
    // Handle different response formats
    return response.data?.results || response.data || response;
  },

  writeBack: false,
});
