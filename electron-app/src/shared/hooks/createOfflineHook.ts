import { useState, useEffect, useCallback } from 'react';
import { fetchWithCache, FetchWithCacheOptions, FetchWithCacheResult } from '../lib/offlineCacheClient';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * Configuration for creating an offline-capable hook
 */
export interface OfflineHookConfig<T, P = any> {
  /** Unique cache key (e.g., 'products', 'categories') */
  cacheKey: string;

  /** Function to retrieve data from SQLite cache */
  cacheFn: (params?: P) => Promise<T>;

  /** Function to fetch data from API */
  fetchFn: (params?: P) => Promise<T>;

  /** Optional normalizer to transform API response */
  normalize?: (data: T) => any;

  /** Whether to write API responses back to cache (default: false) */
  writeBack?: boolean;
}

/**
 * Return type for offline hooks
 */
export interface OfflineHookResult<T> {
  /** The data (null if loading or error) */
  data: T | null;

  /** Loading state */
  loading: boolean;

  /** Error message if any */
  error: string | null;

  /** Whether data came from cache */
  isFromCache: boolean;

  /** Data source: 'cache' | 'api' | 'none' */
  source: 'cache' | 'api' | 'none';

  /** Whether data is stale (cached while fresh data is being fetched) */
  isStale: boolean;

  /** Function to manually refresh data */
  refetch: (options?: RefetchOptions) => void;
}

/**
 * Options for refetch function
 */
export interface RefetchOptions {
  /** Force API call even if cache is available (default: false) */
  forceApi?: boolean;

  /** Keep existing data while loading (set stale flag instead of loading) (default: true) */
  keepStale?: boolean;
}

/**
 * Creates a reusable hook with offline cache-first behavior
 *
 * @example
 * const useOfflineProducts = createOfflineHook({
 *   cacheKey: 'products',
 *   cacheFn: (filters) => window.offlineAPI.getCachedProducts(filters),
 *   fetchFn: (filters) => getProducts(filters),
 * });
 *
 * // Usage in component
 * const { data: products, loading, error, isFromCache } = useOfflineProducts({ category: '123' });
 */
export function createOfflineHook<T, P = any>(
  config: OfflineHookConfig<T, P>
) {
  return function useOfflineData(
    params?: P,
    options: { useCache?: boolean } = {}
  ): OfflineHookResult<T> {
    const { useCache = true } = options;

    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFromCache, setIsFromCache] = useState(false);
    const [source, setSource] = useState<'cache' | 'api' | 'none'>('none');
    const [isStale, setIsStale] = useState(false);
    const [refetchTrigger, setRefetchTrigger] = useState(0);
    const [refetchOptions, setRefetchOptions] = useState<RefetchOptions>({});

    const isOnline = useOnlineStatus();

    const refetch = useCallback((opts: RefetchOptions = {}) => {
      // If offline and forceApi is requested, skip refetch
      if (opts.forceApi && !isOnline) {
        console.warn(`⚠️ [${config.cacheKey}] Cannot force API while offline`);
        return;
      }

      setRefetchOptions(opts);
      setRefetchTrigger(prev => prev + 1);
    }, [isOnline]);

    useEffect(() => {
      let isMounted = true;

      async function loadData() {
        try {
          const { keepStale = true, forceApi = false } = refetchOptions;

          // If keepStale is true and we have data, mark as stale instead of loading
          if (keepStale && data) {
            setIsStale(true);
          } else {
            setLoading(true);
            setIsStale(false);
          }

          setError(null);

          const result: FetchWithCacheResult<T> = await fetchWithCache({
            cacheKey: config.cacheKey,
            cacheFn: config.cacheFn,
            fetchFn: config.fetchFn,
            isOnline,
            params,
            writeBack: config.writeBack,
            useCache: forceApi ? false : useCache, // Skip cache if forceApi
            normalize: config.normalize,
          });

          if (isMounted) {
            setData(result.data);
            setIsFromCache(result.isFromCache);
            setSource(result.source);
            setError(result.error);
            setLoading(false);
            setIsStale(false);
          }
        } catch (err: any) {
          console.error(`❌ [${config.cacheKey}] Unexpected error:`, err);
          if (isMounted) {
            setError(err.message || `Failed to load ${config.cacheKey}`);
            setLoading(false);
            setIsStale(false);
          }
        }
      }

      loadData();

      return () => {
        isMounted = false;
      };
    }, [
      isOnline,
      useCache,
      refetchTrigger,
      // Serialize params to avoid infinite loops from object reference changes
      JSON.stringify(params),
      JSON.stringify(refetchOptions),
    ]);

    return {
      data,
      loading,
      error,
      isFromCache,
      source,
      isStale,
      refetch,
    };
  };
}

/**
 * Simplified version for datasets without parameters
 *
 * @example
 * const useOfflineSettings = createSimpleOfflineHook({
 *   cacheKey: 'settings',
 *   cacheFn: () => window.offlineAPI.getCachedSettings(),
 *   fetchFn: () => getGlobalSettings(),
 * });
 */
export function createSimpleOfflineHook<T>(
  config: OfflineHookConfig<T, void>
) {
  const hook = createOfflineHook(config);

  return function useOfflineData(
    options: { useCache?: boolean } = {}
  ): OfflineHookResult<T> {
    return hook(undefined, options);
  };
}
