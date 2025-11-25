import { createOfflineHook } from './createOfflineHook';
import { getProducts } from '@/domains/products/services/productService';
import { createRelationNormalizer } from '../lib/offlineCacheClient';
import { getCachedCategoryById, getCachedProductTypeById } from '../lib/offlineRelationHelpers';

/**
 * Hook to get products with offline support
 *
 * Tries to load from local SQLite cache first, falls back to API if cache fails.
 * This enables the products list to work offline.
 *
 * Automatically hydrates category and product_type relations when loading from cache,
 * so UI components can display badges and filter correctly.
 *
 * @param {object} filters - Filters to apply
 * @param {string} filters.search - Search term
 * @param {string} filters.category - Category ID
 * @param {boolean} filters.include_archived - Include archived products
 * @param {object} options - Hook options
 * @param {boolean} options.useCache - Whether to try cache first (default: true)
 * @returns {object} { data: products, loading, error, isFromCache, source, isStale, refetch }
 */
export const useOfflineProducts = createOfflineHook({
  cacheKey: 'products',

  cacheFn: async (filters = {}) => {
    if (!window.offlineAPI?.getCachedProducts) {
      return null;
    }

    // Convert filters to match SQLite expectations
    const cacheFilters = {
      search: filters.search || undefined,
      category: filters.category || undefined,
      includeArchived: filters.include_archived || false,
    };

    return window.offlineAPI.getCachedProducts(cacheFilters);
  },

  fetchFn: async (filters = {}) => {
    const response = await getProducts(filters);
    // Handle paginated response - extract results array
    return response.results || response.data || response;
  },

  // Hydrate category and product_type relations from cache
  // This ensures the UI can display badges and filters work offline
  normalize: createRelationNormalizer([
    {
      foreignKey: 'category_id',
      targetField: 'category',
      fetchRelated: getCachedCategoryById,
      required: false, // Category is optional
    },
    {
      foreignKey: 'product_type_id',
      targetField: 'product_type',
      fetchRelated: getCachedProductTypeById,
      required: true, // Product type is required
    },
  ]),

  // Don't write back - only sync service should update cache
  writeBack: false,
});
