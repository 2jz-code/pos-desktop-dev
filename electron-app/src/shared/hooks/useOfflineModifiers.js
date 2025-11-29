import { createSimpleOfflineHook } from './createOfflineHook';
import { getModifierSets } from '@/domains/products/services/modifierService';

/**
 * Hook to get modifier sets with offline support
 *
 * Tries to load from local SQLite cache first, falls back to API if cache fails.
 * This enables the modifier sets to work offline in POS.
 *
 * Modifiers are also embedded in product.modifier_sets from the products sync,
 * but this hook provides a way to fetch them independently if needed.
 *
 * @param {object} options - Hook options
 * @param {boolean} options.useCache - Whether to try cache first (default: true)
 * @returns {object} { data: modifierSets, loading, error, isFromCache, source, refetch }
 */
export const useOfflineModifiers = createSimpleOfflineHook({
  cacheKey: 'modifier_sets',

  cacheFn: async () => {
    if (!window.offlineAPI?.getCachedModifierSets) {
      return null;
    }
    return window.offlineAPI.getCachedModifierSets();
  },

  fetchFn: async () => {
    const response = await getModifierSets();
    // Handle different response formats
    return response.results || response.data || response;
  },

  writeBack: false,
});
