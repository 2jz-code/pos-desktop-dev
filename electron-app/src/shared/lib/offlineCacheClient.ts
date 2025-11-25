/**
 * Shared offline cache client
 *
 * Provides a consistent pattern for cache-first data loading across all domains.
 * Enforces the rule: try cache → if empty/failure and online → call fetcher → optionally write back to cache.
 */

export interface FetchWithCacheOptions<T, P = any> {
  /** Unique cache key (e.g., 'products', 'categories') */
  cacheKey: string;

  /** Function to retrieve data from SQLite cache */
  cacheFn: (params?: P) => Promise<T>;

  /** Function to fetch data from API */
  fetchFn: (params?: P) => Promise<T>;

  /** Current network online status */
  isOnline: boolean;

  /** Optional parameters to pass to cache/fetch functions */
  params?: P;

  /** Whether to write fetched data back to cache (default: false - only sync service should write) */
  writeBack?: boolean;

  /** Whether to use cache (default: true) */
  useCache?: boolean;

  /** Optional normalizer to transform API response before caching */
  normalize?: (data: T) => any;
}

export interface FetchWithCacheResult<T> {
  /** The retrieved data */
  data: T | null;

  /** Whether data came from cache */
  isFromCache: boolean;

  /** Data source: 'cache' | 'api' | 'none' */
  source: 'cache' | 'api' | 'none';

  /** Error message if any */
  error: string | null;
}

/**
 * Fetches data with cache-first strategy
 *
 * @example
 * const result = await fetchWithCache({
 *   cacheKey: 'products',
 *   cacheFn: () => window.offlineAPI.getCachedProducts(),
 *   fetchFn: () => getProducts(),
 *   isOnline: true
 * });
 */
export async function fetchWithCache<T, P = any>(
  options: FetchWithCacheOptions<T, P>
): Promise<FetchWithCacheResult<T>> {
  const {
    cacheKey,
    cacheFn,
    fetchFn,
    isOnline,
    params,
    writeBack = false,
    useCache = true,
    normalize,
  } = options;

  // Step 1: Try cache first if enabled and API is available
  if (useCache && typeof window !== 'undefined' && window.offlineAPI) {
    try {
      console.log(`📦 [Offline] Loading ${cacheKey} from cache`, params ? `with params:` : '', params || '');

      const cachedData = await cacheFn(params);

      // Check if cache actually has data (not just empty array/null/empty object)
      const hasData = hasValidData(cachedData);

      if (hasData) {
        const count = Array.isArray(cachedData) ? cachedData.length : 'single';
        console.log(`✅ [Offline] Loaded ${count} ${cacheKey} from cache`);

        // Apply normalization to cached data (e.g., hydrate relations)
        let normalizedData = cachedData;
        if (normalize) {
          try {
            normalizedData = await normalize(cachedData);
            console.log(`🔗 [Offline] Normalized ${cacheKey} from cache`);
          } catch (normalizeError) {
            console.warn(`⚠️ [Offline] Failed to normalize ${cacheKey}:`, normalizeError);
            // Use original data if normalization fails
          }
        }

        return {
          data: normalizedData,
          isFromCache: true,
          source: 'cache',
          error: null,
        };
      } else {
        console.log(`⚠️ [Offline] Cache for ${cacheKey} is empty/invalid, will try API if online`);
      }
    } catch (cacheError) {
      console.warn(`⚠️ [Offline] Cache failed for ${cacheKey}, falling back to API:`, cacheError);
      // Fall through to API call
    }
  }

  // Step 2: Fallback to API if cache not available/failed AND we're online
  if (isOnline) {
    try {
      console.log(`🌐 [Online] Loading ${cacheKey} from API`);

      const apiData = await fetchFn(params);

      // Handle different API response formats (paginated vs direct)
      let normalizedData = apiData;

      // First unwrap paginated/wrapped responses if no normalizer provided
      if (!normalize) {
        if (apiData && typeof apiData === 'object' && 'results' in apiData) {
          normalizedData = (apiData as any).results;
        } else if (apiData && typeof apiData === 'object' && 'data' in apiData) {
          normalizedData = (apiData as any).data;
        }
      }

      // Then apply normalization if provided (MUST await - normalizers are async!)
      if (normalize) {
        try {
          normalizedData = await normalize(normalizedData || apiData);
          console.log(`🔗 [Online] Normalized ${cacheKey} from API`);
        } catch (normalizeError) {
          console.warn(`⚠️ [Online] Failed to normalize ${cacheKey}:`, normalizeError);
          // Use unwrapped data if normalization fails
        }
      }

      // Optional: Write back to cache (only sync service should do this)
      if (writeBack && window.offlineAPI?.cacheDataset) {
        try {
          const version = new Date().toISOString();
          await window.offlineAPI.cacheDataset(cacheKey, normalizedData, version);
          console.log(`💾 [Offline] Wrote ${cacheKey} back to cache`);
        } catch (writeError) {
          console.warn(`⚠️ [Offline] Failed to write ${cacheKey} to cache:`, writeError);
          // Don't fail the request just because cache write failed
        }
      }

      return {
        data: normalizedData as T,
        isFromCache: false,
        source: 'api',
        error: null,
      };
    } catch (apiError: any) {
      const errorMsg = apiError?.message || 'Failed to load from API';
      console.error(`❌ [${cacheKey}] Error loading from API:`, apiError);

      return {
        data: null,
        isFromCache: false,
        source: 'none',
        error: errorMsg,
      };
    }
  }

  // Step 3: Offline and cache failed - return error
  console.warn(`📡 [Offline] No cache available for ${cacheKey} and device is offline`);

  return {
    data: null,
    isFromCache: false,
    source: 'none',
    error: `No cached ${cacheKey} available offline`,
  };
}

/**
 * Check if offline API is available in the current environment
 */
export function isOfflineAPIAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.offlineAPI;
}

/**
 * Type guard to check if data is valid (not null/undefined/empty)
 *
 * Treats the following as "no data":
 * - null, undefined
 * - Empty arrays: []
 * - Empty objects: {}
 * - Empty strings: ""
 */
export function hasValidData<T>(data: T | null | undefined): data is T {
  if (data === null || data === undefined) return false;
  if (data === '') return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === 'object' && Object.keys(data).length === 0) return false;
  return true;
}

/**
 * Relation join configuration
 */
export interface RelationConfig {
  /** Field name containing the foreign key (e.g., 'category_id') */
  foreignKey: string;

  /** Target field name to populate (e.g., 'category') */
  targetField: string;

  /** Function to fetch related data by ID */
  fetchRelated: (id: any) => Promise<any>;

  /** Whether this relation is required (log warning if missing) */
  required?: boolean;
}

/**
 * Hydrates relations in cached data by joining with other cached datasets
 *
 * This solves the problem where cached products only have category_id/product_type_id
 * but the UI needs the full category/productType objects.
 *
 * @example
 * const products = await getCachedProducts();
 * const hydrated = await hydrateRelations(products, [
 *   {
 *     foreignKey: 'category_id',
 *     targetField: 'category',
 *     fetchRelated: (id) => window.offlineAPI.getCategoryById(id)
 *   },
 *   {
 *     foreignKey: 'product_type_id',
 *     targetField: 'product_type',
 *     fetchRelated: (id) => window.offlineAPI.getProductTypeById(id)
 *   }
 * ]);
 */
export async function hydrateRelations<T extends Record<string, any>>(
  data: T | T[],
  relations: RelationConfig[]
): Promise<T | T[]> {
  if (!data) return data;

  const isArray = Array.isArray(data);
  const items = isArray ? data : [data];

  const hydratedItems = await Promise.all(
    items.map(async (item) => {
      const hydrated = { ...item };

      for (const relation of relations) {
        const foreignKeyValue = item[relation.foreignKey];

        if (foreignKeyValue) {
          try {
            const relatedData = await relation.fetchRelated(foreignKeyValue);
            if (relatedData) {
              hydrated[relation.targetField] = relatedData;
            } else if (relation.required) {
              console.warn(
                `⚠️ [Hydration] Missing required relation: ${relation.targetField} for ${relation.foreignKey}=${foreignKeyValue}`
              );
            }
          } catch (err) {
            console.error(
              `❌ [Hydration] Failed to fetch ${relation.targetField}:`,
              err
            );
            // Keep the foreign key, don't crash
          }
        }
      }

      return hydrated;
    })
  );

  return isArray ? hydratedItems : hydratedItems[0];
}

/**
 * Creates a normalize function that hydrates relations
 *
 * Use this with createOfflineHook to automatically join relations when loading from cache
 *
 * @example
 * const useOfflineProducts = createOfflineHook({
 *   cacheKey: 'products',
 *   cacheFn: getCachedProducts,
 *   fetchFn: getProducts,
 *   normalize: createRelationNormalizer([
 *     { foreignKey: 'category_id', targetField: 'category', fetchRelated: getCachedCategory },
 *     { foreignKey: 'product_type_id', targetField: 'product_type', fetchRelated: getCachedProductType }
 *   ])
 * });
 */
export function createRelationNormalizer<T extends Record<string, any>>(
  relations: RelationConfig[]
) {
  return async (data: T | T[]): Promise<T | T[]> => {
    return hydrateRelations(data, relations);
  };
}
