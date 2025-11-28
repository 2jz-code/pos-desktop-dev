import { useState, useEffect, useCallback, useRef } from "react";
import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Hook to fetch users with offline cache support
 *
 * Strategy:
 * - When online: Try cache first (instant), then API to verify freshness
 * - When offline: Use cache only, never attempt API
 * - Provides refetch({ forceApi: true }) for post-mutation sync
 *
 * @param {Object} options
 * @param {boolean|string} options.includeArchived - false (active only), 'only' (archived only), true (all)
 * @param {boolean} options.enabled - Whether to fetch on mount (default: true)
 * @returns {{ data: Array, loading: boolean, error: Error|null, isFromCache: boolean, refetch: Function }}
 */
export function useOfflineUsers(options = {}) {
	const { includeArchived = false, enabled = true } = options;

	const isOnline = useOnlineStatus();
	const [data, setData] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isFromCache, setIsFromCache] = useState(false);
	const hasFetchedRef = useRef(false);

	const fetchUsers = useCallback(
		async (fetchOptions = {}) => {
			const { forceApi = false } = fetchOptions;

			try {
				setLoading(true);
				setError(null);

				// If forcing API (e.g., after mutation), skip cache and go straight to API
				if (forceApi && isOnline) {
					try {
						const { getUsers } = await import(
							"@/domains/users/services/userService"
						);
						const params = includeArchived ? { include_archived: includeArchived } : {};
						const response = await getUsers(params);
						const apiData = response.data?.results || response.data || [];

						setData(apiData);
						setIsFromCache(false);
						return;
					} catch (apiError) {
						console.error("[useOfflineUsers] Forced API fetch failed:", apiError);
						setError(apiError);
						return;
					}
				}

				// Normal flow: Try cache first, API is fallback only
				try {
					const cached = await window.offlineAPI.getCachedUsers({
						includeArchived,
					});
					if (cached && cached.length > 0) {
						setData(cached);
						setIsFromCache(true);
						return; // Cache succeeded, don't call API
					}
				} catch (cacheError) {
					console.warn("[useOfflineUsers] Cache read failed:", cacheError);
				}

				// Cache failed or empty - fall back to API if online
				if (isOnline) {
					try {
						const { getUsers } = await import(
							"@/domains/users/services/userService"
						);
						const params = includeArchived ? { include_archived: includeArchived } : {};
						const response = await getUsers(params);
						const apiData = response.data?.results || response.data || [];

						setData(apiData);
						setIsFromCache(false);
					} catch (apiError) {
						console.warn("[useOfflineUsers] API fallback failed:", apiError);
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
			fetchUsers();
		}
	}, [enabled, includeArchived]); // Don't include fetchUsers to avoid infinite loops

	return {
		data,
		loading,
		error,
		isFromCache,
		refetch: fetchUsers,
	};
}
