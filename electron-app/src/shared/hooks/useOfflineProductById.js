import { createOfflineHook } from './createOfflineHook';
import { getProductById } from '@/domains/products/services/productService';
import { createRelationNormalizer } from '@/shared/lib/offlineCacheClient';
import { getCachedCategoryById, getCachedProductTypeById } from '@/shared/lib/offlineRelationHelpers';

/**
 * Hook for fetching a single product by ID with offline support
 *
 * @param {number} productId - The product ID to fetch
 * @param {Object} options - Hook options
 * @param {boolean} options.useCache - Whether to use cache (default: true)
 * @returns {Object} - { data, loading, error, isFromCache, source, isStale, refetch }
 *
 * @example
 * const { data: product, loading, refetch } = useOfflineProductById(76);
 *
 * // After mutation
 * await updateProduct(76, changes);
 * refetch({ forceApi: true }); // Force refresh from API
 */
export const useOfflineProductById = createOfflineHook({
	cacheKey: 'product',
	cacheFn: async (productId) => {
		if (!productId) return null;
		return await window.offlineAPI.getProductById(productId);
	},
	fetchFn: async (productId) => {
		if (!productId) return null;
		const response = await getProductById(productId);
		return response.data;
	},
	normalize: createRelationNormalizer([
		{
			foreignKey: 'category_id',
			targetField: 'category',
			fetchRelated: getCachedCategoryById,
			required: false, // Some products may be uncategorized
		},
		{
			foreignKey: 'product_type_id',
			targetField: 'product_type',
			fetchRelated: getCachedProductTypeById,
			required: true, // All products must have a product type
		},
	]),
	writeBack: false,
});
