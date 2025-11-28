import { useState, useEffect, useCallback } from "react";
import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Hook to fetch inventory locations with offline cache support
 *
 * Strategy:
 * - Try cache first (instant), API is fallback only
 * - Provides refetch({ forceApi: true }) for post-mutation sync
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Whether to fetch on mount (default: true)
 * @returns {{ data: Array, loading: boolean, error: Error|null, isFromCache: boolean, refetch: Function }}
 */
export function useOfflineInventoryLocations(options = {}) {
	const { enabled = true } = options;

	const isOnline = useOnlineStatus();
	const [data, setData] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isFromCache, setIsFromCache] = useState(false);

	const fetchLocations = useCallback(
		async (fetchOptions = {}) => {
			const { forceApi = false } = fetchOptions;

			try {
				setLoading(true);
				setError(null);

				// If forcing API (e.g., after mutation), skip cache and go straight to API
				if (forceApi && isOnline) {
					try {
						const { getLocations } = await import(
							"@/domains/inventory/services/inventoryService"
						);
						const response = await getLocations();
						const apiData = response?.results || response || [];

						setData(apiData);
						setIsFromCache(false);
						return;
					} catch (apiError) {
						console.error("[useOfflineInventoryLocations] Forced API fetch failed:", apiError);
						setError(apiError);
						return;
					}
				}

				// Normal flow: Try cache first, API is fallback only
				try {
					const cached = await window.offlineAPI.getCachedInventoryLocations();
					if (cached && cached.length > 0) {
						setData(cached);
						setIsFromCache(true);
						return; // Cache succeeded, don't call API
					}
				} catch (cacheError) {
					console.warn("[useOfflineInventoryLocations] Cache read failed:", cacheError);
				}

				// Cache failed or empty - fall back to API if online
				if (isOnline) {
					try {
						const { getLocations } = await import(
							"@/domains/inventory/services/inventoryService"
						);
						const response = await getLocations();
						const apiData = response?.results || response || [];

						setData(apiData);
						setIsFromCache(false);
					} catch (apiError) {
						console.warn("[useOfflineInventoryLocations] API fallback failed:", apiError);
						setError(apiError);
					}
				}
			} finally {
				setLoading(false);
			}
		},
		[isOnline]
	);

	// Auto-fetch on mount
	useEffect(() => {
		if (enabled) {
			fetchLocations();
		}
	}, [enabled]);

	return {
		data,
		loading,
		error,
		isFromCache,
		refetch: fetchLocations,
	};
}
