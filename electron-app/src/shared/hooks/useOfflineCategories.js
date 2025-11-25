import { createSimpleOfflineHook } from './createOfflineHook';
import { getCategories } from '@/domains/products/services/categoryService';

/**
 * Hook to get categories with offline support
 *
 * Tries to load from local SQLite cache first, falls back to API if cache fails.
 * This enables the categories list to work offline.
 *
 * @param {object} options - Hook options
 * @param {boolean} options.useCache - Whether to try cache first (default: true)
 * @returns {object} { data: categories, loading, error, isFromCache, source, refetch }
 */
export const useOfflineCategories = createSimpleOfflineHook({
  cacheKey: 'categories',

  cacheFn: async () => {
    if (!window.offlineAPI?.getCachedCategories) {
      return null;
    }
    return window.offlineAPI.getCachedCategories();
  },

  fetchFn: async () => {
    const response = await getCategories();
    // Handle different response formats
    return response.results || response.data || response;
  },

  writeBack: false,
});
