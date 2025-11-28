import { useState, useEffect, useCallback } from "react";
import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Hook to fetch discounts with offline cache support
 *
 * Strategy:
 * - Try cache first (instant), API is fallback only
 * - Provides refetch({ forceApi: true }) for post-mutation sync
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Whether to fetch on mount (default: true)
 * @param {string} options.includeArchived - 'only' for archived only, true for all, false for active only
 * @returns {{ data: Array, loading: boolean, error: Error|null, isFromCache: boolean, refetch: Function }}
 */
export function useOfflineDiscounts(options = {}) {
	const { enabled = true, includeArchived = false } = options;

	const isOnline = useOnlineStatus();
	const [data, setData] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isFromCache, setIsFromCache] = useState(false);

	const fetchDiscounts = useCallback(
		async (fetchOptions = {}) => {
			const { forceApi = false } = fetchOptions;

			try {
				setLoading(true);
				setError(null);

				// Build API params
				const params = includeArchived === "only"
					? { include_archived: "only" }
					: includeArchived
						? { include_archived: "true" }
						: {};

				// If forcing API (e.g., after mutation), skip cache and go straight to API
				if (forceApi && isOnline) {
					try {
						const { getDiscounts } = await import(
							"@/domains/discounts/services/discountService"
						);
						const response = await getDiscounts(params);
						const apiData = response?.results || response || [];

						setData(apiData);
						setIsFromCache(false);
						return;
					} catch (apiError) {
						console.error("[useOfflineDiscounts] Forced API fetch failed:", apiError);
						setError(apiError);
						return;
					}
				}

				// Normal flow: Try cache first, API is fallback only
				try {
					const cached = await window.offlineAPI.getCachedDiscounts({ includeArchived });
					if (cached && cached.length > 0) {
						setData(cached);
						setIsFromCache(true);
						return; // Cache succeeded, don't call API
					}
				} catch (cacheError) {
					console.warn("[useOfflineDiscounts] Cache read failed:", cacheError);
				}

				// Cache failed or empty - fall back to API if online
				if (isOnline) {
					try {
						const { getDiscounts } = await import(
							"@/domains/discounts/services/discountService"
						);
						const response = await getDiscounts(params);
						const apiData = response?.results || response || [];

						setData(apiData);
						setIsFromCache(false);
					} catch (apiError) {
						console.warn("[useOfflineDiscounts] API fallback failed:", apiError);
						setError(apiError);
					}
				}
			} finally {
				setLoading(false);
			}
		},
		[isOnline, includeArchived]
	);

	// Auto-fetch on mount and when includeArchived changes
	useEffect(() => {
		if (enabled) {
			fetchDiscounts();
		}
	}, [enabled, includeArchived]);

	return {
		data,
		loading,
		error,
		isFromCache,
		refetch: fetchDiscounts,
	};
}
